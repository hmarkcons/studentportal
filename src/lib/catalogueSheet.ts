// The shape of the combined catalogue sheet, and how a stored row is written
// back into it.
//
// One definition, two routes: /api/samples/catalogue writes an empty template
// with an example in it, /api/export/catalogue writes the same sheet filled
// with what a destination currently holds. They have to agree column for
// column, because the whole point is the round trip — export, edit the blanks
// in Excel, upload the same file back.
//
// Which gives the import a property worth protecting: **re-importing an
// untouched export must change nothing at all.** Every name matches exactly,
// so nothing is held back; every value matches what is stored, so nothing is
// an update. If that ever stops being true, either the serialisation here or
// the parsing in catalogueRows.ts has drifted, and check:catalogue asserts it
// end to end.
//
// Deliberately free of `@/` imports so it can be unit-tested directly under
// Node; the dropdowns the routes add are their own business.

export const CATALOGUE_SHEET = "Catalogue";
export const CATALOGUE_LIST_SHEET = "Lists";

export const CATALOGUE_LEVELS = ["bachelors", "masters", "phd"] as const;
export const CATALOGUE_TYPES = ["public", "private"] as const;
export const CATALOGUE_YES_NO = ["yes", "no"] as const;

/**
 * The university columns come first and repeat on every one of that
 * university's rows; the programme columns follow. Leaving all of the second
 * group blank imports the university on its own.
 *
 * Intake rounds are not here: they have a sheet of their own, below. The
 * importer still reads the old `rounds`, `start_date` and
 * `application_deadline` columns if a sheet has them, so files made before
 * the Rounds sheet existed import as they always did.
 */
export const CATALOGUE_COLUMNS = [
  // Which destination the row belongs to. Blank falls back to the one picked
  // in the form, so a single-country sheet can leave it out entirely.
  { header: "destination", width: 22, group: "university" },
  { header: "university_name", width: 34, group: "university" },
  { header: "city", width: 16, group: "university" },
  { header: "region", width: 16, group: "university" },
  { header: "type", width: 10, group: "university" },
  { header: "levels_offered", width: 22, group: "university" },
  { header: "fields_offered", width: 24, group: "university" },
  { header: "contact_email", width: 26, group: "university" },
  { header: "level", width: 12, group: "programme" },
  { header: "program_name", width: 30, group: "programme" },
  { header: "core_field", width: 20, group: "programme" },
  { header: "sub_field", width: 20, group: "programme" },
  { header: "tuition_fee", width: 12, group: "programme" },
  { header: "duration", width: 12, group: "programme" },
  { header: "language_requirement", width: 20, group: "programme" },
  { header: "intake_dates", width: 18, group: "programme" },
  { header: "interview_required", width: 18, group: "programme" },
  { header: "interview_details", width: 24, group: "programme" },
  { header: "admission_test_required", width: 22, group: "programme" },
  { header: "admission_test_type", width: 20, group: "programme" },
  { header: "application_portal_name", width: 22, group: "programme" },
  { header: "application_portal_link", width: 28, group: "programme" },
  { header: "page_link", width: 28, group: "programme" },
] as const;

export type CatalogueHeader = (typeof CATALOGUE_COLUMNS)[number]["header"];

/** 1-based, which is what a spreadsheet's data-validation ranges want. */
export function catalogueColumnIndex(header: CatalogueHeader): number {
  return CATALOGUE_COLUMNS.findIndex((c) => c.header === header) + 1;
}

export type CatalogueRow = Record<CatalogueHeader, string>;

function blankRow(): CatalogueRow {
  return Object.fromEntries(CATALOGUE_COLUMNS.map((c) => [c.header, ""])) as CatalogueRow;
}

/** Semicolon-separated within one cell, matching splitList on the way back in. */
function listCell(values: readonly string[] | null | undefined): string {
  return (values ?? []).join("; ");
}

/**
 * A number as the sheet should carry it.
 *
 * Trailing zeros trimmed, because numeric(12,2) hands back "3000.00" and a
 * round trip has to produce a cell that reads back as the same value without
 * looking like somebody edited it.
 */
function moneyCell(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : "";
}

function boolCell(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  return value ? "yes" : "no";
}

export type ExportRound = {
  label: string | null;
  start_date: string | null;
  application_deadline: string | null;
  sort_order?: number | null;
};

/** "Round 1|2026-09-01|2026-01-15; Round 2|2027-02-01|2026-09-15" — the old one-cell form, still read on import. */
export function roundsCell(rounds: readonly ExportRound[]): string {
  return [...rounds]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .filter((r) => r.start_date || r.application_deadline)
    .map((r) => `${r.label ?? ""}|${r.start_date ?? ""}|${r.application_deadline ?? ""}`)
    .join("; ");
}

export type ExportUniversity = {
  /** The destination's display name. Optional so a caller that has none still builds a row. */
  destination?: string | null;
  name: string;
  city: string | null;
  region: string | null;
  type: string | null;
  levels_offered: string[] | null;
  fields_offered: string[] | null;
  contact_email: string | null;
};

export type ExportProgram = {
  level: string;
  name: string;
  core_field: string | null;
  sub_field: string | null;
  tuition_fee: number | string | null;
  duration: string | null;
  language_requirement: string | null;
  intake_dates: string[] | null;
  interview_required: boolean | null;
  interview_details: string | null;
  admission_test_required: boolean | null;
  admission_test_type: string | null;
  application_portal_name: string | null;
  application_portal_link: string | null;
  page_link: string | null;
};

function universityCells(university: ExportUniversity): Partial<CatalogueRow> {
  return {
    destination: university.destination ?? "",
    university_name: university.name,
    city: university.city ?? "",
    region: university.region ?? "",
    type: university.type ?? "",
    levels_offered: listCell(university.levels_offered),
    fields_offered: listCell(university.fields_offered),
    contact_email: university.contact_email ?? "",
  };
}

/** One university's rows: one per programme, or a single row with the programme columns blank when it has none. */
export function catalogueRowsForUniversity(
  university: ExportUniversity,
  programmes: readonly { program: ExportProgram }[]
): CatalogueRow[] {
  const shared = universityCells(university);
  if (programmes.length === 0) return [{ ...blankRow(), ...shared }];

  return programmes.map(({ program }) => ({
    ...blankRow(),
    ...shared,
    level: program.level,
    program_name: program.name,
    core_field: program.core_field ?? "",
    sub_field: program.sub_field ?? "",
    tuition_fee: moneyCell(program.tuition_fee),
    duration: program.duration ?? "",
    language_requirement: program.language_requirement ?? "",
    intake_dates: listCell(program.intake_dates),
    interview_required: boolCell(program.interview_required),
    interview_details: program.interview_details ?? "",
    admission_test_required: boolCell(program.admission_test_required),
    admission_test_type: program.admission_test_type ?? "",
    application_portal_name: program.application_portal_name ?? "",
    application_portal_link: program.application_portal_link ?? "",
    page_link: program.page_link ?? "",
  }));
}

/** Ordered the way a person reads a catalogue: university, then level, then name. */
const LEVEL_ORDER: Record<string, number> = { bachelors: 0, masters: 1, phd: 2 };

export function compareProgrammes(a: ExportProgram, b: ExportProgram): number {
  const byLevel = (LEVEL_ORDER[a.level] ?? 9) - (LEVEL_ORDER[b.level] ?? 9);
  return byLevel !== 0 ? byLevel : a.name.localeCompare(b.name);
}

// ------------------------------------------------------------ the Rounds sheet

export const ROUNDS_SHEET = "Rounds";

export const ROUND_COLUMNS = [
  { header: "destination", width: 22 },
  { header: "university_name", width: 34 },
  // Blank: every level. Filled with no programme: every programme at that level.
  { header: "level", width: 12 },
  // Blank: every programme the university (at that level) has on file.
  { header: "program_name", width: 34 },
  { header: "round", width: 22 },
  { header: "start_date", width: 14 },
  { header: "application_deadline", width: 20 },
] as const;

export type RoundHeader = (typeof ROUND_COLUMNS)[number]["header"];
export type RoundRow = Record<RoundHeader, string>;

export function roundColumnIndex(header: RoundHeader): number {
  return ROUND_COLUMNS.findIndex((c) => c.header === header) + 1;
}

function roundSignature(rounds: readonly ExportRound[]): string {
  return sortedRounds(rounds)
    .map((r) => `${r.label ?? ""}|${r.start_date ?? ""}|${r.application_deadline ?? ""}`)
    .join(";");
}

function sortedRounds(rounds: readonly ExportRound[]): ExportRound[] {
  return [...rounds]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .filter((r) => r.start_date || r.application_deadline);
}

/** True when every programme listed carries exactly the same, non-empty rounds. */
function allShare(programmes: readonly { rounds: readonly ExportRound[] }[]): boolean {
  if (programmes.length === 0) return false;
  const first = roundSignature(programmes[0].rounds);
  return first !== "" && programmes.every((p) => roundSignature(p.rounds) === first);
}

/**
 * One university's intake rounds as Rounds-sheet rows, written at the widest
 * scope that is still exact.
 *
 * If every one of its programmes has the same rounds, they are written once
 * with level and programme blank — Italy's 341 programmes share two rounds, and
 * 682 identical rows would bury the one that differs. Failing that, once per
 * level where every programme at that level agrees, and otherwise per
 * programme.
 *
 * "Every" has to include the programmes with no rounds at all: a
 * university-wide row reaches every programme on import, so writing one when a
 * programme had none would hand it rounds it did not have, and an untouched
 * round trip would stop being a no-op.
 */
export function roundRowsForUniversity(
  destination: string,
  universityName: string,
  programmes: readonly { program: Pick<ExportProgram, "level" | "name">; rounds: readonly ExportRound[] }[]
): RoundRow[] {
  const rowsFor = (rounds: readonly ExportRound[], level: string, programName: string): RoundRow[] =>
    sortedRounds(rounds).map((r) => ({
      destination,
      university_name: universityName,
      level,
      program_name: programName,
      round: r.label ?? "",
      start_date: r.start_date ?? "",
      application_deadline: r.application_deadline ?? "",
    }));

  if (allShare(programmes)) return rowsFor(programmes[0].rounds, "", "");

  const rows: RoundRow[] = [];
  const levels = [...new Set(programmes.map((p) => p.program.level))].sort(
    (a, b) => (LEVEL_ORDER[a] ?? 9) - (LEVEL_ORDER[b] ?? 9)
  );
  for (const level of levels) {
    const atLevel = programmes.filter((p) => p.program.level === level);
    if (allShare(atLevel)) {
      rows.push(...rowsFor(atLevel[0].rounds, level, ""));
      continue;
    }
    for (const p of [...atLevel].sort((a, b) => compareProgrammes(a.program as ExportProgram, b.program as ExportProgram))) {
      rows.push(...rowsFor(p.rounds, level, p.program.name));
    }
  }
  return rows;
}

// ------------------------------------------------------ the template's examples

/**
 * The university the blank template's example rows use.
 *
 * Deliberately not a real one. The examples used to be Sapienza, which is on
 * file in Italy — so a template filled in beneath its examples and uploaded
 * without deleting them would have "updated" the real Sapienza with the
 * example's fee and links. A made-up name that says what to do with it is
 * skipped on import instead (isExampleRow), and could not match anything real.
 */
export const EXAMPLE_UNIVERSITY = "Example University (delete these rows)";

export function isExampleRow(row: Record<string, string>): boolean {
  return (row.university_name ?? "").trim().toLowerCase().startsWith("example university");
}
