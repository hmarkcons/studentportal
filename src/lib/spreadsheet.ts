// Reading an uploaded spreadsheet, whether it arrived as .xlsx or .csv.
//
// The registered-student template is a real .xlsx because a CSV cannot carry a
// dropdown, so the importer has to accept what it hands out. CSV is still
// accepted: existing files and exports from other systems are csv, and
// refusing them to force a re-save would be a pointless obstacle.

export type SheetRow = Record<string, string>;

/** The sheet the template writes its data to; falls back to the first one. */
const PREFERRED_SHEET = "Students";

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
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());

  const sheet =
    wb.worksheets.find((w) => w.name === PREFERRED_SHEET) ??
    wb.worksheets.find((w) => w.state === "visible") ??
    wb.worksheets[0];
  if (!sheet) return [];

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = cellText(cell.value).toLowerCase();
  });
  if (headers.filter(Boolean).length === 0) return [];

  const rows: SheetRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: SheetRow = {};
    let any = false;
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const header = headers[col];
      if (!header) return;
      const text = cellText(cell.value);
      record[header] = text;
      if (text) any = true;
    });
    // Excel keeps formatted-but-empty rows; they are not data.
    if (any) rows.push(record);
  });

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
