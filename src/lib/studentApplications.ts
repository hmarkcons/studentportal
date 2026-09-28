import type { SupabaseClient } from "@supabase/supabase-js";
import type { DashboardStageDef } from "@/lib/dashboardPipeline";
import type { ProgramRound } from "@/lib/programRounds";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export type StudentDestination = {
  id?: string;
  display_name?: string;
  pipeline_stages?: string[];
  dashboard_pipeline_stages?: DashboardStageDef[];
};

export type StudentApplication = {
  app: { id: string; current_stage: string | null; intake: string | null; round_id: string | null; is_finalized: boolean | null };
  uni: { name?: string } | null;
  dest: StudentDestination | null;
  program: { name?: string; rounds?: ProgramRound[] } | null;
};

/**
 * A student's applications with their university, destination pipeline and
 * programme rounds — read once, the same way, for the dashboard's summary and
 * the Applications page's cards, so the two cannot count differently.
 */
export async function loadStudentApplications(supabase: SupabaseClient, studentId: string): Promise<StudentApplication[]> {
  const { data } = await supabase
    .from("applications")
    .select(
      "id, current_stage, intake, round_id, is_finalized, university:universities(name, destination:destinations(id, display_name, pipeline_stages, dashboard_pipeline_stages)), program:programs(name, rounds:program_intake_rounds(id, label, start_date, application_deadline, sort_order))"
    )
    .eq("student_id", studentId)
    .order("created_at", { ascending: true });
  return (data ?? []).map((a) => {
    const uni = one(a.university as never) as { name?: string; destination?: unknown } | null;
    const dest = uni?.destination ? (one(uni.destination as never) as StudentDestination | null) : null;
    const program = one(a.program as never) as StudentApplication["program"];
    return {
      app: { id: a.id, current_stage: a.current_stage, intake: a.intake, round_id: a.round_id, is_finalized: a.is_finalized },
      uni: uni ? { name: uni.name } : null,
      dest,
      program,
    };
  });
}

export type DestinationProgressRow = {
  destinationId: string;
  destinationName: string;
  applicationSummary: string;
  stages: DashboardStageDef[];
  values: Record<string, string>;
};

/**
 * One progress card per country — each the student has an application to, or
 * chose at registration with none yet — in the grouping the staff Dashboard
 * uses. Read-only for the student.
 */
export async function destinationProgressRows(
  supabase: SupabaseClient,
  studentId: string,
  apps: readonly StudentApplication[]
): Promise<DestinationProgressRow[]> {
  const { data: leadDestinations } = await supabase
    .from("lead_destinations")
    .select("destination_id, dashboard_stage_values, destination:destinations(display_name, dashboard_pipeline_stages)")
    .eq("lead_id", studentId);

  const saved = new Map<string, Record<string, string>>(
    (leadDestinations ?? []).map((sd) => [sd.destination_id, (sd.dashboard_stage_values as Record<string, string> | null) ?? {}])
  );
  const groups = new Map<string, { destinationName: string; stages: DashboardStageDef[]; universityNames: string[] }>();
  for (const { uni, dest } of apps) {
    if (!dest?.id) continue;
    if (!groups.has(dest.id)) {
      groups.set(dest.id, { destinationName: dest.display_name ?? "Destination", stages: dest.dashboard_pipeline_stages ?? [], universityNames: [] });
    }
    groups.get(dest.id)!.universityNames.push(uni?.name ?? "University");
  }
  for (const sd of leadDestinations ?? []) {
    if (groups.has(sd.destination_id)) continue;
    const dest = one(sd.destination as never) as { display_name?: string; dashboard_pipeline_stages?: DashboardStageDef[] } | null;
    if (!dest) continue;
    groups.set(sd.destination_id, { destinationName: dest.display_name ?? "Destination", stages: dest.dashboard_pipeline_stages ?? [], universityNames: [] });
  }
  return [...groups.entries()]
    .filter(([, g]) => g.stages.length > 0)
    .map(([destinationId, g]) => ({
      destinationId,
      destinationName: g.destinationName,
      applicationSummary:
        g.universityNames.length === 0
          ? "No application yet"
          : g.universityNames.length === 1
            ? g.universityNames[0]
            : `${g.universityNames.length} applications`,
      stages: g.stages,
      values: saved.get(destinationId) ?? {},
    }));
}
