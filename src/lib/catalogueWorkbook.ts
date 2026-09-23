import { addDropdownsAndHideSheets, listRange, type Dropdown } from "@/lib/xlsxDropdowns";
import {
  CATALOGUE_COLUMNS,
  CATALOGUE_LEVELS,
  CATALOGUE_LIST_SHEET,
  CATALOGUE_SHEET,
  CATALOGUE_TYPES,
  CATALOGUE_YES_NO,
  catalogueColumnIndex,
  ROUND_COLUMNS,
  ROUNDS_SHEET,
  roundColumnIndex,
  type CatalogueRow,
  type RoundRow,
} from "@/lib/catalogueSheet";

/**
 * The catalogue workbook, built the same way whether it is an empty template
 * or a filled export.
 *
 * Both routes need the identical header row, column widths, hidden Lists sheet
 * and dropdowns — and they need them to stay identical, because the export is
 * meant to be edited and uploaded straight back. Two copies of this would
 * drift the first time a column was added to one of them.
 *
 * Split from the sheet definition itself because that one is unit-tested under
 * plain Node and so cannot reach for the `@/` alias; this half is server-only.
 */

/** Rows the dropdowns are applied to, beyond the data already written. */
const VALIDATION_HEADROOM = 200;

export function catalogueWorkbook(
  rows: CatalogueRow[],
  {
    italic = false,
    destinations = [],
    roundRows = [],
  }: {
    italic?: boolean;
    /** The Rounds sheet's rows. */
    roundRows?: RoundRow[];
    /** Display names for the destination dropdown; none means no dropdown. */
    destinations?: readonly string[];
  } = {}
) {
  const header = CATALOGUE_COLUMNS.map((c) => ({
    value: c.header,
    type: String,
    fontWeight: "bold" as const,
    backgroundColor: "#EFEFEF",
  }));

  const body = rows.map((row) =>
    CATALOGUE_COLUMNS.map((c) => ({
      value: row[c.header],
      type: String,
      // The template's example rows are greyed out so nobody mistakes them for
      // data; an export's rows are real and are not.
      ...(italic ? { fontStyle: "italic" as const, color: "#888888" } : {}),
    }))
  );

  const lists: { value?: string; type: typeof String }[][] = [
    [
      { value: "Levels", type: String },
      { value: "Types", type: String },
      { value: "YesNo", type: String },
      { value: "Destinations", type: String },
    ],
  ];
  const depth = Math.max(
    CATALOGUE_LEVELS.length,
    CATALOGUE_TYPES.length,
    CATALOGUE_YES_NO.length,
    destinations.length
  );
  for (let i = 0; i < depth; i++) {
    lists.push([
      { value: CATALOGUE_LEVELS[i], type: String },
      { value: CATALOGUE_TYPES[i], type: String },
      { value: CATALOGUE_YES_NO[i], type: String },
      { value: destinations[i], type: String },
    ]);
  }

  const validatedRows = rows.length + VALIDATION_HEADROOM;
  // Only offered when there are names to offer. The importer also takes a
  // country or its code, which a CSV can use; a dropdown holding the display
  // names is simply the spelling that can never be ambiguous.
  const destinationDropdown: Omit<Dropdown, "fromRow" | "toRow">[] =
    destinations.length > 0
      ? [
          {
            column: catalogueColumnIndex("destination"),
            range: listRange(CATALOGUE_LIST_SHEET, "D", destinations.length),
            errorTitle: "Not a destination",
            errorMessage: "Pick one from the list — or leave blank to use the destination chosen in the import form.",
          },
        ]
      : [];
  const dropdowns: Dropdown[] = [
    ...destinationDropdown,
    {
      column: catalogueColumnIndex("level"),
      range: listRange(CATALOGUE_LIST_SHEET, "A", CATALOGUE_LEVELS.length),
      errorTitle: "Not a level",
      errorMessage: "bachelors, masters or phd — or leave blank for a university with no programme on this row.",
    },
    {
      column: catalogueColumnIndex("type"),
      range: listRange(CATALOGUE_LIST_SHEET, "B", CATALOGUE_TYPES.length),
      errorTitle: "Not a track",
      errorMessage: "public or private. Leave blank and a new university takes the destination's own track.",
    },
    {
      column: catalogueColumnIndex("interview_required"),
      range: listRange(CATALOGUE_LIST_SHEET, "C", CATALOGUE_YES_NO.length),
      errorTitle: "yes or no",
      errorMessage: "Leave blank to leave whatever is already recorded alone.",
    },
    {
      column: catalogueColumnIndex("admission_test_required"),
      range: listRange(CATALOGUE_LIST_SHEET, "C", CATALOGUE_YES_NO.length),
      errorTitle: "yes or no",
      errorMessage: "Leave blank to leave whatever is already recorded alone.",
    },
  ].map((d) => ({ ...d, fromRow: 2, toRow: validatedRows + 1 }));

  // Real date cells, so Excel shows them as dates and offers its date
  // picker; they read back as YYYY-MM-DD (spreadsheet.ts). Written in ISO
  // format rather than the reader's locale, because 03/04/2027 is two
  // different days depending on who opens the file.
  const example = italic ? { fontStyle: "italic" as const, color: "#888888" } : {};
  const roundsHeader = ROUND_COLUMNS.map((c) => ({
    value: c.header,
    type: String,
    fontWeight: "bold" as const,
    backgroundColor: "#EFEFEF",
  }));
  const roundsBody = roundRows.map((row) =>
    ROUND_COLUMNS.map((c) => {
      const value = row[c.header];
      if ((c.header === "start_date" || c.header === "application_deadline") && value) {
        return { value: new Date(`${value}T00:00:00Z`), type: Date, format: "yyyy-mm-dd", ...example };
      }
      return { value: value || undefined, type: String, ...example };
    })
  );
  const roundsValidatedTo = roundRows.length + VALIDATION_HEADROOM + 1;
  const roundDropdowns: Dropdown[] = [
    ...(destinations.length > 0
      ? [
          {
            column: roundColumnIndex("destination"),
            range: listRange(CATALOGUE_LIST_SHEET, "D", destinations.length),
            errorTitle: "Not a destination",
            errorMessage: "Pick one from the list — or leave blank to use the destination chosen in the import form.",
          },
        ]
      : []),
    {
      column: roundColumnIndex("level"),
      range: listRange(CATALOGUE_LIST_SHEET, "A", CATALOGUE_LEVELS.length),
      errorTitle: "Not a level",
      errorMessage: "bachelors, masters or phd — or leave blank for a round at every level.",
    },
  ].map((d) => ({ ...d, fromRow: 2, toRow: roundsValidatedTo }));

  return {
    sheets: [
      {
        data: [header, ...body],
        sheet: CATALOGUE_SHEET,
        columns: CATALOGUE_COLUMNS.map((c) => ({ width: c.width })),
        stickyRowsCount: 1,
      },
      {
        data: [roundsHeader, ...roundsBody],
        sheet: ROUNDS_SHEET,
        columns: ROUND_COLUMNS.map((c) => ({ width: c.width })),
        stickyRowsCount: 1,
      },
      { data: lists, sheet: CATALOGUE_LIST_SHEET },
    ],
    options: { fontFamily: "Calibri", fontSize: 11 },
    /** Adds the dropdowns and hides the Lists sheet, which write-excel-file cannot. */
    finish: (written: Buffer) =>
      addDropdownsAndHideSheets(
        addDropdownsAndHideSheets(written, {
          sheet: CATALOGUE_SHEET,
          dropdowns,
          hideSheets: [CATALOGUE_LIST_SHEET],
        }),
        { sheet: ROUNDS_SHEET, dropdowns: roundDropdowns }
      ),
  };
}
