import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCycleDocuments } from "./studentCycleDocuments.ts";
import { planAutoStages, type AutoStagePlan, type AutoStageTracker } from "./autoStages.ts";
import type { DashboardStageDef, DashboardStageValues } from "./dashboardPipeline.ts";

// Relative imports with their extension, and no "@/": the backfill script
// (scripts/backfill-auto-stages.mjs) loads this under plain Node, so that what
// it reports is the plan the app itself would act on, not a copy of it.

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
}

/**
 * What planAutoStages would move for one student, from their whole record:
 * their countries' status bars, their applications, their current intake's
 * documents and each country's documentation tracker. Reads only.
 *
 * `admin` is a service-role client — the stages are written on behalf of
 * people who may not read all of this themselves (see syncStudentStages).
 */
export async function planStudentStages(admin: SupabaseClient, studentId: string): Promise<AutoStagePlan> {
  const [{ data: countryRows }, { data: appRows }, cycle] = await Promise.all([
    admin
      .from("lead_destinations")
      .select("destination_id, dashboard_stage_values, destination:destinations(country_code, dashboard_pipeline_stages)")
      .eq("lead_id", studentId),
    admin
      .from("applications")
      .select("id, current_stage, is_finalized, created_at, university:universities(destination:destinations(id, country_code, pipeline_stages))")
      .eq("student_id", studentId)
      .order("created_at", { ascending: true }),
    loadCycleDocuments(admin, studentId),
  ]);

  const applications = (appRows ?? []).map((a) => {
    const uni = one(a.university as never) as { destination?: unknown } | null;
    const dest = one(uni?.destination as never) as { id?: string; country_code?: string; pipeline_stages?: string[] } | null;
    return {
      id: a.id as string,
      destinationId: dest?.id ?? null,
      countryCode: dest?.country_code ?? null,
      stage: (a.current_stage as string | null) ?? null,
      pipeline: dest?.pipeline_stages ?? [],
      finalized: Boolean(a.is_finalized),
    };
  });

  const countries = (countryRows ?? []).map((r) => {
    const d = one(r.destination as never) as { country_code?: string; dashboard_pipeline_stages?: DashboardStageDef[] } | null;
    return {
      destinationId: r.destination_id as string,
      countryCode: d?.country_code ?? null,
      stages: d?.dashboard_pipeline_stages ?? [],
      values: ((r.dashboard_stage_values as DashboardStageValues | null) ?? {}) as DashboardStageValues,
    };
  });

  // The documentation tracker: one per country, its values held on the
  // country's earliest application (0162, 0163).
  const destinationIds = [...new Set([...countries.map((c) => c.destinationId), ...applications.map((a) => a.destinationId)].filter(Boolean))] as string[];
  const codeOf = new Map<string, string | null>();
  for (const c of countries) codeOf.set(c.destinationId, c.countryCode);
  for (const a of applications) if (a.destinationId && !codeOf.get(a.destinationId)) codeOf.set(a.destinationId, a.countryCode);
  const anchorOf = new Map<string, string>();
  for (const a of applications) if (a.destinationId && !anchorOf.has(a.destinationId)) anchorOf.set(a.destinationId, a.id);
  const codes = [...new Set([...codeOf.values()].filter(Boolean))] as string[];
  const anchors = [...anchorOf.values()];
  const [{ data: defs }, { data: extras }] = await Promise.all([
    codes.length
      ? admin.from("tracker_definitions").select("country_code, field_key, label, field_type, visa_role, is_appointment").in("country_code", codes)
      : Promise.resolve({ data: [] as never[] }),
    anchors.length
      ? admin.from("application_country_extra").select("application_id, field_key, field_value").in("application_id", anchors)
      : Promise.resolve({ data: [] as never[] }),
  ]);
  const trackers: AutoStageTracker[] = destinationIds.map((destinationId) => {
    const code = codeOf.get(destinationId);
    const anchor = anchorOf.get(destinationId);
    const values: Record<string, string> = {};
    for (const e of extras ?? []) if (e.application_id === anchor) values[e.field_key as string] = (e.field_value as string | null) ?? "";
    return {
      destinationId,
      fields: (defs ?? [])
        .filter((f) => f.country_code === code)
        .map((f) => ({
          key: f.field_key as string,
          label: f.label as string,
          type: f.field_type as string,
          visaRole: (f.visa_role as "outcome" | "outcome_reason" | null) ?? null,
          isAppointment: Boolean(f.is_appointment),
        })),
      values,
    };
  });

  return planAutoStages({
    countries,
    applications,
    documents: cycle.docs.map((d) => ({ category: d.category ?? null, status: d.status, applicationId: d.application_id ?? null })),
    trackers,
  });
}

/**
 * Writes a plan: each country's status bar, and each application's stage only
 * if it still sits where the plan found it, so a stage somebody changed a
 * moment ago is not overwritten. Never throws; what failed is logged.
 */
export async function writeStagePlan(
  admin: SupabaseClient,
  studentId: string,
  plan: AutoStagePlan
): Promise<{ countries: number; applications: number }> {
  let movedCountries = 0;
  for (const c of plan.countries) {
    const { error } = await admin
      .from("lead_destinations")
      .update({ dashboard_stage_values: c.values })
      .eq("lead_id", studentId)
      .eq("destination_id", c.destinationId);
    if (error) console.error("[syncStudentStages] country", { studentId, destinationId: c.destinationId, message: error.message });
    else movedCountries += 1;
  }
  let movedApps = 0;
  for (const a of plan.applications) {
    let query = admin.from("applications").update({ current_stage: a.to }).eq("id", a.id);
    query = a.from === null ? query.is("current_stage", null) : query.eq("current_stage", a.from);
    const { data, error } = await query.select("id");
    if (error) console.error("[syncStudentStages] application", { studentId, applicationId: a.id, message: error.message });
    else movedApps += data?.length ?? 0;
  }
  return { countries: movedCountries, applications: movedApps };
}
