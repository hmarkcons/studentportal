import { createAdminClient } from "@/lib/supabase/admin";
import { planStudentStages, writeStagePlan } from "@/lib/autoStagesLoad";
import { planFinalizedUndo } from "@/lib/finalizedStage";

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
}

/**
 * Brings a student's application stages and country status bars up to date
 * with what is on record — the rules are in autoStages.ts, and only ever
 * move things forward.
 *
 * Called after anything that can move a stage: a document uploaded, approved
 * or removed, a university's letter filed, an application's stage changed or
 * finalised, the visa tracker saved, a partner university's letter or stage.
 * It works from the whole record rather than from what just changed, so a
 * call that was missed is caught up by the next one.
 *
 * Written with the service role: the person whose action set this off may be
 * a student or a partner university, who may not write stages, and 0276's
 * guard lets a write through without a signed-in user for exactly this. The
 * application is only moved if it still sits where the plan found it, so a
 * stage somebody changed a moment ago is not overwritten.
 *
 * Never fails the action that called it: a stage left behind is caught up
 * next time, and an upload that reported failure because a stage could not
 * move would be a lie. What happened is logged.
 */
export async function syncStudentStages(studentId: string): Promise<{ countries: number; applications: number }> {
  try {
    const admin = createAdminClient();
    // Read, planned and written by autoStagesLoad.ts, which the backfill
    // script shares so that its dry run is this very plan.
    return await writeStagePlan(admin, studentId, await planStudentStages(admin, studentId));
  } catch (e) {
    console.error("[syncStudentStages] failed", { studentId, message: e instanceof Error ? e.message : String(e) });
    return { countries: 0, applications: 0 };
  }
}

/**
 * Takes the finalized step — Pre-Enrolled, University Finalized — off wherever
 * no university is finalized any more: after one is un-finalized, or its
 * application deleted. The application goes back to the stage before it, and
 * the country's bar loses the step. See planFinalizedUndo for why this one
 * step goes backwards when nothing else the rules set ever does.
 *
 * Service role and never failing the caller, as syncStudentStages; an
 * application is only moved if it still sits on the step.
 */
export async function clearFinalizedStages(studentId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const [{ data: apps }, { data: countries }] = await Promise.all([
      admin
        .from("applications")
        .select("id, current_stage, is_finalized, university:universities(destination:destinations(id, pipeline_stages))")
        .eq("student_id", studentId),
      admin.from("lead_destinations").select("destination_id, dashboard_stage_values").eq("lead_id", studentId),
    ]);
    const plan = planFinalizedUndo(
      (apps ?? []).map((a) => {
        const uni = one(a.university as never) as { destination?: unknown } | null;
        const dest = one(uni?.destination as never) as { id?: string; pipeline_stages?: string[] } | null;
        return {
          id: a.id as string,
          destinationId: dest?.id ?? null,
          stage: (a.current_stage as string | null) ?? null,
          pipeline: dest?.pipeline_stages ?? [],
          finalized: Boolean(a.is_finalized),
        };
      }),
      (countries ?? []).map((c) => ({
        destinationId: c.destination_id as string,
        values: ((c.dashboard_stage_values as Record<string, string> | null) ?? {}) as Record<string, string>,
      }))
    );
    const results = await Promise.all([
      ...plan.applications.map((a) =>
        admin.from("applications").update({ current_stage: a.to }).eq("id", a.id).eq("current_stage", a.from)
      ),
      ...plan.countries.map((c) =>
        admin
          .from("lead_destinations")
          .update({ dashboard_stage_values: c.values })
          .eq("lead_id", studentId)
          .eq("destination_id", c.destinationId)
      ),
    ]);
    for (const r of results) if (r.error) console.error("[clearFinalizedStages] write failed", { studentId, message: r.error.message });
  } catch (e) {
    console.error("[clearFinalizedStages] failed", { studentId, message: e instanceof Error ? e.message : String(e) });
  }
}

/** syncStudentStages for whoever an application belongs to. */
export async function syncStagesForApplication(applicationId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("applications").select("student_id").eq("id", applicationId).maybeSingle();
  if (data?.student_id) await syncStudentStages(data.student_id as string);
}

/** syncStudentStages for whoever a document belongs to. */
export async function syncStagesForDocument(documentId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("student_documents").select("student_id").eq("id", documentId).maybeSingle();
  if (data?.student_id) await syncStudentStages(data.student_id as string);
}
