"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import { getStaffSession } from "@/lib/auth/session";
import { visaOutcomes } from "@/lib/studentVisaApproval";
import { recommendRestart, type Cycle, type DeadlineEvidence, type RestartRecommendation } from "@/lib/intakeCycle";
import { isIntakeMode, type IntakeMode } from "@/lib/intake";
import { ensureCurrentCycle, ensureCurrentCycleId } from "@/lib/ensureCycle";
import { ensureCommissionForStudent } from "@/lib/actions/commissionAuto";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export type RestartContext = {
  /** Why this student may be started again, in the office's words. */
  eligibility: { reason: "visa_refused" | "ghost" | "withdrawn"; detail: string } | null;
  cycles: Cycle[];
  currentIntake: string;
  mode: IntakeMode;
  options: string[];
  recommendation: RestartRecommendation;
  deadlines: DeadlineEvidence[];
};

/**
 * Everything the "start again" panel needs.
 *
 * Read in one place rather than in the panel, because the eligibility question
 * — was this student refused, ghosted or withdrawn — has to be answered from
 * the same field the Visa tab reads, and the recommendation has to be built
 * from deadlines the office can actually see on the page.
 */
export async function loadRestartContext(studentId: string): Promise<RestartContext> {
  const supabase = await createClient();
  // A student registered after 0180 has no cycle yet. Their first one has to
  // exist before a second can be opened, or the first attempt's applications
  // would belong to no intake at all.
  await ensureCurrentCycleId(studentId);

  const [{ data: student }, { data: cycleRows }, { data: destRows }, { data: apps }] = await Promise.all([
    supabase.from("leads").select("intake, registration_status, status").eq("id", studentId).maybeSingle(),
    supabase
      .from("student_cycles")
      .select("id, sequence, intake, is_current, reason, decision")
      .eq("student_id", studentId)
      .order("sequence"),
    supabase
      .from("lead_destinations")
      .select("is_backup, destination:destinations(intake_mode, intake_seasons)")
      .eq("lead_id", studentId),
    supabase
      .from("applications")
      .select("id, deadline, cycle_id, university:universities(name), program:programs(name, application_deadline)")
      .eq("student_id", studentId),
  ]);

  const cycles = (cycleRows ?? []) as Cycle[];
  const currentCycle = cycles.find((c) => c.is_current) ?? cycles.at(-1) ?? null;
  const currentIntake = (currentCycle?.intake ?? student?.intake ?? "").trim();

  // The intake shape of the primary country. A backup country can run a
  // different pattern, but the intake field on the student is one value and
  // the primary destination is what it follows.
  const primary =
    (destRows ?? []).find((r) => !r.is_backup) ?? (destRows ?? [])[0] ?? null;
  const dest = primary ? (one(primary.destination as never) as { intake_mode?: string; intake_seasons?: string[] } | null) : null;
  const modeRaw = dest?.intake_mode ?? "free_text";
  const mode: IntakeMode = isIntakeMode(modeRaw) ? modeRaw : "free_text";
  const options = dest?.intake_seasons ?? [];

  // Only this cycle's applications carry deadlines that matter — an earlier
  // attempt's deadlines say nothing about whether there is time left now.
  const currentApps = (apps ?? []).filter((a) => !currentCycle || !a.cycle_id || a.cycle_id === currentCycle.id);
  const deadlines: DeadlineEvidence[] = [];
  for (const a of currentApps) {
    const uni = one(a.university as never) as { name?: string } | null;
    const program = one(a.program as never) as { name?: string; application_deadline?: string | null } | null;
    const who = uni?.name ?? "This application";
    if (a.deadline) deadlines.push({ label: `${who} deadline`, date: a.deadline });
    if (program?.application_deadline) {
      deadlines.push({ label: `${who} — ${program.name ?? "program"} application`, date: program.application_deadline });
    }
    // Recorded even when blank, so the recommendation can tell "no deadline
    // is known" apart from "every deadline has passed".
    if (!a.deadline && !program?.application_deadline) {
      deadlines.push({ label: `${who} deadline`, date: null });
    }
  }

  // Refused on the country they finalised, or marked ghosted/withdrawn.
  let eligibility: RestartContext["eligibility"] = null;
  if (student?.registration_status === "ghost") {
    eligibility = { reason: "ghost", detail: "This student is marked as ghosted." };
  } else if (student?.registration_status === "withdrawn") {
    eligibility = { reason: "withdrawn", detail: "This student is marked as withdrawn." };
  } else {
    const outcomes = await visaOutcomes(supabase, studentId);
    const refused = outcomes.filter((o) => o.decision === "refused");
    if (refused.length > 0 && !outcomes.some((o) => o.decision === "approved")) {
      eligibility = {
        reason: "visa_refused",
        detail: `The visa was refused for ${refused.map((r) => r.country).join(", ")}.`,
      };
    }
  }

  return {
    eligibility,
    cycles,
    currentIntake,
    mode,
    options,
    deadlines,
    recommendation: recommendRestart({ currentIntake, mode, options, deadlines }),
  };
}

/**
 * Starts the student's process again for a new intake.
 *
 * Nothing is copied and nothing is deleted. The previous cycle stops being
 * current, a new one opens, and the applications and documents already in the
 * system keep pointing at the cycle they were raised in — which is what makes
 * the previous intake's tab possible at all. The student's new applications
 * are raised by staff in the new cycle; the visa, the scholarship and the
 * scholarship documents deliberately do not come across, because a refused
 * visa's paperwork reads as done when it is not.
 */
export async function startNewCycle(_prevState: unknown, formData: FormData) {
  const denied = await requirePermission(
    "students.restart_process",
    "You do not have permission to start a student's process again."
  );
  if (denied) return { error: denied.error };

  const studentId = String(formData.get("student_id") ?? "");
  const intake = String(formData.get("intake") ?? "").trim();
  const decisionRaw = String(formData.get("decision") ?? "");
  const reasonRaw = String(formData.get("reason") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 2000) || null;

  if (!studentId) return { error: "No student was given." };
  if (!intake) return { error: "Set the intake this student is going for." };
  const decision = decisionRaw === "resumed" || decisionRaw === "deferred" ? decisionRaw : null;
  if (!decision) return { error: "Choose whether this resumes the current intake or defers to the next one." };
  const reason =
    reasonRaw === "visa_refused" || reasonRaw === "ghost" || reasonRaw === "withdrawn" || reasonRaw === "other"
      ? reasonRaw
      : "other";

  const { supabase, staff } = await getStaffSession();
  if (!staff) return { error: "You are signed out — reload the page." };

  // The first cycle has to exist before a second can open, or last intake's
  // applications end up belonging to no intake and its tab is empty.
  //
  // Taken from the return value rather than re-read — Next memoizes identical
  // fetch GETs within a request, so a second query for student_cycles here
  // could hand back the response from before this created the first one, and
  // the "new" cycle would be numbered 1 on top of it.
  const previous = await ensureCurrentCycle(studentId);
  if (!previous) {
    return { error: "This student is not registered yet, so there is no process to start again." };
  }
  const nextSequence = previous.sequence + 1;

  // One current cycle at a time — the database enforces it too, so the old one
  // has to be closed before the new one opens rather than after.
  {
    const { error } = await supabase
      .from("student_cycles")
      .update({ is_current: false })
      .eq("student_id", studentId)
      .eq("is_current", true);
    if (error) return { error: error.message };
  }

  const { data: created, error: insertError } = await supabase
    .from("student_cycles")
    .insert({
      student_id: studentId,
      sequence: nextSequence,
      intake,
      is_current: true,
      reason,
      decision,
      note,
      created_by: staff.id,
    })
    .select("id")
    .single();
  if (insertError) {
    // Put the previous cycle back rather than leaving the student with none
    // current, which would hide every tab on both screens.
    await supabase.from("student_cycles").update({ is_current: true }).eq("id", previous.id);
    return { error: insertError.message };
  }

  // The student is back in the process: their intake is the new one, and a
  // ghosted or withdrawn student is registered again.
  const update: Record<string, unknown> = { intake };
  const backToRegistered = reason === "ghost" || reason === "withdrawn";
  if (backToRegistered) update.registration_status = "registered";
  const { error: leadError } = await supabase.from("leads").update(update).eq("id", studentId);
  if (leadError) return { error: leadError.message };

  // Setting the status back to 'registered' anywhere else retries the
  // counselor's commission, so this has to as well. It is idempotent — one
  // commission per student ever, whatever they go on to do — so the only case
  // it changes is the student whose commission could not be priced when they
  // first registered and would otherwise stay missing for good.
  if (backToRegistered) await ensureCommissionForStudent(studentId);

  revalidatePath(`/students/${studentId}`);
  revalidatePath(`/students/${studentId}/applications`);
  revalidatePath(`/students/${studentId}/documents`);
  revalidatePath("/portal");
  return { success: true, cycleId: created.id };
}
