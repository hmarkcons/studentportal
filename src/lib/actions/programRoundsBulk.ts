"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseRoundsFromFormData } from "@/lib/programRounds";

/** Big enough that a whole university fits in one round-trip (the largest catalogue is 38 programmes). */
const INSERT_CHUNK = 500;

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/**
 * Applies the same intake rounds to many programmes of one university.
 *
 * Bachelor's and master's programmes at a university very often share their
 * closing dates, and typing the same pair of dates into thirty-odd programmes
 * one at a time is the kind of work nobody finishes accurately. So the rounds
 * are entered once and written to every programme picked.
 *
 * Two modes, because both are real:
 *
 *   add      leaves what each programme already has and appends these. Used
 *            when a later round is announced for a whole faculty at once.
 *   replace  clears each selected programme's rounds first. Used when the
 *            dates were wrong, or when setting them for the first time.
 *
 * `add` skips a round whose label a programme already carries rather than
 * creating a second "Round 1" — staff will run this more than once, and it
 * has to be safe to repeat.
 */
export async function setRoundsForPrograms(universityId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const programIds = [...new Set(formData.getAll("program_ids").map(String).filter(Boolean))];
  const rounds = parseRoundsFromFormData(formData);
  const replace = String(formData.get("mode") ?? "add") === "replace";

  if (programIds.length === 0) return { error: "Choose at least one programme." };
  if (rounds.length === 0) {
    return { error: "Add at least one round with a course start or an apply-by date." };
  }

  // Never trust the ids the form sent. Without this, a tampered-with or stale
  // page could write rounds onto another university's catalogue.
  const { data: owned, error: ownedError } = await supabase
    .from("programs")
    .select("id, level, name")
    .eq("university_id", universityId)
    .in("id", programIds);
  if (ownedError) return { error: ownedError.message };
  if ((owned ?? []).length !== programIds.length) {
    return { error: "Some of those programmes are no longer at this university — reload the page and try again." };
  }

  let applicationsDetached = 0;
  let skipped = 0;

  if (replace) {
    const { data: existing, error: readError } = await supabase
      .from("program_intake_rounds")
      .select("id")
      .in("program_id", programIds);
    if (readError) return { error: readError.message };

    const doomed = (existing ?? []).map((r) => r.id);
    if (doomed.length > 0) {
      // Counted BEFORE the delete, because afterwards there is nothing left to
      // count. applications.round_id is ON DELETE SET NULL (0233), so these
      // applications survive but lose the round they were filed against —
      // which the caller has to be told, not left to discover.
      const { count } = await supabase
        .from("applications")
        .select("id", { count: "exact", head: true })
        .in("round_id", doomed);
      applicationsDetached = count ?? 0;

      const { error: deleteError } = await supabase
        .from("program_intake_rounds")
        .delete()
        .in("program_id", programIds);
      // RLS gives delete to Super Admin only (0232), so a counselor choosing
      // replace gets a sentence rather than a silent no-op.
      if (deleteError) {
        return { error: `Could not clear the existing rounds: ${deleteError.message}` };
      }
    }
  }

  // What each programme already has, so `add` can be run twice without
  // doubling anything, and so appended rounds sort after the existing ones
  // rather than interleaving by a sort_order that means nothing across
  // programmes.
  const existingByProgram = new Map<string, { labels: Set<string>; maxOrder: number }>();
  if (!replace) {
    const { data: current, error: currentError } = await supabase
      .from("program_intake_rounds")
      .select("program_id, label, sort_order")
      .in("program_id", programIds);
    if (currentError) return { error: currentError.message };
    for (const row of current ?? []) {
      const entry = existingByProgram.get(row.program_id) ?? { labels: new Set<string>(), maxOrder: 0 };
      entry.labels.add(row.label.trim().toLowerCase());
      entry.maxOrder = Math.max(entry.maxOrder, row.sort_order ?? 0);
      existingByProgram.set(row.program_id, entry);
    }
  }

  const rows: Record<string, unknown>[] = [];
  for (const program_id of programIds) {
    const existing = existingByProgram.get(program_id);
    let order = existing?.maxOrder ?? 0;
    for (const round of rounds) {
      if (existing?.labels.has(round.label.trim().toLowerCase())) {
        skipped += 1;
        continue;
      }
      order += 1;
      rows.push({
        program_id,
        label: round.label,
        start_date: round.start_date,
        application_deadline: round.application_deadline,
        sort_order: replace ? round.sort_order ?? order : order,
      });
    }
  }

  if (rows.length === 0) {
    return {
      error: "Every programme picked already has a round with that name. Rename the round, or choose Replace.",
    };
  }

  for (const batch of chunk(rows, INSERT_CHUNK)) {
    const { error } = await supabase.from("program_intake_rounds").insert(batch);
    if (error) return { error: error.message };
  }

  revalidatePath(`/setup/universities/${universityId}`);
  return {
    success: true,
    programs: programIds.length,
    rounds: rows.length,
    skipped,
    applicationsDetached,
  };
}
