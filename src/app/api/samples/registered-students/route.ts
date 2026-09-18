import writeXlsxFile from "write-excel-file/node";
import { getStaffSession } from "@/lib/auth/session";
import { getCachedCounselors, getCachedDestinations, selectableDestinations } from "@/lib/cachedQueries";
import { addDropdownsAndHideSheets, listRange, type Dropdown } from "@/lib/xlsxDropdowns";

/**
 * The registered-student import template, as a real .xlsx.
 *
 * A CSV cannot carry a dropdown, and the two columns most often got wrong by
 * hand are exactly the ones a dropdown fixes: the counsellor (a name that has
 * to match a staff row) and the country (which has to match a destination, or
 * the student is filed against nothing and never receives a student code).
 *
 * Built on the server rather than in the browser because the lists are live
 * data — the counsellors are whoever is an active counsellor at the moment the
 * template is downloaded, so a template cannot offer somebody who has left.
 *
 * The allowed values live on a hidden "Lists" sheet and the dropdowns point at
 * it by range. Inlining them in the validation formula has a hard length limit
 * that eighteen destinations and a growing staff list would eventually hit,
 * and it fails by truncating the list rather than erroring.
 *
 * write-excel-file writes the workbook; the dropdowns and the hidden sheet are
 * added afterwards by addDropdownsAndHideSheets, which is the only part of the
 * format this codebase owns. See that file for why.
 */

/** Rows the dropdowns are applied to. A batch bigger than this should be split anyway. */
const VALIDATED_ROWS = 300;

const COLUMNS = [
  { header: "full_name", width: 24 },
  { header: "contact_number", width: 18 },
  { header: "email", width: 26 },
  { header: "country_of_interest", width: 24 },
  { header: "backup_country", width: 24 },
  { header: "intake", width: 14 },
  { header: "assigned_counselor", width: 22 },
  { header: "level_applying_for", width: 18 },
  { header: "course_of_interest", width: 24 },
  { header: "current_qualification", width: 20 },
  { header: "date_of_birth", width: 14 },
  { header: "address", width: 30 },
  { header: "home_phone", width: 18 },
] as const;

type Header = (typeof COLUMNS)[number]["header"];

const col = (header: Header) => COLUMNS.findIndex((c) => c.header === header) + 1;

const LEVELS = ["bachelors", "masters", "phd"];

export async function GET() {
  // Staff only. The template carries the names of active counsellors, which is
  // internal staffing information and not something to serve openly.
  const { staff } = await getStaffSession();
  if (!staff) return new Response("Not authorized", { status: 403 });

  const [counselors, allDestinations] = await Promise.all([getCachedCounselors(), getCachedDestinations()]);
  // The sheet dropdown offers only what we can deliver — a paused country in
  // the template would be filled in by staff and then rejected on upload.
  const destinations = selectableDestinations(allDestinations);

  // ------------------------------------------------------------ the header
  const header = COLUMNS.map((c) => ({
    value: c.header,
    type: String,
    fontWeight: "bold" as const,
    backgroundColor: "#EFEFEF",
  }));

  // One filled-in row, so the expected shape of each cell is visible rather
  // than described. Deliberately uses a bare "Italy" in the country column:
  // the importer resolves it to "Italy (Public)", and showing that works stops
  // anybody thinking they have to hunt for the exact suffix.
  const exampleValues: Record<Header, string> = {
    full_name: "Jane Doe",
    contact_number: "+92 300 1234567",
    email: "jane@example.com",
    country_of_interest: "Italy",
    // Matched on the display name because the cached destination list does not
    // carry the plain country column; the suffix is exactly what varies.
    backup_country: destinations.find((d) => d.display_name.startsWith("Germany"))?.display_name ?? "",
    intake: "Fall 2026",
    assigned_counselor: counselors[0]?.full_name ?? "",
    level_applying_for: "bachelors",
    course_of_interest: "Computer Science",
    current_qualification: "A-Levels",
    date_of_birth: "2003-05-14",
    address: "123 Main St, Lahore",
    home_phone: "+92 42 1234567",
  };
  const example = COLUMNS.map((c) => ({
    value: exampleValues[c.header],
    type: String,
    fontStyle: "italic" as const,
    color: "#888888",
  }));

  // -------------------------------------------------------------- the lists
  // One column per list, each under a title row, so a range can skip the
  // title without needing a sheet per list.
  // An absent value is `undefined`, not null: the shorter lists simply stop,
  // leaving blank cells rather than the string "null" in the dropdown.
  const lists: { value?: string; type: typeof String }[][] = [
    [
      { value: "Counsellors", type: String },
      { value: "Countries", type: String },
      { value: "Levels", type: String },
    ],
  ];
  const depth = Math.max(counselors.length, destinations.length, LEVELS.length);
  for (let i = 0; i < depth; i++) {
    lists.push([
      { value: counselors[i]?.full_name, type: String },
      { value: destinations[i]?.display_name, type: String },
      { value: LEVELS[i], type: String },
    ]);
  }

  const written = await writeXlsxFile(
    [
      {
        data: [header, example],
        sheet: "Students",
        columns: COLUMNS.map((c) => ({ width: c.width })),
        stickyRowsCount: 1,
      },
      { data: lists, sheet: "Lists" },
    ],
    { fontFamily: "Calibri", fontSize: 11 }
  ).toBuffer();

  // ------------------------------------------------------- the dropdowns
  const dropdowns: Dropdown[] = [
    {
      column: col("assigned_counselor"),
      range: listRange("Lists", "A", counselors.length),
      errorTitle: "Not an active counsellor",
      errorMessage: "Choose from the list. Only counsellors currently active on payroll appear.",
    },
    {
      column: col("country_of_interest"),
      range: listRange("Lists", "B", destinations.length),
      errorTitle: "Not a destination",
      errorMessage: "Choose a country from the list.",
    },
    {
      column: col("backup_country"),
      range: listRange("Lists", "B", destinations.length),
      errorTitle: "Not a destination",
      errorMessage: "Choose a country from the list, or leave blank.",
    },
    {
      column: col("level_applying_for"),
      range: listRange("Lists", "C", LEVELS.length),
      errorTitle: "Not a level",
      errorMessage: "bachelors, masters or phd.",
    },
  ].map((d) => ({ ...d, fromRow: 2, toRow: VALIDATED_ROWS + 1 }));

  const buffer = addDropdownsAndHideSheets(written, {
    sheet: "Students",
    dropdowns,
    hideSheets: ["Lists"],
  });

  return new Response(buffer as unknown as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="registered-students-template.xlsx"',
      // Live staffing data — never cached at the edge.
      "Cache-Control": "no-store",
    },
  });
}
