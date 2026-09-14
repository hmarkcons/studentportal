// Starting a student's process again, for a later intake.
//
// A visa refusal, a student who went quiet, a student who withdrew and came
// back: the office runs them through the process again, and last year's work
// has to stay put. So an attempt is a "cycle" — applications and documents
// carry the cycle they were raised in, and nothing is ever copied or moved.
//
// This module holds the decisions that have to come out the same way on the
// dashboard, in the applications tabs and in the documents tabs: what the next
// intake is called, whether there is still time for the current one, and which
// documents carry over.

import { parseIntake, type IntakeMode } from "./intake.ts";

export type Cycle = {
  id: string;
  sequence: number;
  intake: string | null;
  is_current: boolean;
  reason?: string | null;
  decision?: string | null;
};

const KARACHI = "Asia/Karachi";

/** The office's day, not the server's. */
export function karachiToday(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: KARACHI });
}

/** How an intake reads when there is none recorded. */
export const NO_INTAKE = "intake not set";

export function intakeLabel(intake: string | null | undefined): string {
  return (intake ?? "").trim() || NO_INTAKE;
}

/**
 * A tab heading: "Apps — September/Fall 2027".
 *
 * The intake is in the heading because that is the only thing that
 * distinguishes the tabs, and "previous" on its own tells staff nothing about
 * which year they are looking at.
 */
export function cycleTabLabel(prefix: string, cycle: Cycle): string {
  return `${prefix} — ${intakeLabel(cycle.intake)}`;
}

/**
 * Current cycle first, then the most recent previous one, and so on.
 *
 * The office asked for the upcoming intake at position one and the previous
 * year second: what a student is doing now is what staff open the page to
 * work on.
 */
export function orderCycles(cycles: Cycle[]): Cycle[] {
  const current = cycles.filter((c) => c.is_current).sort((a, b) => b.sequence - a.sequence);
  const past = cycles.filter((c) => !c.is_current).sort((a, b) => b.sequence - a.sequence);
  return [...current, ...past];
}

/** Seasons in the destination's configured order, never the ticked order. */
function ordered(seasons: string[], options: string[]): string[] {
  return options.filter((o) => seasons.includes(o));
}

/**
 * The intake after this one.
 *
 * A single-intake country rolls to the same season next year. A two-intake
 * country moves to the other half of the cycle first, and only then to next
 * year — a student refused in time for the spring intake should be offered the
 * autumn one, not made to wait a full year.
 *
 * Returns "" when the current intake was typed freehand and cannot be read.
 * Guessing at "Jan 2027 / Sept 2027 / May 2027" would put a student in the
 * wrong intake, so staff type that one themselves.
 */
export function nextIntakeLabel(
  currentIntake: string | null | undefined,
  mode: IntakeMode,
  options: string[],
  now: Date = new Date()
): string {
  const { seasons, year } = parseIntake(currentIntake, options);
  const thisYear = Number(karachiToday(now).slice(0, 4));

  if (seasons.length === 0 || !year) {
    // Nothing readable to move on from. A single-intake country still has an
    // obvious answer — its one season, next year — so offer that much.
    if (mode === "single" && options.length === 1) return `${options[0]} ${thisYear + 1}`;
    return "";
  }

  const y = Number(year);
  if (mode === "multi" && options.length > 1 && seasons.length === 1) {
    const index = options.indexOf(seasons[0]);
    if (index >= 0) {
      // The next slot in the calendar — which after the last season of a year
      // is the FIRST season of the next one, not the same season again. Rolling
      // "Fall/Winter 2027" to "Fall/Winter 2028" would skip a whole intake the
      // student could have taken.
      const last = index === options.length - 1;
      const season = last ? options[0] : options[index + 1];
      const seasonYear = last ? Math.max(y + 1, thisYear) : Math.max(y, thisYear);
      return `${season} ${seasonYear}`;
    }
  }

  // An intake recorded years ago should not roll to a year already past.
  const nextYear = Math.max(y + 1, thisYear);
  return `${ordered(seasons, options).join(" & ")} ${nextYear}`;
}

export type DeadlineEvidence = { label: string; date: string | null };

export type RestartRecommendation = {
  action: "resume" | "defer";
  /** The intake to put the student in if the recommendation is taken. */
  intake: string;
  /** What the recommendation is based on, shown to staff verbatim. */
  because: string;
  /** Deadlines that are still ahead, most urgent first. */
  openDeadlines: { label: string; date: string }[];
};

/**
 * Resume the current intake, or defer to the next one.
 *
 * The office's rule is: if the admission and pre-enrolment deadlines are still
 * open, or there is still time to apply for a study visa, put the student back
 * into the current intake; otherwise defer them. The catch is that almost no
 * program in the system has a deadline recorded, so this recommends rather
 * than decides, and says which it is — a recommendation built on no evidence
 * has to admit that, or staff will trust it as though it knew.
 */
export function recommendRestart(input: {
  currentIntake: string | null | undefined;
  mode: IntakeMode;
  options: string[];
  deadlines: DeadlineEvidence[];
  now?: Date;
}): RestartRecommendation {
  const now = input.now ?? new Date();
  const today = karachiToday(now);
  const next = nextIntakeLabel(input.currentIntake, input.mode, input.options, now);

  const openDeadlines = input.deadlines
    .filter((d): d is { label: string; date: string } => Boolean(d.date) && d.date! > today)
    .sort((a, b) => a.date.localeCompare(b.date));

  const recorded = input.deadlines.filter((d) => d.date);

  if (openDeadlines.length > 0) {
    const soonest = openDeadlines[0];
    return {
      action: "resume",
      intake: (input.currentIntake ?? "").trim(),
      because: `${soonest.label} is still open (${soonest.date}), so there is time to finish this intake.`,
      openDeadlines,
    };
  }

  if (recorded.length === 0) {
    return {
      action: "defer",
      intake: next,
      because:
        "No admission, pre-enrolment or visa deadline is recorded for this intake, so there is nothing here showing time is left. Check the university's page before resuming instead.",
      openDeadlines,
    };
  }

  const latest = recorded.map((d) => d.date!).sort().at(-1)!;
  return {
    action: "defer",
    intake: next,
    because: `Every recorded deadline for this intake has passed — the last was ${latest}.`,
    openDeadlines,
  };
}

// ------------------------------------------------------------------ documents

/**
 * Document categories that do not follow a student into a new intake.
 *
 * The office's instruction was to copy everything except the applications, the
 * visa, the scholarship and the scholarship documents. A refused visa's
 * paperwork and a scholarship tied to a university the student is no longer
 * going to are worse than useless in the new intake: they read as done.
 */
export const CATEGORIES_NOT_CARRIED = ["visa", "visa_sticker", "scholarship_documents", "scholarship"] as const;

export function categoryCarriesOver(category: string | null | undefined): boolean {
  return !CATEGORIES_NOT_CARRIED.includes(String(category ?? "") as (typeof CATEGORIES_NOT_CARRIED)[number]);
}

export type CycleDoc = {
  id: string;
  cycle_id: string | null;
  category: string | null;
  template_id: string | null;
  derived_key?: string | null;
  status: string;
};

/**
 * Whether a requirement already collected in an earlier intake still counts.
 *
 * A degree certificate does not expire; a bank statement, a police certificate
 * and a medical do, and which is which is set per requirement in Setup rather
 * than guessed from its name here.
 */
export function documentCarriesOver(doc: CycleDoc, renewTemplateIds: Set<string>): boolean {
  if (!categoryCarriesOver(doc.category)) return false;
  if (doc.template_id && renewTemplateIds.has(doc.template_id)) return false;
  // Only something actually accepted carries over. A rejected or missing row
  // from last year is not evidence of anything.
  return doc.status === "verified";
}

/** What identifies "the same requirement" across intakes. */
function requirementKey(doc: CycleDoc): string {
  return doc.template_id ?? doc.derived_key ?? doc.id;
}

/**
 * The documents to show for one intake tab.
 *
 * Rows raised in that cycle, plus anything approved in an earlier one that
 * still counts and has not been asked for again — so a student who re-applies
 * does not re-upload their degree, while last year's bank statement does not
 * sit there marked approved.
 */
export function resolveCycleDocuments(
  docs: CycleDoc[],
  selectedCycleId: string,
  cycleSequence: Map<string, number>,
  renewTemplateIds: Set<string>
): { doc: CycleDoc; inheritedFrom: number | null }[] {
  const selectedSeq = cycleSequence.get(selectedCycleId) ?? 1;
  const own = docs.filter((d) => d.cycle_id === selectedCycleId);
  const ownKeys = new Set(own.map(requirementKey));

  const inherited = docs
    .filter((d) => {
      if (d.cycle_id === selectedCycleId) return false;
      const seq = d.cycle_id ? cycleSequence.get(d.cycle_id) ?? 1 : 1;
      // Only from earlier intakes: a later intake's paperwork is not evidence
      // for an earlier one.
      if (seq >= selectedSeq) return false;
      if (ownKeys.has(requirementKey(d))) return false;
      return documentCarriesOver(d, renewTemplateIds);
    })
    // Newest earlier cycle wins, if a requirement was collected more than once.
    .sort((a, b) => (cycleSequence.get(b.cycle_id ?? "") ?? 0) - (cycleSequence.get(a.cycle_id ?? "") ?? 0));

  const seen = new Set<string>();
  const kept: { doc: CycleDoc; inheritedFrom: number | null }[] = [];
  for (const d of inherited) {
    const key = requirementKey(d);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push({ doc: d, inheritedFrom: d.cycle_id ? cycleSequence.get(d.cycle_id) ?? 1 : 1 });
  }

  return [...own.map((doc) => ({ doc, inheritedFrom: null })), ...kept];
}
