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
 */
export const CATALOGUE_COLUMNS = [
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
  { header: "rounds", width: 46, group: "programme" },
  { header: "start_date", width: 14, group: "programme" },
  { header: "application_deadline", width: 20, group: "programme" },
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

/** "Round 1|2026-09-01|2026-01-15; Round 2|2027-02-01|2026-09-15" */
export function roundsCell(rounds: readonly ExportRound[]): string {
  return [...rounds]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .filter((r) => r.start_date || r.application_deadline)
    .map((r) => `${r.label ?? ""}|${r.start_date ?? ""}|${r.application_deadline ?? ""}`)
    .join("; ");
}

export type ExportUniversity = {
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
    university_name: university.name,
    city: university.city ?? "",
    region: university.region ?? "",
    type: university.type ?? "",
    levels_offered: listCell(university.levels_offered),
    fields_offered: listCell(university.fields_offered),
    contact_email: university.contact_email ?? "",
  };
}

/**
 * One university's rows: one per programme, or a single row with the
 * programme columns blank when it has none.
 *
 * start_date and application_deadline are left empty on purpose. They are the
 * single-intake shorthand on the way in, and `rounds` already carries every
 * round — writing both would put the same dates in the sheet twice, and
 * `rounds` wins anyway.
 */
export function catalogueRowsForUniversity(
  university: ExportUniversity,
  programmes: readonly { program: ExportProgram; rounds: readonly ExportRound[] }[]
): CatalogueRow[] {
  const shared = universityCells(university);
  if (programmes.length === 0) return [{ ...blankRow(), ...shared }];

  return programmes.map(({ program, rounds }) => ({
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
    rounds: roundsCell(rounds),
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
