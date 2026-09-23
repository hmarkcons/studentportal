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

/** An intake round as a sheet describes it, before it reaches the database. */
export type CatalogueRound = {
  label: string;
  start_date: string | null;
  application_deadline: string | null;
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
 */
export function parseBool(value: string | undefined): boolean | null {
  const text = (value ?? "").trim().toLowerCase();
  if (text === "") return null;
  if (["yes", "true", "1", "y"].includes(text)) return true;
  if (["no", "false", "0", "n"].includes(text)) return false;
  return null;
}

/**
 * A money cell, tolerating the way people actually type one.
 *
 * "€3,000" and "3 000" are a number somebody wrote for a human. Something that
 * is not a number at all is reported rather than dropped: a tuition fee read
 * as nothing looks exactly like a tuition fee nobody filled in.
 */
export function parseMoney(value: string | undefined, problems: RowProblem[], label: string): number | null {
  const raw = (value ?? "").trim();
  if (raw === "") return null;
  const cleaned = raw.replace(/[€$£,\s]/g, "");
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    problems.push(`${label} "${raw}" is not a number — left unchanged`);
    return null;
  }
  return parsed;
}

/** YYYY-MM-DD, or null. Anything else is reported rather than sent to Postgres. */
export function parseDay(value: string | undefined, problems: RowProblem[], label: string): string | null {
  const raw = (value ?? "").trim();
  if (raw === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    problems.push(`${label} "${raw}" is not a YYYY-MM-DD date — ignored`);
    return null;
  }
  return raw;
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
    const start_date = parseDay(start, problems, "round start");
    const application_deadline = parseDay(deadline, problems, "round deadline");
    if (!start_date && !application_deadline) continue;
    rounds.push({
      label: label || `Round ${rounds.length + 1}`,
      start_date,
      application_deadline,
      sort_order: rounds.length + 1,
    });
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

  const start_date = parseDay(row.start_date, problems, "start_date");
  const application_deadline = parseDay(row.application_deadline, problems, "application_deadline");
  if (!start_date && !application_deadline) return [];
  return [{ label: "Round 1", start_date, application_deadline, sort_order: 1 }];
}

/**
 * Do the stored rounds already say exactly what the sheet says?
 *
 * Replacing a programme's rounds is a delete and re-insert, so without this
 * every re-import of an unchanged sheet would churn every round row and fill
 * the audit log with edits that changed nothing. Compared unordered, by what a
 * round means rather than by its id, because the sheet has no ids to offer.
 */
export function sameRounds(
  stored: readonly { label: string; start_date: string | null; application_deadline: string | null }[],
  incoming: readonly CatalogueRound[]
): boolean {
  if (stored.length !== incoming.length) return false;
  const key = (round: { label: string; start_date: string | null; application_deadline: string | null }) =>
    `${round.label}|${round.start_date ?? ""}|${round.application_deadline ?? ""}`;
  const left = stored.map(key).sort();
  const right = incoming.map(key).sort();
  return left.every((value, index) => value === right[index]);
}

/** What a sheet says about a university. Nulls mean "said nothing". */
export type UniversityInput = {
  name: string;
  city: string | null;
  region: string | null;
  type: "public" | "private" | null;
  levels_offered: string[];
  fields_offered: string[];
  contact_email: string | null;
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

  return {
    name,
    city: (row.city ?? "").trim() || null,
    region: (row.region ?? "").trim() || null,
    type,
    levels_offered: splitList(row.levels_offered),
    fields_offered: splitList(row.fields_offered),
    contact_email: (row.contact_email ?? "").trim() || null,
  };
}

export const PROGRAM_LEVELS = ["bachelors", "masters", "phd"] as const;
export type ProgramLevel = (typeof PROGRAM_LEVELS)[number];

/** What a sheet says about a programme. Nulls mean "said nothing". */
export type ProgramInput = {
  level: ProgramLevel;
  name: string;
  core_field: string | null;
  sub_field: string | null;
  page_link: string | null;
  interview_required: boolean | null;
  interview_details: string | null;
  admission_test_required: boolean | null;
  admission_test_type: string | null;
  application_portal_name: string | null;
  application_portal_link: string | null;
  intake_dates: string[];
  tuition_fee: number | null;
  duration: string | null;
  language_requirement: string | null;
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
  const level = (row.level ?? "").trim().toLowerCase();
  if (!name && !level) return null;

  if (!name) {
    problems.push(`a level ("${level}") with no programme name`);
    return null;
  }
  if (!PROGRAM_LEVELS.includes(level as ProgramLevel)) {
    problems.push(`programme "${name}" has level "${row.level ?? ""}" — must be bachelors, masters or phd`);
    return null;
  }

  return {
    level: level as ProgramLevel,
    name,
    core_field: (row.core_field ?? "").trim() || null,
    sub_field: (row.sub_field ?? "").trim() || null,
    page_link: (row.page_link ?? "").trim() || null,
    interview_required: parseBool(row.interview_required),
    interview_details: (row.interview_details ?? "").trim() || null,
    admission_test_required: parseBool(row.admission_test_required),
    admission_test_type: (row.admission_test_type ?? "").trim() || null,
    application_portal_name: (row.application_portal_name ?? "").trim() || null,
    application_portal_link: (row.application_portal_link ?? "").trim() || null,
    intake_dates: splitList(row.intake_dates),
    tuition_fee: parseMoney(row.tuition_fee, problems, "tuition_fee"),
    duration: (row.duration ?? "").trim() || null,
    language_requirement: (row.language_requirement ?? "").trim() || null,
  };
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

export function universityInsertValues(input: UniversityInput, destinationId: string, defaultType: string) {
  return {
    destination_id: destinationId,
    name: input.name,
    // A new university inherits the destination's own track when the sheet is
    // silent, rather than a hardcoded "public".
    type: input.type ?? defaultType,
    city: input.city,
    region: input.region,
    contact_email: input.contact_email,
    // Both are `not null default '{}'`, and splitList already yields [].
    levels_offered: input.levels_offered,
    fields_offered: input.fields_offered,
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
    // `not null default false`. On a row that does not exist yet there is no
    // stored value to preserve, so a blank cell settles as "no" — which is
    // what the column default would have said anyway.
    interview_required: input.interview_required ?? false,
    interview_details: input.interview_details,
    admission_test_required: input.admission_test_required ?? false,
    admission_test_type: input.admission_test_type,
    application_portal_name: input.application_portal_name,
    application_portal_link: input.application_portal_link,
    intake_dates: input.intake_dates,
    tuition_fee: input.tuition_fee,
    duration: input.duration,
    language_requirement: input.language_requirement,
  };
}
