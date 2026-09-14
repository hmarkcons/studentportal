"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  GHOST_CHASE_SOURCE,
  chaseDueDate,
  chaseTaskDescription,
  chaseTaskTitle,
  karachiToday,
} from "@/lib/chaseTask";

/**
 * Opens a chase task on the counsellor's list when a student goes quiet.
 *
 * Runs as the service role, like the other bookkeeping in this codebase. The
 * personal_tasks policies are owner-or-management, and the person marking a
 * student ghosted is very often neither the assigned counsellor nor a manager
 * — a processing officer closing off a stalled file, say. Under their own
 * session the insert would simply be refused, and the counsellor would never
 * learn their student had gone quiet.
 *
 * Quiet on failure by design: marking a student ghosted must not fail because
 * a follow-up task could not be raised. The status is the record; the task is
 * a courtesy on top of it.
 */
export async function openGhostChaseTask(studentId: string): Promise<{ created: boolean; reason?: string }> {
  const admin = createAdminClient();

  const { data: student } = await admin
    .from("leads")
    .select("id, full_name, assigned_counselor_id, registration_status")
    .eq("id", studentId)
    .maybeSingle();
  if (!student) return { created: false, reason: "no such student" };
  // Guards against a stale call — only a student who is actually ghosted right
  // now should be chased.
  if (student.registration_status !== "ghost") return { created: false, reason: "not ghosted" };

  // Whoever holds the student. With nobody assigned there is no list to put
  // this on — personal_tasks.owner_id is NOT NULL and guessing an owner would
  // drop a stranger's student onto somebody's calendar. The dashboard already
  // says loudly when a student has no counsellor, which is the thing to fix.
  const ownerId = student.assigned_counselor_id as string | null;
  if (!ownerId) return { created: false, reason: "no counsellor assigned" };

  // Still on the staff list and active, or the task lands where nobody looks.
  const { data: owner } = await admin.from("staff").select("id, status").eq("id", ownerId).maybeSingle();
  if (!owner || owner.status !== "active") return { created: false, reason: "counsellor is not active" };

  const today = karachiToday();
  const { error } = await admin.from("personal_tasks").insert({
    owner_id: ownerId,
    student_id: studentId,
    source: GHOST_CHASE_SOURCE,
    title: chaseTaskTitle(student.full_name),
    description: chaseTaskDescription(student.full_name, today),
    due_date: chaseDueDate(today) || today,
    priority: "urgent",
    status: "pending",
  });

  // 23505 is the one-open-chase-per-student index: there is already a task
  // waiting, which is the correct outcome, not a failure.
  if (error) {
    if (error.code === "23505") return { created: false, reason: "already being chased" };
    return { created: false, reason: error.message };
  }
  return { created: true };
}

/**
 * Closes any open chase task, because the student is back.
 *
 * Marked done rather than deleted: the counsellor's calendar should show that
 * the chase happened and ended, and a task that vanishes leaves them wondering
 * whether they imagined it.
 */
export async function closeGhostChaseTasks(studentId: string): Promise<{ closed: number }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("personal_tasks")
    .update({ status: "done" })
    .eq("student_id", studentId)
    .eq("source", GHOST_CHASE_SOURCE)
    .eq("status", "pending")
    .select("id");
  if (error) return { closed: 0 };
  return { closed: (data ?? []).length };
}
