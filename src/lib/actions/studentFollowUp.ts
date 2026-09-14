"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { SYSTEM_TASK_SOURCES, karachiToday, planFollowUp } from "@/lib/followUpTasks";

/**
 * Brings the student's follow-up task into line with their status.
 *
 * One function for every transition, rather than a hook per status: ghosted
 * then withdrawn has to close the chase and open the win-back, withdrawn then
 * registered has to close the win-back, and a student marked ghosted twice
 * must not end up with two tasks. Working it out from the status as it now
 * stands is the only version of this that cannot drift.
 *
 * Runs as the service role, like the other bookkeeping here. The
 * personal_tasks policies are owner-or-management, and the person changing a
 * student's status is very often neither the assigned counsellor nor a manager
 * — a processing officer closing off a stalled file, say. Under their own
 * session the insert would simply be refused, and the counsellor would never
 * learn their student had stopped.
 *
 * Quiet on failure by design: a status change must not fail because a courtesy
 * task could not be raised. The status is the record; the task sits on top.
 */
export async function syncStudentFollowUpTask(
  studentId: string
): Promise<{ opened: string | null; closed: number; reason?: string }> {
  const admin = createAdminClient();

  const { data: student } = await admin
    .from("leads")
    .select("id, full_name, assigned_counselor_id, registration_status")
    .eq("id", studentId)
    .maybeSingle();
  if (!student) return { opened: null, closed: 0, reason: "no such student" };

  const plan = planFollowUp(student.registration_status, student.full_name, karachiToday());

  // Anything that is no longer the right task goes, including the previous
  // kind when a student moves from ghosted to withdrawn.
  const stale = SYSTEM_TASK_SOURCES.filter((s) => s !== plan?.source);
  let closed = 0;
  if (stale.length > 0) {
    const { data } = await admin
      .from("personal_tasks")
      .update({ status: "done" })
      .eq("student_id", studentId)
      .in("source", stale)
      .eq("status", "pending")
      .select("id");
    closed = (data ?? []).length;
  }

  if (!plan) return { opened: null, closed };

  // Whoever holds the student. With nobody assigned there is no list to put
  // this on — personal_tasks.owner_id is NOT NULL, and guessing an owner would
  // drop a stranger's student onto somebody's calendar. The dashboard already
  // says loudly when a student has no counsellor, which is the thing to fix.
  const ownerId = student.assigned_counselor_id as string | null;
  if (!ownerId) return { opened: null, closed, reason: "no counsellor assigned" };

  // Still on the staff list and active, or the task lands where nobody looks.
  const { data: owner } = await admin.from("staff").select("id, status").eq("id", ownerId).maybeSingle();
  if (!owner || owner.status !== "active") return { opened: null, closed, reason: "counsellor is not active" };

  const { error } = await admin.from("personal_tasks").insert({
    owner_id: ownerId,
    student_id: studentId,
    source: plan.source,
    title: plan.title,
    description: plan.description,
    due_date: plan.dueDate,
    priority: plan.priority,
    status: "pending",
  });

  // 23505 is the one-open-task-per-student-per-kind index: there is already
  // one waiting, which is the correct outcome rather than a failure.
  if (error) {
    if (error.code === "23505") return { opened: null, closed, reason: "already open" };
    return { opened: null, closed, reason: error.message };
  }
  return { opened: plan.source, closed };
}
