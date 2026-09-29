// Relative imports with their extension, not "@/": the unit test writes a
// real workbook through this and reads it back (scholarship-body-rows-test),
// and it runs under plain Node, which has no path aliases.
import { addDropdownsAndHideSheets, listRange, type Dropdown } from "./xlsxDropdowns.ts";
import {
  BODY_HELP_SHEET,
  BODY_LIST_SHEET,
  BODY_SHEET,
  CALL_STATUSES,
  bodyColumnIndex,
  bodyHelpRows,
  bodySheetColumns,
  type BodySheetRow,
} from "./scholarshipBodySheet.ts";

/**
 * The scholarship bodies workbook, built the same way whether it is the blank
 * template or an export of the directory — so the export can be edited and
 * uploaded straight back. Two copies of this would drift the first time a
 * column was added to one of them.
 *
 * Three sheets:
 *
 *   - the data, one row per body;
 *   - How to fill, a line per column — write-excel-file cannot attach a note
 *     to a header cell, and the Countries column in particular needs one;
 *   - Lists, the destinations by the name the import matches, and the two
 *     call statuses the dropdown offers. Left visible, unlike the catalogue's,
 *     because Countries is a semicolon list: a single-choice dropdown would
 *     refuse the "Italy (Public); Italy (Private)" the column exists for, so
 *     the names are there to copy instead.
 *
 * Split from the sheet definition because this half writes OOXML and only the
 * routes need it.
 */

/** Rows the dropdown is applied to, beyond the data already written. */
const VALIDATION_HEADROOM = 200;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function scholarshipBodyWorkbook(
  rows: BodySheetRow[],
  {
    italic = false,
    destinations = [],
    guidePairs,
  }: {
    /** The template's example is greyed out so nobody mistakes it for data. */
    italic?: boolean;
    /** Display names, for the Lists sheet. */
    destinations?: readonly string[];
    /** Guide pairs to write — enough for the longest guide in `rows`. */
    guidePairs: number;
  }
) {
  const columns = bodySheetColumns(guidePairs);
  const example = italic ? { fontStyle: "italic" as const, color: "#888888" } : {};

  const header = columns.map((c) => ({
    value: c.header,
    type: String,
    fontWeight: "bold" as const,
    backgroundColor: "#EFEFEF",
  }));

  const body = rows.map((row) =>
    columns.map((c) => {
      const value = row[c.key] ?? "";
      // A real date cell, so Excel shows a date and offers its picker; it
      // reads back as YYYY-MM-DD (spreadsheet.ts). Every other column is text
      // — the deadlines above all, which carry times and words.
      if (c.key === "call_expected_on" && ISO_DAY.test(value)) {
        return { value: new Date(`${value}T00:00:00Z`), type: Date, format: "yyyy-mm-dd", ...example };
      }
      return { value: value || undefined, type: String, ...example };
    })
  );

  const help: { value?: string; type: typeof String; fontWeight?: "bold"; backgroundColor?: string; wrap?: boolean }[][] = [
    [
      { value: "Column", type: String, fontWeight: "bold", backgroundColor: "#EFEFEF" },
      { value: "What to put in it", type: String, fontWeight: "bold", backgroundColor: "#EFEFEF" },
    ],
    ...bodyHelpRows().map((r) => [
      { value: r.column, type: String, fontWeight: "bold" as const },
      { value: r.note, type: String, wrap: true },
    ]),
  ];

  const lists: { value?: string; type: typeof String; fontWeight?: "bold"; backgroundColor?: string }[][] = [
    [
      { value: "Countries", type: String, fontWeight: "bold", backgroundColor: "#EFEFEF" },
      { value: "Call status", type: String, fontWeight: "bold", backgroundColor: "#EFEFEF" },
    ],
  ];
  const depth = Math.max(destinations.length, CALL_STATUSES.length);
  for (let i = 0; i < depth; i++) {
    lists.push([
      { value: destinations[i], type: String },
      { value: CALL_STATUSES[i], type: String },
    ]);
  }

  const dropdowns: Dropdown[] = [
    {
      column: bodyColumnIndex("call_status"),
      range: listRange(BODY_LIST_SHEET, "B", CALL_STATUSES.length),
      errorTitle: "published or awaiting",
      errorMessage: "published, or awaiting for a call that is not out yet. Leave blank to leave the stored status alone.",
      fromRow: 2,
      toRow: rows.length + VALIDATION_HEADROOM + 1,
    },
  ];

  return {
    sheets: [
      {
        data: [header, ...body],
        sheet: BODY_SHEET,
        columns: columns.map((c) => ({ width: c.width })),
        stickyRowsCount: 1,
      },
      { data: help, sheet: BODY_HELP_SHEET, columns: [{ width: 30 }, { width: 110 }], stickyRowsCount: 1 },
      { data: lists, sheet: BODY_LIST_SHEET, columns: [{ width: 34 }, { width: 14 }], stickyRowsCount: 1 },
    ],
    options: { fontFamily: "Calibri", fontSize: 11 },
    /** Adds the call status dropdown, which write-excel-file cannot. */
    finish: (written: Buffer) => addDropdownsAndHideSheets(written, { sheet: BODY_SHEET, dropdowns }),
  };
}
