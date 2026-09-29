import { createAdminClient } from "@/lib/supabase/admin";
import { planStudentStages, writeStagePlan } from "@/lib/autoStagesLoad";

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
