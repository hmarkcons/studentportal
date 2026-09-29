// The shape of the scholarship bodies sheet, and how a stored body is written
// back into it.
//
// One definition, two routes and an importer: /api/samples/scholarship-bodies
// writes an empty template with an example in it, /api/export/scholarship-bodies
// writes the same sheet filled with every body on file, and the import reads
// it back. They have to agree column for column, because the point is the
// round trip — download the directory, edit it in Excel, upload it again.
//
// So the property that matters, exactly as for the catalogue: **re-importing
// an untouched export changes nothing.** Every name matches exactly, every
// cell reads back as what is stored. If that stops being true, either the
// serialisation here or the parsing in scholarshipBodyRows.ts has drifted;
// scripts/scholarship-body-rows-test.mjs asserts it, and
// check:scholarshipimport asserts it end to end.
//
// Headers are written for people ("Universities covered", "Guide 1 title")
// and read through normalizeHeader, so the snake_case spelling a CSV might use
// ("universities_covered", "guide_1_title") is the same column.
//
// Deliberately free of `@/` imports so it can be unit-tested under plain Node.

import { normalizeHeader } from "./catalogueSheet.ts";

export const BODY_SHEET = "Scholarship bodies";
export const BODY_HELP_SHEET = "How to fill";
export const BODY_LIST_SHEET = "Lists";

export const CALL_STATUSES = ["published", "awaiting"] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];

/**
 * The limits the edit form's guide is held to (readGuideSections in
 * src/lib/actions/scholarships.ts). The form trims to them; the import refuses
 * instead, because a guide cut short without a word is a guide that silently
 * lost its last paragraph.
 */
export const GUIDE_LIMITS = { sections: 40, title: 120, text: 8000 } as const;

/** Guide pairs in the blank template. The export widens to fit the longest guide on file. */
export const TEMPLATE_GUIDE_PAIRS = 12;

/**
 * Every column but the guide's, in sheet order. `key` is the header as the
 * importer reads it; `note` is what the How to fill sheet says about it.
 */
export const BODY_COLUMNS = [
  {
    key: "name",
    header: "Name",
    width: 30,
    note:
      "Required. How the import finds the body: the same name updates it, a new name adds one. A name close to " +
      "one on file (a typo, punctuation) updates that body and keeps its stored name. The import never renames a body.",
  },
  {
    key: "countries",
    header: "Countries",
    width: 30,
    note:
      "The destinations the body serves, separated by semicolons — Italy (Public); Italy (Private). Copy the names " +
      "from the Lists sheet. A country's own name (Italy) means every destination of that country. Filled in, the " +
      "body serves exactly these; left blank, its countries stay as they are. A new body needs at least one.",
  },
  { key: "region", header: "Region", width: 16, note: "Italy's DSU bodies are regional. Leave blank where it means nothing." },
  {
    key: "universities_covered",
    header: "Universities covered",
    width: 34,
    note:
      "The universities the body pays for, separated by semicolons — or one per line, which is how the export writes " +
      "an entry that has a semicolon of its own. This is what maps a student's university to its body. Filled in, it " +
      "replaces the stored list.",
  },
  { key: "academic_year", header: "Academic year", width: 14, note: "Required for a new body, e.g. 2026/2027." },
  {
    key: "application_deadline",
    header: "Application deadline",
    width: 26,
    note: "As the call words it — many carry a time, and some two dates. Text, not a date cell.",
  },
  { key: "document_upload_deadline", header: "Document upload deadline", width: 26, note: "As the call words it." },
  { key: "courier_deadline", header: "Courier deadline", width: 22, note: "As the call words it." },
  { key: "isee_threshold", header: "ISEE threshold", width: 16, note: "e.g. ≤€26,887.93" },
  { key: "ispe_threshold", header: "ISPE threshold", width: 16, note: "e.g. ≤€58,452.06" },
  { key: "stipend_amount", header: "Stipend amount", width: 26, note: "The stipend, or a note about it." },
  { key: "benefits", header: "Benefits", width: 30, note: "e.g. free meals at university canteens." },
  { key: "source_url", header: "Source URL", width: 30, note: "The body's own page. A full address, starting https://." },
  { key: "apply_url", header: "Apply URL", width: 30, note: "Where the student actually submits. A full address." },
  {
    key: "call_status",
    header: "Call status",
    width: 14,
    note:
      "published (this year's call is out and the guide reflects it) or awaiting (not published yet). Setting a call " +
      "to published clears its expected date, as the edit form does.",
  },
  {
    key: "call_expected_on",
    header: "Call expected on",
    width: 16,
    note: "When the region usually publishes — only for a call that is awaiting. An Excel date, 2027-03-15 or 15 Mar 2027.",
  },
  { key: "call_pdf_url", header: "Call PDF URL", width: 30, note: "Link to the official call document. A full address." },
  {
    key: "call_page_url",
    header: "Call page URL",
    width: 30,
    note: "The page the call is published on, for regions that publish it with annexes rather than as one PDF.",
  },
  { key: "call_notes", header: "Call notes", width: 30, note: "Anything else about this year's call." },
] as const;

export type BodyColumnKey = (typeof BODY_COLUMNS)[number]["key"];

export type SheetColumn = { key: string; header: string; width: number; note: string };

export const guideTitleKey = (n: number) => `guide_${n}_title`;
export const guideTextKey = (n: number) => `guide_${n}_text`;

/** "Guide 1 title", "Guide 1 text", … for as many pairs as asked. */
export function guideColumns(pairs: number): SheetColumn[] {
  const columns: SheetColumn[] = [];
  for (let n = 1; n <= pairs; n++) {
    columns.push(
      { key: guideTitleKey(n), header: `Guide ${n} title`, width: 24, note: "" },
      { key: guideTextKey(n), header: `Guide ${n} text`, width: 50, note: "" }
    );
  }
  return columns;
}

/** The whole header row: the body's columns, then the guide's pairs. */
export function bodySheetColumns(pairs: number = TEMPLATE_GUIDE_PAIRS): SheetColumn[] {
  return [...BODY_COLUMNS, ...guideColumns(pairs)];
}

/** 1-based, which is what a spreadsheet's data-validation ranges want. */
export function bodyColumnIndex(key: BodyColumnKey): number {
  return BODY_COLUMNS.findIndex((c) => c.key === key) + 1;
}

/**
 * How many guide pairs a sheet needs to carry every guide in full.
 *
 * Never fewer than the template's twelve, and deliberately not capped. An
 * export that stopped short would hand back a thirteen-section guide cut to
 * twelve — and re-importing it would REPLACE the guide with the shortened
 * one, deleting a section from a sheet nobody edited. A guide over the limit
 * (which the edit form cannot make) is written whole instead, and the import
 * refuses it and leaves it alone.
 */
export function guidePairsFor(sectionCounts: readonly number[]): number {
  return Math.max(TEMPLATE_GUIDE_PAIRS, ...sectionCounts);
}

// ------------------------------------------------------------ column names

/** Other spellings people give a column, after normalizeHeader. */
const HEADER_ALIASES: Record<string, BodyColumnKey> = {
  body: "name",
  body_name: "name",
  scholarship_body: "name",
  country: "countries",
  destination: "countries",
  destinations: "countries",
  covers: "universities_covered",
  universities: "universities_covered",
  stipend: "stipend_amount",
  isee: "isee_threshold",
  ispe: "ispe_threshold",
  source: "source_url",
  apply_portal: "apply_url",
  call_pdf: "call_pdf_url",
  call_page: "call_page_url",
};

const GUIDE_KEY = /^guide_?(\d+)_(title|heading|text|body)$/;

/** Which guide cell a normalised key is, if it is one. */
export function parseGuideKey(key: string): { n: number; part: "title" | "text" } | null {
  const match = key.match(GUIDE_KEY);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isInteger(n) || n < 1) return null;
  return { n, part: match[2] === "title" || match[2] === "heading" ? "title" : "text" };
}

const KNOWN_KEYS = new Set<string>(BODY_COLUMNS.map((c) => c.key));

/**
 * A header as the importer reads it: "Universities covered", "universities_covered"
 * and "Covers" are one column; "Guide 3 Title" and "guide3_heading" are one.
 */
export function bodyHeaderKey(header: string): string {
  const key = normalizeHeader(header);
  if (KNOWN_KEYS.has(key)) return key;
  const alias = HEADER_ALIASES[key];
  if (alias) return alias;
  const guide = parseGuideKey(key);
  if (guide) return guide.part === "title" ? guideTitleKey(guide.n) : guideTextKey(guide.n);
  return key;
}

/** A row with every key read the way the importer asks for it. Two spellings of one column: the filled cell wins. */
export function normalizeBodyRow(row: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [header, value] of Object.entries(row)) {
    const key = bodyHeaderKey(header);
    if (!(key in out) || (!out[key] && value)) out[key] = value;
  }
  return out;
}

/**
 * The headers of a sheet that this upload does not read, each with a line
 * saying so — so a column somebody filled in is never dropped without a word.
 */
export function unreadBodyColumns(headers: readonly string[]): string[] {
  return headers
    .filter((h) => h.trim())
    .filter((h) => {
      const key = bodyHeaderKey(h);
      return !KNOWN_KEYS.has(key) && !parseGuideKey(key);
    })
    .map((h) => `column "${h.trim()}" is not one this upload reads, so its values were ignored`);
}

/** What an .xlsx upload's data sheet is recognised by when it has been renamed — none of these are on the Lists sheet. */
export const BODY_KNOWN_HEADERS = ["name", "academic year", "academic_year"];

// ------------------------------------------------------- writing a body out

export type GuideSection = { title: string; body: string };

/** A body as the export has it: its countries by display name, not by id. */
export type ExportBody = {
  name: string;
  countries: readonly string[];
  region: string | null;
  covers: readonly string[] | null;
  academic_year: string | null;
  application_deadline: string | null;
  document_upload_deadline: string | null;
  courier_deadline: string | null;
  isee_threshold: string | null;
  ispe_threshold: string | null;
  stipend_amount: string | null;
  benefits: string | null;
  source_url: string | null;
  apply_url: string | null;
  call_status: string | null;
  call_expected_on: string | null;
  call_pdf_url: string | null;
  call_page_url: string | null;
  call_notes: string | null;
  guide_sections: readonly GuideSection[] | null;
};

export type BodySheetRow = Record<string, string>;

/** Semicolon-separated within one cell, matching splitList on the way back in. */
const listCell = (values: readonly string[] | null | undefined) => (values ?? []).join("; ");

/**
 * The covered universities in one cell: semicolon-separated, as people type
 * them — unless an entry itself holds a semicolon, as ESU Venezia's notes
 * do, and then one per line, so that the export reads back as the same list
 * rather than as more entries than it has. splitCoversCell is the other half.
 */
export function coversCell(values: readonly string[] | null | undefined): string {
  const list = values ?? [];
  return list.join(list.some((entry) => entry.includes(";")) ? "\n" : "; ");
}

/** One entry per line when the cell has line breaks, otherwise semicolon-separated. */
export function splitCoversCell(value: string | undefined): string[] {
  const cell = value ?? "";
  const parts = cell.includes("\n") ? cell.split(/\r?\n/) : cell.split(";");
  return parts.map((part) => part.trim()).filter(Boolean);
}

const text = (value: string | null | undefined) => value ?? "";

/** One body as one row, every column present — guide cells past its last section blank. */
export function bodySheetRow(body: ExportBody, pairs: number): BodySheetRow {
  const row: BodySheetRow = {
    name: body.name,
    countries: listCell([...body.countries].sort((a, b) => a.localeCompare(b))),
    region: text(body.region),
    universities_covered: coversCell(body.covers),
    academic_year: text(body.academic_year),
    application_deadline: text(body.application_deadline),
    document_upload_deadline: text(body.document_upload_deadline),
    courier_deadline: text(body.courier_deadline),
    isee_threshold: text(body.isee_threshold),
    ispe_threshold: text(body.ispe_threshold),
    stipend_amount: text(body.stipend_amount),
    benefits: text(body.benefits),
    source_url: text(body.source_url),
    apply_url: text(body.apply_url),
    call_status: text(body.call_status),
    // Only beside a call that is awaiting. A date on a published call is left
    // over from when it was awaited; the import ignores it there (and says
    // so), so writing it would put a complaint on every clean round trip.
    call_expected_on: body.call_status === "awaiting" ? text(body.call_expected_on) : "",
    call_pdf_url: text(body.call_pdf_url),
    call_page_url: text(body.call_page_url),
    call_notes: text(body.call_notes),
  };
  const sections = body.guide_sections ?? [];
  for (let n = 1; n <= pairs; n++) {
    row[guideTitleKey(n)] = sections[n - 1]?.title ?? "";
    row[guideTextKey(n)] = sections[n - 1]?.body ?? "";
  }
  return row;
}

// ------------------------------------------------------ the template's example

/**
 * The name the blank template's example row uses — made up, and saying what
 * to do with it, so a template filled in beneath it and uploaded without
 * deleting it skips the example rather than adding a body called that.
 */
export const EXAMPLE_BODY = "Example scholarship body (delete this row)";

export function isExampleBodyRow(row: Record<string, string>): boolean {
  return (row.name ?? "").trim().toLowerCase().startsWith("example scholarship body");
}

export const EXAMPLE_BODY_ROW: BodySheetRow = bodySheetRow(
  {
    name: EXAMPLE_BODY,
    countries: ["Italy (Public)", "Italy (Private)"],
    region: "Umbria",
    covers: ["University of Perugia", "University for Foreigners of Perugia"],
    academic_year: "2026/2027",
    application_deadline: "7 September 2026, 13:00",
    document_upload_deadline: "30 September 2026",
    courier_deadline: "15 October 2026",
    isee_threshold: "≤€26,887.93",
    ispe_threshold: "≤€58,452.06",
    stipend_amount: "Up to €7,000 a year",
    benefits: "Free meals at university canteens",
    source_url: "https://www.example.org/scholarships",
    apply_url: "https://apply.example.org",
    call_status: "published",
    call_expected_on: null,
    call_pdf_url: "https://www.example.org/call-2026.pdf",
    call_page_url: "https://www.example.org/call-2026",
    call_notes: "A second call opens in January for any places left.",
    guide_sections: [
      { title: "Important dates", body: "Apply online by 7 September 2026, 13:00.\nUpload the documents by 30 September 2026." },
      { title: "Documents to prepare", body: "Passport\nFamily income certificate, translated and legalised\nProof of enrolment" },
    ],
  },
  TEMPLATE_GUIDE_PAIRS
);

/** What the How to fill sheet says, one line per column. */
export function bodyHelpRows(): { column: string; note: string }[] {
  return [
    ...BODY_COLUMNS.map((c) => ({ column: c.header, note: c.note })),
    {
      column: "Guide 1 title, Guide 1 text, …",
      note:
        "The body's guide, one section per pair, in order. If any guide cell of a row is filled in, the guide " +
        "becomes exactly the sections filled in — sections not on the row are removed. If every guide cell is " +
        "blank, the guide is left as it is. A title with no text, or text with no title, is reported and the " +
        `guide left alone. At most ${GUIDE_LIMITS.sections} sections; a title up to ${GUIDE_LIMITS.title} ` +
        `characters, a text up to ${GUIDE_LIMITS.text}. For more than ${TEMPLATE_GUIDE_PAIRS} sections add ` +
        `columns headed Guide ${TEMPLATE_GUIDE_PAIRS + 1} title and Guide ${TEMPLATE_GUIDE_PAIRS + 1} text, and so on.`,
    },
    {
      column: "Any empty cell",
      note:
        "Changes nothing. The import can never blank a field; to clear one, use the body's edit form in " +
        "Setup › Scholarship bodies.",
    },
    {
      column: "Language",
      note: "Write in English. The edit form translates what it is given; the import stores the text as written.",
    },
    {
      column: "Example row",
      note: `A row named "${EXAMPLE_BODY}" is skipped — delete it once you have seen the shape.`,
    },
  ];
}
