// A programme's intake rounds.
//
// A programme commonly runs more than one intake, each with its own course
// start and its own last date to apply — "Round 1 starts September, apply by
// 15 January; Round 2 starts February, apply by 15 September". Until 0232 the
// catalogue held one pair of dates per programme, so only one of those rounds
// could be recorded.
//
// Everything here is pure, so client components can import it. The write side
// is in src/lib/actions/programRoundsWrite.ts.

import { daysUntil } from "@/lib/applicationDeadline";
import { formatDateOnly } from "@/lib/formatDate";

/**
 * Named month rather than the en-US numeric default formatDateOnly falls back
 * to. "12/15/2026" and "15/12/2026" are the same glyphs in a different order,
 * and the readers here are in Karachi, where the second reading is the
 * habitual one — so a numeric apply-by date is a genuine eight-month error
 * waiting to happen.
 */
export const ROUND_DATE_FORMAT: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };

export type ProgramRound = {
  /** Null/absent for a round the form has just added. */
  id?: string | null;
  label: string;
  start_date: string | null;
  application_deadline: string | null;
  sort_order?: number | null;
};

/** What a newly added row is called, before anyone renames it. */
export function defaultRoundLabel(index: number): string {
  return `Round ${index + 1}`;
}

/** Display order: the sort_order staff gave, then oldest first as a tiebreak. */
export function sortRounds<T extends ProgramRound>(rounds: readonly T[]): T[] {
  return [...rounds].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

/**
 * The round a reader actually wants to see.
 *
 * A programme with four rounds should not lead with the one that closed in
 * January. So: the first round still open — its deadline has not passed, or it
 * has no deadline and its course has not started. Failing that, every round has
 * gone, and the last one is the most informative thing to show.
 *
 * Without a `today` there is nothing to compare against, so the first round
 * stands. That is the same fallback ProgramDates uses for its "closed" marker.
 */
export function nextRound<T extends ProgramRound>(rounds: readonly T[], today?: string): T | null {
  const ordered = sortRounds(rounds);
  if (ordered.length === 0) return null;
  if (!today) return ordered[0];

  const stillOpen = ordered.find((r) => {
    if (r.application_deadline) return daysUntil(r.application_deadline, today) >= 0;
    if (r.start_date) return daysUntil(r.start_date, today) >= 0;
    return false;
  });

  return stillOpen ?? ordered[ordered.length - 1];
}

/**
 * How a round reads in a dropdown.
 *
 * The dates are in the option text rather than beside the field, because the
 * choice being made IS between dates — "Round 1" and "Round 2" on their own
 * give the person picking nothing to pick on. A round that has closed says so,
 * since staff do legitimately file against a passed round and should be able
 * to see that is what they are doing.
 */
export function roundOptionLabel(round: ProgramRound, today?: string): string {
  const parts: string[] = [];
  if (round.start_date) parts.push(`starts ${formatDateOnly(round.start_date, ROUND_DATE_FORMAT)}`);
  if (round.application_deadline) {
    const when = formatDateOnly(round.application_deadline, ROUND_DATE_FORMAT);
    parts.push(roundIsClosed(round, today) ? `closed ${when}` : `apply by ${when}`);
  }
  return parts.length > 0 ? `${round.label} — ${parts.join(", ")}` : round.label;
}

/** True once this round can no longer be applied for. */
export function roundIsClosed(round: ProgramRound, today?: string): boolean {
  if (!today) return false;
  if (round.application_deadline) return daysUntil(round.application_deadline, today) < 0;
  if (round.start_date) return daysUntil(round.start_date, today) < 0;
  return false;
}

/**
 * Whether the form that was submitted actually carried the rounds widget.
 *
 * "No round fields" and "the widget was there and every row was removed" are
 * different intentions with the same empty field list, and only the second one
 * should clear a programme's rounds. Without this, a form that posted to
 * updateProgram without the widget — a future quick-edit, a partial save —
 * would delete every round the programme had, silently and with no way back.
 * The widget emits the marker; a form without it leaves the rounds alone.
 */
export function roundsWereSubmitted(formData: FormData): boolean {
  return formData.has(ROUNDS_PRESENT_FIELD);
}

/** The hidden marker ProgramRoundsFields emits once per form. */
export const ROUNDS_PRESENT_FIELD = "rounds_present";

/**
 * Reads the repeated round fields out of a submitted form.
 *
 * The widget emits one set of same-named inputs per row — round_id,
 * round_label, round_start_date, round_application_deadline — so the four
 * getAll() lists line up by index.
 *
 * A row with neither date is dropped rather than rejected: it is an empty row
 * somebody added and did not fill in, and the table's
 * program_intake_rounds_has_a_date constraint would refuse it anyway. A row
 * with a date but no label gets numbered, so a blank label cannot fail the
 * save.
 */
export function parseRoundsFromFormData(formData: FormData): ProgramRound[] {
  const ids = formData.getAll("round_id").map(String);
  const labels = formData.getAll("round_label").map(String);
  const starts = formData.getAll("round_start_date").map(String);
  const deadlines = formData.getAll("round_application_deadline").map(String);

  const count = Math.max(labels.length, starts.length, deadlines.length);
  const rounds: ProgramRound[] = [];

  for (let i = 0; i < count; i++) {
    const start_date = (starts[i] ?? "").trim() || null;
    const application_deadline = (deadlines[i] ?? "").trim() || null;
    if (!start_date && !application_deadline) continue;

    rounds.push({
      id: (ids[i] ?? "").trim() || null,
      label: (labels[i] ?? "").trim() || defaultRoundLabel(rounds.length),
      start_date,
      application_deadline,
      // Renumbered from the order they were submitted in, so removing a middle
      // row does not leave a gap and the first row is always the first round.
      sort_order: rounds.length + 1,
    });
  }

  return rounds;
}
