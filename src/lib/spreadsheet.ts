// Reading an uploaded spreadsheet, whether it arrived as .xlsx or .csv.
//
// The registered-student template is a real .xlsx because a CSV cannot carry a
// dropdown, so the importer has to accept what it hands out. CSV is still
// accepted: existing files and exports from other systems are csv, and
// refusing them to force a re-save would be a pointless obstacle.
//
// Reading is read-excel-file's job and writing is write-excel-file's, both
// actively maintained and between them pulling only fflate and a SAX parser.
// They replaced exceljs, which had not been released since Oct 2023 and whose
// own remedy for a uuid advisory was a downgrade that would have cost the
// dropdowns. The one thing neither does is data validation — see
// src/lib/xlsxDropdowns.ts.

export type SheetRow = Record<string, string>;

/** The sheet the template writes its data to; falls back to the first one. */
const PREFERRED_SHEET = "Students";

/**
 * Enough of the template's headers to tell a data sheet from a helper one.
 *
 * Only needed because read-excel-file reports every sheet without saying which
 * are hidden — the old reader could prefer "the first visible sheet", and the
 * template's own list of dropdown values sits on a hidden one.
 */
const KNOWN_HEADERS = ["full_name", "email", "contact_number", "country_of_interest", "assigned_counselor"];

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    // Excel hands back a Date for anything it decided was a date. Rendered as
    // the ISO day in UTC, which is what the date columns expect — and never as
    // a locale string, which would turn 2003-05-14 into 5/14/2003 and then
    // into an unparseable date_of_birth.
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "object") {
    const v = value as { text?: unknown; result?: unknown; richText?: { text?: string }[]; hyperlink?: string };
    // Rich text, formula results and hyperlink cells all arrive as objects.
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text ?? "").join("").trim();
    if (v.text !== undefined) return String(v.text).trim();
    if (v.result !== undefined) return String(v.result).trim();
    return "";
  }
  return String(value).trim();
}

/**
 * Rows from an .xlsx upload, keyed by the header row.
 *
 * Headers are lower-cased and trimmed so a template somebody has retyped with
 * "Full_Name" still lines up.
 */
export async function parseXlsx(file: File): Promise<SheetRow[]> {
  const readXlsxFile = (await import("read-excel-file/node")).default;
  // Buffer, not the File: the node build takes a Buffer or a stream.
  const sheets = await readXlsxFile(Buffer.from(await file.arrayBuffer()));
  if (sheets.length === 0) return [];

  // Our own template always names the data sheet. Failing that, take the first
  // sheet whose header row is recognisable, which is a better guess than the
  // first sheet outright: the template carries a "Lists" sheet of dropdown
  // values, and a workbook saved from elsewhere may lead with a cover sheet.
  const named = sheets.find((s) => s.sheet === PREFERRED_SHEET);
  const recognisable = sheets.find((s) => {
    const headers = (s.data[0] ?? []).map((v) => cellText(v).toLowerCase());
    return KNOWN_HEADERS.some((h) => headers.includes(h));
  });
  const data = (named ?? recognisable ?? sheets[0]).data;

  const headers = (data[0] ?? []).map((v) => cellText(v).toLowerCase());
  if (headers.filter(Boolean).length === 0) return [];

  const rows: SheetRow[] = [];
  for (const row of data.slice(1)) {
    const record: SheetRow = {};
    let any = false;
    headers.forEach((header, i) => {
      if (!header) return;
      const text = cellText(row[i]);
      record[header] = text;
      if (text) any = true;
    });
    // Excel keeps formatted-but-empty rows; they are not data.
    if (any) rows.push(record);
  }

  return rows;
}

/** True when the upload looks like a spreadsheet rather than a CSV. */
export function isXlsx(file: File): boolean {
  return (
    file.name.toLowerCase().endsWith(".xlsx") ||
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

/**
 * The template ships one greyed-out example row. Somebody who fills in the
 * rows beneath it and uploads without deleting it would otherwise import
 * "Jane Doe" as a real student — which then also consumes a student code,
 * and codes are never reissued.
 */
export function isTemplateExampleRow(row: SheetRow): boolean {
  return (
    (row.full_name ?? "").trim().toLowerCase() === "jane doe" &&
    (row.email ?? "").trim().toLowerCase() === "jane@example.com"
  );
}
