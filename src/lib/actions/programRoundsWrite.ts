import type { createClient } from "@/lib/supabase/server";
import type { ProgramRound } from "@/lib/programRounds";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Makes a programme's rounds match what was submitted.
 *
 * Rows are matched by id rather than replaced wholesale, so a round keeps its
 * identity across an edit. Nothing references program_intake_rounds.id today
 * and a delete-and-reinsert would have been shorter, but an application will
 * eventually want to record which round it was submitted for, and by then the
 * ids will need to have survived every edit before it.
 *
 * Returns an error message, or null when the rounds were saved.
 */
export async function saveProgramRounds(
  supabase: SupabaseServerClient,
  programId: string,
  rounds: ProgramRound[]
): Promise<string | null> {
  const { data: existing, error: readError } = await supabase
    .from("program_intake_rounds")
    .select("id")
    .eq("program_id", programId);
  if (readError) return readError.message;

  const existingIds = new Set((existing ?? []).map((r) => r.id));
  // An id that is not actually this programme's is treated as a new row, so a
  // tampered-with hidden field cannot move another programme's round.
  const kept = new Set(rounds.map((r) => r.id).filter((id): id is string => Boolean(id) && existingIds.has(id)));

  const removed = [...existingIds].filter((id) => !kept.has(id));
  if (removed.length > 0) {
    const { error } = await supabase.from("program_intake_rounds").delete().in("id", removed);
    if (error) return error.message;
  }

  for (const round of rounds) {
    const payload = {
      label: round.label,
      start_date: round.start_date,
      application_deadline: round.application_deadline,
      sort_order: round.sort_order ?? 0,
    };

    if (round.id && kept.has(round.id)) {
      const { error } = await supabase.from("program_intake_rounds").update(payload).eq("id", round.id);
      if (error) return error.message;
    } else {
      const { error } = await supabase.from("program_intake_rounds").insert({ program_id: programId, ...payload });
      if (error) return error.message;
    }
  }

  return null;
}
