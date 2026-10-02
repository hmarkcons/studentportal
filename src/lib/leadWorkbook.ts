import writeXlsxFile from "write-excel-file/node";
import { addDropdownsAndHideSheets, columnLetter, listRange, type Dropdown } from "@/lib/xlsxDropdowns";
import { LEAD_STATUSES, LEAD_STATUS_LABELS } from "@/lib/constants";
import { EXAMPLE_LEAD, LEAD_COLUMNS, LEAD_LEVELS, LEAD_LIST_SHEET, LEAD_SHEET, leadColumnIndex, type LeadSheetRow } from "@/lib/leadSheet";

/** Rows the dropdowns and the Month formula reach below the data. */
const HEADROOM = 300;

const DATE_COLUMNS = new Set(["date_of_inquiry", "follow_up_date"]);

/**
 * The leads workbook — the import template, or the export of every lead the
 * viewer can see — with the leads list's columns, each piece of a lead in a
 * cell of its own.
 *
 * Month is a formula on the Inquiry date beside it, so it is worked out, not
 * typed, and follows the date when the date is changed in Excel. Dates are
 * real date cells. Applying for, Status and Counselor carry dropdowns of what
 * the portal has, on a hidden Lists sheet; a value not in the list is warned
 * about, not refused, since the import reports it either way.
 */
export async function leadWorkbook(rows: LeadSheetRow[], { counselors, example = false }: { counselors: { full_name: string }[]; example?: boolean }) {
  const dateCol = columnLetter(leadColumnIndex("date_of_inquiry"));
  const header = LEAD_COLUMNS.map((c) => ({ value: c.header, type: String, fontWeight: "bold" as const, backgroundColor: "#E6F4EE" }));

  const cellsOf = (row: LeadSheetRow | null, rowNumber: number, italic: boolean) =>
    LEAD_COLUMNS.map((c) => {
      const style = italic ? { fontStyle: "italic" as const, color: "#888888" } : {};
      if (c.key === "month") {
        // No leading "=": write-excel-file puts the value into <f> as it is,
        // and the file format holds a formula without one.
        return { type: "Formula" as const, value: `IF(${dateCol}${rowNumber}="","",TEXT(${dateCol}${rowNumber},"mmm yyyy"))`, ...style };
      }
      const value = row?.[c.key] ?? "";
      if (DATE_COLUMNS.has(c.key) && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return { type: Date, value: new Date(`${value}T00:00:00Z`), format: "yyyy-mm-dd", ...style };
      }
      return { type: String, value: value || undefined, ...style };
    });

  const exampleRow: LeadSheetRow | null = example
    ? {
        month: "",
        full_name: EXAMPLE_LEAD,
        contact_number: "0300-1234567",
        email: "student@example.com",
        country_of_interest: "Italy",
        current_qualification: "A-Levels",
        level_applying_for: "bachelors",
        course_of_interest: "Computer Science",
        status: "Potential",
        counselor: counselors[0]?.full_name ?? "",
        remarks: "Wants a bachelor's in Italy, call after 5 pm",
        follow_up_date: new Date().toISOString().slice(0, 10),
        follow_up_note: "Send the course list",
        date_of_inquiry: new Date().toISOString().slice(0, 10),
        platform_source: "Facebook",
      }
    : null;

  const body = [...(exampleRow ? [exampleRow] : []), ...rows];
  const data = [header, ...body.map((r, i) => cellsOf(r, i + 2, exampleRow !== null && i === 0))];
  // Blank rows below with the Month formula already in, so a typed date shows its month.
  for (let n = body.length + 2; n <= body.length + 1 + HEADROOM; n++) data.push(cellsOf(null, n, false));

  // ----------------------------------------------------------- the lists
  const statuses = LEAD_STATUSES.filter((s) => s !== "registered").map((s) => LEAD_STATUS_LABELS[s]);
  const lists: { value?: string; type: typeof String }[][] = [
    [
      { value: "Applying for", type: String },
      { value: "Status", type: String },
      { value: "Counselor", type: String },
    ],
  ];
  for (let i = 0; i < Math.max(LEAD_LEVELS.length, statuses.length, counselors.length); i++) {
    lists.push([
      { value: LEAD_LEVELS[i], type: String },
      { value: statuses[i], type: String },
      { value: counselors[i]?.full_name, type: String },
    ]);
  }

  const written = await writeXlsxFile(
    [
      { data: data as never, sheet: LEAD_SHEET, columns: LEAD_COLUMNS.map((c) => ({ width: c.width })), stickyRowsCount: 1 },
      { data: lists, sheet: LEAD_LIST_SHEET },
    ],
    { fontFamily: "Calibri", fontSize: 11 }
  ).toBuffer();

  const toRow = body.length + 1 + HEADROOM;
  const dropdowns: Dropdown[] = [
    {
      column: leadColumnIndex("level_applying_for"),
      range: listRange(LEAD_LIST_SHEET, "A", LEAD_LEVELS.length),
      errorTitle: "Not a level",
      errorMessage: "bachelors, masters or phd.",
    },
    {
      column: leadColumnIndex("status"),
      range: listRange(LEAD_LIST_SHEET, "B", statuses.length),
      errorTitle: "Not a status",
      errorMessage: "Choose one from the list. Registered is set by registering the student.",
    },
    ...(counselors.length > 0
      ? [
          {
            column: leadColumnIndex("counselor"),
            range: listRange(LEAD_LIST_SHEET, "C", counselors.length),
            errorTitle: "Not an active counsellor",
            errorMessage: "Choose from the list, or leave blank for unassigned.",
          },
        ]
      : []),
  ].map((d) => ({ ...d, fromRow: 2, toRow }));

  return addDropdownsAndHideSheets(written, { sheet: LEAD_SHEET, dropdowns, hideSheets: [LEAD_LIST_SHEET] });
}

export const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
