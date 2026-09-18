"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
// applications.ts keeps its own currentCycleId private — and being a
// "use server" module it cannot export a helper that takes a client. This is
// the same lookup, and it also creates the student's first cycle if they
// somehow have none, which is what an application needs to belong to.
import { ensureCurrentCycleId } from "@/lib/ensureCycle";

/**
 * Creates an application straight from a suggested programme.
 *
 * The suggestion already knows the university and the country, so asking staff
 * to re-pick both on the New application page would be asking them to retype
 * what the screen just told them. Everything else about the application — its
 * intake, its round, its deadline — stays editable afterwards, exactly as it
 * is for one created by hand.
 */
export async function addSuggestedApplication(studentId: string, programId: string, revalidateTo: string) {
  const supabase = await createClient();

  // The programme's own university rather than one passed in: a bound argument
  // is client-supplied, and pairing a programme with the wrong university would
  // make the row describe two institutions at once.
  const { data: program } = await supabase
    .from("programs")
    .select("id, name, university_id, university:universities(name, status, destination_id)")
    .eq("id", programId)
    .maybeSingle();
  if (!program) return { error: "That programme no longer exists — reload the page." };

  const university = Array.isArray(program.university) ? program.university[0] : program.university;
  if (!university || university.status !== "active") {
    return { error: "That university is inactive — applications can't be added for it." };
  }

  // The student has to actually be registered for the programme's country.
  // Without this check a stale page could file an application against a
  // country the student was removed from, which is the state that leaves them
  // with a country they cannot be processed for.
  const { data: registered } = await supabase
    .from("lead_destinations")
    .select("destination_id")
    .eq("lead_id", studentId)
    .eq("destination_id", university.destination_id)
    .maybeSingle();
  if (!registered) {
    return { error: "This student isn't registered for that programme's country any more — reload the page." };
  }

  const { error } = await supabase.from("applications").insert({
    student_id: studentId,
    university_id: program.university_id,
    program_id: program.id,
    cycle_id: await ensureCurrentCycleId(studentId),
  });

  if (error) {
    if (error.code === "23505") {
      return { error: `${program.name} is already on file for this student in this intake.` };
    }
    return { error: error.message };
  }

  revalidatePath(revalidateTo);
  revalidatePath(`/students/${studentId}/applications`);
  return { success: true, added: program.name };
}
