// Turning one spreadsheet row into the values the catalogue stores.
//
// Shared by all three importers — the universities sheet, the per-university
// programmes sheet, and the combined catalogue sheet that carries both — so
// that a `rounds` cell or a `yes` means the same thing whichever one you
// upload. Pure, so it can be unit-tested; the write side is in
// src/lib/actions/universities.ts.
//
// The governing rule, which every parser here obeys: **an empty cell yields
// null, never a default**. importMerge.ts then treats null as "the sheet said
// nothing" and leaves the stored value alone. That is what lets a sheet of
// nothing but names and tuition fees update thirty programmes without wiping
// the twelve columns it does not mention. A parser that quietly turned an
// empty interview_required into `false` would turn every such import into a
// silent mass edit.

import { FEE_TEXT_MAX, parseFeeCurrency, parseFeeText, parseTuitionText } from "./applicationFee.ts";
import {
  DATE_WORDS_MAX,
  EMAILS_MAX,
  LEVEL_MAX,
  STANDARD_LEVELS,
  TYPED_SHORT_NAME_MAX,
  YES_NO_MAX,
  cleanLine,
  levelKey,
  normalizeEmails,
  normalizeLevel,
  parseYesNoText,
} from "./catalogueText.ts";

/**
 * An intake round as a sheet describes it, before it reaches the database.
 * Each date may come with words, or be words alone (0304): `start_text` and
 * `deadline_text` are shown in place of the date, which stays what reminders
 * and "closed" read.
 */
export type CatalogueRound = {
  label: string;
  start_date: string | null;
  application_deadline: string | null;
  start_text: string | null;
  deadline_text: string | null;
  sort_order: number;
};

export type RowProblem = string;

/** Semicolon-separated within a cell, because commas are the CSV delimiter. */
export function splitList(value: string | undefined): string[] {
  return (value ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * yes/no, or null when the cell says nothing.
 *
 * Null rather than false is the whole point: see the note at the top. An
 * unrecognised word is also null — it is not an instruction, and guessing
 * which way somebody meant "maybe" is worse than leaving the stored value be.
 *
 * The programme's interview and admission-test columns no longer use this:
 * they take words as well (0304) — see parseYesNoCell.
 */
export function parseBool(value: string | undefined): boolean | null {
  const text = (value ?? "").trim().toLowerCase();
  if (text === "") return null;
  if (["yes", "true", "1", "y"].includes(text)) return true;
  if (["no", "false", "0", "n"].includes(text)) return false;
  return null;
}

/**
 * An application fee cell (0303): an amount or words. A plain amount is kept
 * as the number ("€3,000.00" and "3000" are both "3000", so re-importing an
 * export changes nothing); words — "Free for EU students" — as written. Blank
 * says nothing. Longer than a fee could be is reported rather than cut.
 */
export function parseFeeCell(value: string | undefined, problems: RowProblem[], label: string): string | null {
  const { text } = parseFeeText(value ?? "");
  if (text && text.length > FEE_TEXT_MAX) {
    problems.push(`${label} is longer than ${FEE_TEXT_MAX} characters — left unchanged`);
    return null;
  }
  return text;
}

/** A tuition cell (0303): an amount or words, a symbol kept in the words — tuition has no currency column. */
export function parseTuitionCell(value: string | undefined, problems: RowProblem[], label: string): string | null {
  const text = parseTuitionText(value ?? "");
  if (text && text.length > FEE_TEXT_MAX) {
    problems.push(`${label} is longer than ${FEE_TEXT_MAX} characters — left unchanged`);
    return null;
  }
  return text;
}

/**
 * A yes/no cell that may be words (0304): "yes" or "no" for the usual ways of
 * saying so, the words as written for anything else ("Only for non-EU
 * students"), null when blank. Longer than a field holds is reported.
 */
export function parseYesNoCell(value: string | undefined, problems: RowProblem[], label: string): string | null {
  const text = parseYesNoText(value);
  if (text && text.length > YES_NO_MAX) {
    problems.push(`${label} is longer than ${YES_NO_MAX} characters — left unchanged`);
    return null;
  }
  return text;
}

/** An email cell (0304): one address, several, or anything — never refused for its format. */
export function parseEmailsCell(value: string | undefined, problems: RowProblem[], label: string): string | null {
  const text = normalizeEmails(value);
  if (text && text.length > EMAILS_MAX) {
    problems.push(`${label} is longer than ${EMAILS_MAX} characters — left unchanged`);
    return null;
  }
  return text;
}

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** 1-12 for a month's full name or any abbreviation of three letters or more ("Sept", "Mar"). */
function monthNumber(word: string): number | null {
  const w = word.toLowerCase();
  if (w.length < 3) return null;
  const at = MONTH_NAMES.findIndex((name) => name.startsWith(w));
  return at === -1 ? null : at + 1;
}

/** A real calendar day as YYYY-MM-DD, or null — 2027-02-30 is not one. */
function isoDay(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * A date, or null. Anything unreadable is reported rather than sent to Postgres.
 *
 * Accepted: 2027-03-15, and the month written as a word — "15 Mar 2027",
 * "15 March 2027", "March 15, 2027". A date cell in Excel already arrives as
 * YYYY-MM-DD (see spreadsheet.ts).
 *
 * All-number forms with slashes or dots are refused, not guessed at: the
 * office writes 03/04/2027 for the 3rd of April and an American admissions
 * page means the 4th of March, and a deadline read the wrong way round is
 * wrong by a month without looking wrong at all.
 */
export function parseDay(value: string | undefined, problems: RowProblem[], label: string): string | null {
  const raw = (value ?? "").trim();
  if (raw === "") return null;

  let parsed: string | null = null;
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const dayFirst = raw.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([a-z]+)\.?,?[\s-]+(\d{4})$/i);
  const monthFirst = raw.match(/^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i);
  if (iso) {
    parsed = isoDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  } else if (dayFirst && monthNumber(dayFirst[2])) {
    parsed = isoDay(Number(dayFirst[3]), monthNumber(dayFirst[2])!, Number(dayFirst[1]));
  } else if (monthFirst && monthNumber(monthFirst[1])) {
    parsed = isoDay(Number(monthFirst[3]), monthNumber(monthFirst[1])!, Number(monthFirst[2]));
  }

  if (!parsed) {
    problems.push(`${label} "${raw}" is not a date this can read — write 2027-03-15 or 15 Mar 2027; ignored`);
    return null;
  }
  return parsed;
}

/** A readable date at the very start of some text, and what follows it. */
function leadingDay(raw: string): { day: string; rest: string } | null {
  const patterns: [RegExp, (m: RegExpMatchArray) => string | null][] = [
    [/^(\d{4})-(\d{1,2})-(\d{1,2})(?![\d-])/, (m) => isoDay(Number(m[1]), Number(m[2]), Number(m[3]))],
    [/^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([a-z]+)\.?,?[\s-]+(\d{4})(?!\d)/i, (m) => (monthNumber(m[2]) ? isoDay(Number(m[3]), monthNumber(m[2])!, Number(m[1])) : null)],
    [/^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?!\d)/i, (m) => (monthNumber(m[1]) ? isoDay(Number(m[3]), monthNumber(m[1])!, Number(m[2])) : null)],
  ];
  for (const [pattern, read] of patterns) {
    const m = raw.match(pattern);
    if (!m) continue;
    const day = read(m);
    if (day) return { day, rest: raw.slice(m[0].length) };
  }
  return null;
}

/**
 * A date that may be words (0304) — how every round date and a scholarship
 * call's expected date is read, from a form or a sheet:
 *
 *   blank                               → nothing
 *   a date, nothing else                → the date              "15 Mar 2027", "2027-03-15"
 *   a date, then words without a second → the date AND the words "15 March 2027, 13:00 CET"
 *     year in them
 *   anything else                       → the words alone        "Rolling", "TBA March 2027",
 *                                                                "03/04/2027"
 *
 * The date is what reminders, the staff queue, the calendar and "closed"
 * read; the words are what people are shown. A date is read out of words only
 * when the words BEGIN with it and name no other year, because guessing which
 * of "1 March – 15 April 2027" is the deadline would put a reminder on the
 * wrong day without anything looking wrong. All-number dates with slashes are
 * words, as parseDay explains: 03/04/2027 is two different days.
 */
export function parseDayOrWords(value: string | null | undefined): { date: string | null; text: string | null } {
  const raw = cleanLine(value);
  if (raw === null) return { date: null, text: null };
  const lead = leadingDay(raw);
  if (lead && lead.rest.trim().replace(/^[,.;:]+$/, "") === "") return { date: lead.day, text: null };
  if (lead && !/\d{4}/.test(lead.rest)) return { date: lead.day, text: raw };
  return { date: null, text: raw };
}

/** A round's start or deadline as a cell of a sheet gives it, its words held to what the column takes. */
function roundDateCell(value: string | undefined, problems: RowProblem[], label: string): { date: string | null; text: string | null } {
  const read = parseDayOrWords(value);
  if (read.text && read.text.length > DATE_WORDS_MAX) {
    problems.push(`${label} is longer than ${DATE_WORDS_MAX} characters — ignored`);
    return { date: null, text: null };
  }
  return read;
}

/** Whether a round says anything at all: a date or words for either end. */
export function roundSaysSomething(r: { start_date: string | null; application_deadline: string | null; start_text?: string | null; deadline_text?: string | null }): boolean {
  return Boolean(r.start_date || r.application_deadline || r.start_text || r.deadline_text);
}

/**
 * One cell holding a programme's intake rounds:
 *
 *   Round 1|2026-09-01|2026-01-15; Round 2|2027-02-01|2026-09-15
 *
 * Semicolons between rounds, pipes between label, course start and apply-by. A
 * round needs at least one of the two dates or there is nothing to record; the
 * label may be left empty and is numbered.
 */
export function parseRoundsCell(cell: string | undefined, problems: RowProblem[] = []): CatalogueRound[] {
  const rounds: CatalogueRound[] = [];

  for (const entry of splitList(cell)) {
    const [label, start, deadline] = entry.split("|").map((part) => part.trim());
    const s = roundDateCell(start, problems, "round start");
    const d = roundDateCell(deadline, problems, "round deadline");
    const round = { start_date: s.date, start_text: s.text, application_deadline: d.date, deadline_text: d.text };
    if (!roundSaysSomething(round)) continue;
    rounds.push({ label: label || `Round ${rounds.length + 1}`, ...round, sort_order: rounds.length + 1 });
  }

  return rounds;
}

/**
 * The rounds a row describes, from either spelling.
 *
 * `rounds` wins where it is given; otherwise the single-intake columns become
 * Round 1. An empty result means the sheet said nothing about rounds at all,
 * which the caller must treat as "leave the stored rounds alone" rather than
 * as "this programme has no rounds".
 */
export function roundsFromRow(row: Record<string, string>, problems: RowProblem[]): CatalogueRound[] {
  const rounds = parseRoundsCell(row.rounds, problems);
  if (rounds.length > 0) return rounds;

  const s = roundDateCell(row.start_date, problems, "start_date");
  const d = roundDateCell(row.application_deadline, problems, "application_deadline");
  const round = { start_date: s.date, start_text: s.text, application_deadline: d.date, deadline_text: d.text };
  if (!roundSaysSomething(round)) return [];
  return [{ label: "Round 1", ...round, sort_order: 1 }];
}

/**
 * Do the stored rounds already say exactly what the sheet says?
 *
 * Replacing a programme's rounds is a delete and re-insert, so without this
 * every re-import of an unchanged sheet would churn every round row and fill
 * the audit log with edits that changed nothing. Compared unordered, by what a
 * round means rather than by its id, because the sheet has no ids to offer.
 */
type RoundDates = {
  label?: string | null;
  start_date: string | null;
  application_deadline: string | null;
  start_text?: string | null;
  deadline_text?: string | null;
};

export function sameRounds(stored: readonly RoundDates[], incoming: readonly CatalogueRound[]): boolean {
  if (stored.length !== incoming.length) return false;
  const key = (round: RoundDates) =>
    `${round.label ?? ""}|${round.start_date ?? ""}|${round.application_deadline ?? ""}|${round.start_text ?? ""}|${round.deadline_text ?? ""}`;
  const left = stored.map(key).sort();
  const right = incoming.map(key).sort();
  return left.every((value, index) => value === right[index]);
}

// ------------------------------------------------------ the Rounds sheet
//
// Universities announce admission rounds for the whole university, or for one
// level at it, far more often than per programme: Italy's "1st call" and
// "2nd call" apply to every master's programme at once. Repeating them on
// every programme row is how they end up inconsistent, so the workbook has a
// second sheet, one row per round, where the programme may be left out:
//
//   university_name  level    program_name   round     start_date  application_deadline
//   Sapienza                                  1st call              2027-03-15
//   Sapienza         masters                  2nd call              2027-05-30
//   Sapienza         masters  Data Science    Late                  2027-07-10
//
// A row with no programme reaches every programme the university has on file
// (narrowed to one level if the level is given), not just the ones in the
// same upload.

/** One row of the Rounds sheet. */
export type RoundSpec = {
  universityName: string;
  /** Any level (0304), compared by levelKey. */
  level: string | null;
  programName: string | null;
  round: IncomingRound;
};

/** A round as a sheet gives it. A null label is numbered when it is added. */
export type IncomingRound = {
  label: string | null;
  start_date: string | null;
  application_deadline: string | null;
  start_text: string | null;
  deadline_text: string | null;
};

/** Null when the row names no university; the reason is in `problems` when it is unusable. */
export function roundSpecFromRow(row: Record<string, string>, problems: RowProblem[]): RoundSpec | null {
  const universityName = (row.university_name ?? "").trim();
  if (!universityName) return null;

  // Any level, as the programmes have (0304); blank is every level.
  const level = normalizeLevel(row.level);

  const s = roundDateCell(row.start_date, problems, "start_date");
  const d = roundDateCell(row.application_deadline, problems, "application_deadline");
  const dates = { start_date: s.date, start_text: s.text, application_deadline: d.date, deadline_text: d.text };
  if (!roundSaysSomething(dates)) {
    problems.push(`a round with no start_date or application_deadline records nothing; ignored`);
    return null;
  }

  return {
    universityName,
    level,
    programName: (row.program_name ?? "").trim() || null,
    round: { label: (row.round ?? "").trim() || null, ...dates },
  };
}

/** A round as stored — `id` absent on one that does not exist yet. */
export type RoundLike = {
  id?: string;
  label: string;
  start_date: string | null;
  application_deadline: string | null;
  start_text: string | null;
  deadline_text: string | null;
  sort_order: number;
};

const labelKey = (label: string) => label.trim().toLowerCase().replace(/\s+/g, " ");

/** The date a round is decided by: its deadline, or its start when it has no deadline. */
const keyDate = (r: { start_date: string | null; application_deadline: string | null }) =>
  r.application_deadline ?? r.start_date ?? "";

/**
 * Rounds in the order the rest of the app needs them.
 *
 * The FIRST round is mirrored into programs.application_deadline, which the
 * reminder cron, the staff queue, the calendar and an application with no
 * deadline of its own all read as "the deadline" (0232, 0262). So the first
 * must be the next one still open: rounds whose date has not passed come
 * first, soonest first; then rounds given only in words ("Rolling"), which
 * have no date to have passed (0304); closed ones last, most recent first,
 * kept as the record of what happened. Label breaks a tie, so the order is
 * stable.
 */
export function orderRounds<T extends { label: string; start_date: string | null; application_deadline: string | null }>(
  rounds: readonly T[],
  today: string
): T[] {
  const open = rounds.filter((r) => keyDate(r) !== "" && keyDate(r) >= today);
  const worded = rounds.filter((r) => keyDate(r) === "");
  const closed = rounds.filter((r) => keyDate(r) !== "" && keyDate(r) < today);
  const byLabel = (a: T, b: T) => a.label.localeCompare(b.label);
  open.sort((a, b) => keyDate(a).localeCompare(keyDate(b)) || byLabel(a, b));
  worded.sort(byLabel);
  closed.sort((a, b) => keyDate(b).localeCompare(keyDate(a)) || byLabel(a, b));
  return [...open, ...worded, ...closed];
}

/** A round's start or deadline as a report says it: the words when there are some, else the date. */
const shownStart = (r: RoundDates) => r.start_text ?? r.start_date;
const shownDeadline = (r: RoundDates) => r.deadline_text ?? r.application_deadline;

const describeRound = (r: RoundDates) =>
  [shownDeadline(r) && `apply by ${shownDeadline(r)}`, shownStart(r) && `starts ${shownStart(r)}`]
    .filter(Boolean)
    .join(", ");

/** The two ends of a round, each a date and its words, which a sheet's one cell sets together. */
const ROUND_ENDS = [
  { date: "application_deadline", text: "deadline_text", name: "deadline" },
  { date: "start_date", text: "start_text", name: "start" },
] as const;

/**
 * What a programme's rounds become when a sheet's rounds are merged in.
 *
 * Matched by name, case and spacing aside:
 *
 *   - a round the sheet names that is on file has its dates updated — but only
 *     the dates the sheet fills in, so a row giving just a deadline leaves the
 *     stored start alone, exactly as an empty cell does everywhere else;
 *   - a round the sheet names that is not on file is added;
 *   - a round on file that the sheet does not mention is KEPT. The import
 *     never removes a round; that is the edit form's job, where you can see
 *     what you are removing.
 *
 * An unnamed round is the one on file with the same dates if there is one,
 * and otherwise is added as "Round N", numbered in date order from the first
 * number no round is using.
 *
 * A stored round keeps its id, which is the point of matching rather than
 * replacing: applications record which round they are for, and a
 * delete-and-reinsert would quietly unlink every one of them.
 *
 * When nothing changes the stored order is returned untouched, so an
 * untouched re-upload is a no-op even for a programme whose rounds were
 * ordered by hand. When something does change, the whole list is put in
 * orderRounds order.
 */
export function mergeRounds(
  stored: readonly RoundLike[],
  incoming: readonly IncomingRound[],
  today: string
): { rounds: RoundLike[]; changes: string[]; conflicts: string[] } {
  const work: RoundLike[] = [...stored].sort((a, b) => a.sort_order - b.sort_order).map((r) => ({ ...r }));
  const changes: string[] = [];
  const conflicts: string[] = [];
  const given = new Map<string, IncomingRound>();
  const unnamed: IncomingRound[] = [];

  // Whether an end of a round says the same as another's: its date and its words.
  const sameEnd = (a: RoundDates, b: RoundDates, end: (typeof ROUND_ENDS)[number]) =>
    (a[end.date] ?? null) === (b[end.date] ?? null) && (a[end.text] ?? null) === (b[end.text] ?? null);
  // A blank end says nothing, so it matches anything.
  const saysNothing = (r: RoundDates, end: (typeof ROUND_ENDS)[number]) => !r[end.date] && !r[end.text];

  for (const round of incoming) {
    if (!roundSaysSomething(round)) continue;

    if (!round.label) {
      const same = work.some((r) => ROUND_ENDS.every((end) => saysNothing(round, end) || sameEnd(r, round, end)));
      const again = unnamed.some((r) => ROUND_ENDS.every((end) => sameEnd(r, round, end)));
      if (!same && !again) unnamed.push(round);
      continue;
    }

    const key = labelKey(round.label);
    const earlier = given.get(key);
    if (earlier) {
      if (!ROUND_ENDS.every((end) => sameEnd(earlier, round, end))) {
        conflicts.push(`round "${round.label}" is given twice with different dates — kept ${describeRound(earlier)}`);
      }
      continue;
    }
    given.set(key, round);

    const target = work.find((r) => labelKey(r.label) === key);
    if (!target) {
      work.push({
        label: round.label,
        start_date: round.start_date,
        application_deadline: round.application_deadline,
        start_text: round.start_text,
        deadline_text: round.deadline_text,
        sort_order: 0,
      });
      changes.push(`added round "${round.label}" (${describeRound(round)})`);
      continue;
    }
    // One cell set an end's date and its words together, so they change
    // together: "2027-03-15" over a stored "Rolling" is the date and no words.
    for (const end of ROUND_ENDS) {
      if (saysNothing(round, end) || sameEnd(target, round, end)) continue;
      const before = (end.name === "start" ? shownStart(target) : shownDeadline(target)) ?? "—";
      const after = (end.name === "start" ? shownStart(round) : shownDeadline(round)) ?? "—";
      changes.push(`round "${target.label}" ${end.name} ${before} → ${after}`);
      target[end.date] = round[end.date];
      target[end.text] = round[end.text];
    }
  }

  unnamed.sort((a, b) => keyDate(a).localeCompare(keyDate(b)));
  const used = new Set(work.map((r) => labelKey(r.label)));
  let n = 1;
  for (const round of unnamed) {
    while (used.has(labelKey(`Round ${n}`))) n += 1;
    const label = `Round ${n}`;
    used.add(labelKey(label));
    work.push({
      label,
      start_date: round.start_date,
      application_deadline: round.application_deadline,
      start_text: round.start_text,
      deadline_text: round.deadline_text,
      sort_order: 0,
    });
    changes.push(`added round "${label}" (${describeRound(round)})`);
  }

  if (changes.length === 0) {
    return { rounds: [...stored].sort((a, b) => a.sort_order - b.sort_order).map((r) => ({ ...r })), changes, conflicts };
  }
  return {
    rounds: orderRounds(work, today).map((r, i) => ({ ...r, sort_order: i + 1 })),
    changes,
    conflicts,
  };
}

/** A destination as the `destination` column is matched against it. */
export type DestinationRef = {
  id: string;
  display_name: string;
  country: string;
  country_code: string;
  track: string;
};

/** Lower-case, punctuation to spaces: "Italy (Public)" and "italy - public" agree. */
function destinationKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Which destination a row's `destination` cell means.
 *
 * Three spellings are accepted, tried in this order: the display name the
 * export writes ("Italy (Public)"), the country ("Italy"), and its two-letter
 * code ("IT"). The display name comes first because it is the only one that
 * is unique by construction — destinations are unique per country AND track,
 * so "Italy" names two destinations the day a private Italian track is added.
 * When a spelling matches more than one destination the row is refused with
 * the choices named, rather than filed under whichever came first.
 */
export function resolveDestination(
  cell: string,
  destinations: readonly DestinationRef[]
): { destination: DestinationRef; error?: undefined } | { error: string; destination?: undefined } {
  const key = destinationKey(cell);
  if (!key) return { error: "no destination" };

  const tiers: ((d: DestinationRef) => boolean)[] = [
    (d) => destinationKey(d.display_name) === key,
    (d) => destinationKey(d.country) === key,
    (d) => d.country_code.toLowerCase() === key,
  ];
  for (const matches of tiers) {
    const found = destinations.filter(matches);
    if (found.length === 1) return { destination: found[0] };
    if (found.length > 1) {
      return {
        error: `destination "${cell.trim()}" could be ${found.map((d) => `"${d.display_name}"`).join(" or ")} — write the full name`,
      };
    }
  }
  return { error: `destination "${cell.trim()}" is not one the portal has` };
}

/** What a sheet says about a university. Nulls mean "said nothing". */
export type UniversityInput = {
  name: string;
  /** Null says nothing, as everywhere here: a blank cell never clears one set in Setup. */
  short_name: string | null;
  city: string | null;
  region: string | null;
  type: "public" | "private" | null;
  levels_offered: string[];
  fields_offered: string[];
  contact_email: string | null;
  /** An amount or words (0303). */
  application_fee: string | null;
  application_fee_currency: string | null;
  /** The body's name as the sheet gives it; resolveDsuBody turns it into one on file. */
  dsu_body: string | null;
};

export function universityFromRow(
  row: Record<string, string>,
  nameKey: "name" | "university_name",
  problems: RowProblem[]
): UniversityInput | null {
  const name = (row[nameKey] ?? "").trim();
  if (!name) return null;

  const rawType = (row.type ?? "").trim().toLowerCase();
  let type: "public" | "private" | null = null;
  if (rawType === "public" || rawType === "private") type = rawType;
  else if (rawType !== "") problems.push(`type "${row.type}" is neither public nor private — ignored`);

  // The combined sheet carries a university fee and a programme fee on one
  // row, so there the columns say whose; the universities sheet has only one.
  const feeKey = nameKey === "university_name" ? "university_application_fee" : "application_fee";
  const currencyKey = `${feeKey}_currency`;

  // The combined sheet names it for the university, as it does the fee.
  const shortKey = nameKey === "university_name" ? "university_short_name" : "short_name";
  const short_name = (row[shortKey] ?? "").trim().replace(/\s+/g, " ") || null;
  if (short_name && short_name.length > TYPED_SHORT_NAME_MAX) {
    problems.push(`${shortKey} "${short_name}" is longer than ${TYPED_SHORT_NAME_MAX} characters — ignored`);
  }

  return {
    name,
    short_name: short_name && short_name.length <= TYPED_SHORT_NAME_MAX ? short_name : null,
    city: (row.city ?? "").trim() || null,
    region: (row.region ?? "").trim() || null,
    type,
    levels_offered: splitList(row.levels_offered),
    fields_offered: splitList(row.fields_offered),
    contact_email: parseEmailsCell(row.contact_email, problems, "contact_email"),
    application_fee: parseFeeCell(row[feeKey], problems, feeKey),
    application_fee_currency: parseFeeCurrency(row[currencyKey], row[feeKey], problems, currencyKey),
    dsu_body: (row.dsu_body ?? "").trim() || null,
  };
}

/** A scholarship body as the dsu_body column is matched against it. */
export type DsuBodyRef = { id: string; name: string; destinationIds: string[] };

/** Letters and digits only: "ER.GO", "ERGO" and "er go" are one body. */
const bodyKey = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/**
 * Which body a dsu_body cell names, among those that serve the university's
 * destination (Setup → Scholarship bodies).
 *
 * Only that destination's bodies are candidates: an Italian university paid
 * by a German scheme is a mistake in the sheet, and saying so beats filing it.
 * A name that is not in the directory at all is reported rather than created —
 * a body needs its deadlines and thresholds, which a sheet cell cannot carry.
 */
export function resolveDsuBody(
  cell: string,
  destinationId: string,
  bodies: readonly DsuBodyRef[]
): { body: DsuBodyRef; error?: undefined } | { error: string; body?: undefined } {
  const key = bodyKey(cell);
  if (!key) return { error: "no DSU body named" };
  const named = bodies.filter((b) => bodyKey(b.name) === key);
  const here = named.filter((b) => b.destinationIds.includes(destinationId));
  if (here.length === 1) return { body: here[0] };
  if (here.length > 1) return { error: `DSU body "${cell.trim()}" matches more than one body — rename one in Scholarship bodies` };
  if (named.length > 0) return { error: `DSU body "${cell.trim()}" does not serve this destination — left unchanged` };
  return { error: `DSU body "${cell.trim()}" is not in Setup → Scholarship bodies — left unchanged` };
}

/**
 * The three standard levels — offered as suggestions, and what students are
 * matched by. A programme's level may be anything else as well (0304).
 */
export const PROGRAM_LEVELS = STANDARD_LEVELS;
export type ProgramLevel = (typeof PROGRAM_LEVELS)[number];

/** What a sheet says about a programme. Nulls mean "said nothing". */
export type ProgramInput = {
  /** Any level (0304): one of the three when it is a spelling of one, otherwise as written. */
  level: string;
  name: string;
  core_field: string | null;
  sub_field: string | null;
  page_link: string | null;
  /** "yes", "no", or words (0304). */
  interview_required: string | null;
  interview_details: string | null;
  /** "yes", "no", or words (0304). */
  admission_test_required: string | null;
  admission_test_type: string | null;
  application_portal_name: string | null;
  application_portal_link: string | null;
  intake_dates: string[];
  tuition_fee: string | null;
  duration: string | null;
  language_requirement: string | null;
  application_fee: string | null;
  application_fee_currency: string | null;
  coordinator_email: string | null;
};

/**
 * Returns null when the row does not describe a programme at all — no name, or
 * no usable level. In the combined catalogue sheet that is a legitimate row: a
 * university with no programmes listed yet.
 */
export function programFromRow(
  row: Record<string, string>,
  nameKey: "name" | "program_name",
  problems: RowProblem[]
): ProgramInput | null {
  const name = (row[nameKey] ?? "").trim();
  const level = normalizeLevel(row.level);
  if (!name && !level) return null;

  if (!name) {
    problems.push(`a level ("${level}") with no programme name`);
    return null;
  }
  // Any level at all (0304) — but some level: it is half of what tells two
  // programmes of the same name apart.
  if (!level) {
    problems.push(`programme "${name}" has no level — write bachelors, masters, phd, or what the university calls it`);
    return null;
  }
  if (level.length > LEVEL_MAX) {
    problems.push(`programme "${name}" has a level longer than ${LEVEL_MAX} characters`);
    return null;
  }

  // As for the university: the combined sheet says whose fee it is.
  const feeKey = nameKey === "program_name" ? "program_application_fee" : "application_fee";
  const currencyKey = `${feeKey}_currency`;

  return {
    level,
    name,
    core_field: (row.core_field ?? "").trim() || null,
    sub_field: (row.sub_field ?? "").trim() || null,
    page_link: (row.page_link ?? "").trim() || null,
    interview_required: parseYesNoCell(row.interview_required, problems, "interview_required"),
    interview_details: (row.interview_details ?? "").trim() || null,
    admission_test_required: parseYesNoCell(row.admission_test_required, problems, "admission_test_required"),
    admission_test_type: (row.admission_test_type ?? "").trim() || null,
    application_portal_name: (row.application_portal_name ?? "").trim() || null,
    application_portal_link: (row.application_portal_link ?? "").trim() || null,
    intake_dates: splitList(row.intake_dates),
    tuition_fee: parseTuitionCell(row.tuition_fee, problems, "tuition_fee"),
    duration: (row.duration ?? "").trim() || null,
    language_requirement: (row.language_requirement ?? "").trim() || null,
    application_fee: parseFeeCell(row[feeKey], problems, feeKey),
    application_fee_currency: parseFeeCurrency(row[currencyKey], row[feeKey], problems, currencyKey),
    coordinator_email: parseEmailsCell(row.coordinator_email, problems, "coordinator_email"),
  };
}

/** Whether two levels are one: "Foundation" and "foundation", "Master's" and "masters". */
export function sameLevel(a: string | null | undefined, b: string | null | undefined): boolean {
  return levelKey(a) === levelKey(b);
}

// ----------------------------------------------------- creating a new row
//
// These build a COMPLETE row — every column, every time — and that is the
// whole point of them.
//
// The obvious thing is to drop the keys the sheet said nothing about and let
// the column defaults fill them in. That does not work for a batch. PostgREST
// takes the union of the keys across a multi-row insert and sends NULL for
// every key a given row is missing, so a default never applies to a row whose
// neighbours mentioned a column it did not. One university listing
// levels_offered and another leaving it blank sent null into a NOT NULL column
// and failed the entire insert — and for a nullable column it would have
// written the nulls without a word.
//
// So every row carries every column, and "said nothing" resolves here to the
// column's own default rather than to an omission.
//
// Nothing like this applies on an update, where a blank is genuinely absent
// from the patch and the stored value stays. See importMerge.mergeRow.

export function universityInsertValues(
  input: UniversityInput,
  destinationId: string,
  defaultType: string,
  dsuBodyId: string | null = null
) {
  return {
    destination_id: destinationId,
    name: input.name,
    short_name: input.short_name,
    // A new university inherits the destination's own track when the sheet is
    // silent, rather than a hardcoded "public".
    type: input.type ?? defaultType,
    city: input.city,
    region: input.region,
    contact_email: input.contact_email,
    // Both are `not null default '{}'`, and splitList already yields [].
    levels_offered: input.levels_offered,
    fields_offered: input.fields_offered,
    // Null currency beside a fee is filled from the destination by a trigger (0287).
    application_fee: input.application_fee,
    application_fee_currency: input.application_fee_currency,
    dsu_body_id: dsuBodyId,
  };
}

export function programInsertValues(input: ProgramInput, universityId: string) {
  return {
    university_id: universityId,
    level: input.level,
    name: input.name,
    core_field: input.core_field,
    sub_field: input.sub_field,
    page_link: input.page_link,
    // Text since 0304, and nullable: a blank cell on a new programme is "not
    // known", not "no".
    interview_required: input.interview_required,
    interview_details: input.interview_details,
    admission_test_required: input.admission_test_required,
    admission_test_type: input.admission_test_type,
    application_portal_name: input.application_portal_name,
    application_portal_link: input.application_portal_link,
    intake_dates: input.intake_dates,
    tuition_fee: input.tuition_fee,
    duration: input.duration,
    language_requirement: input.language_requirement,
    application_fee: input.application_fee,
    application_fee_currency: input.application_fee_currency,
    coordinator_email: input.coordinator_email,
  };
}
