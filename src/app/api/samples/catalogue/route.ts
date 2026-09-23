import writeXlsxFile from "write-excel-file/node";
import { getStaffSession } from "@/lib/auth/session";
import { addDropdownsAndHideSheets, listRange, type Dropdown } from "@/lib/xlsxDropdowns";

/**
 * The combined catalogue template — universities and their programmes on one
 * sheet, one row per programme.
 *
 * A real .xlsx rather than a CSV for the same reason the registered-student
 * template is: the two columns most often got wrong by hand are the ones a
 * dropdown fixes. Here that is `type` (public/private, and a wrong one files a
 * university under the wrong track) and `level` (anything but bachelors,
 * masters or phd is refused outright, and the row is lost from the import).
 *
 * The destination is chosen in the form, not in the sheet, so it is not a
 * column. It decides which universities the names are matched against, and
 * what track a new university inherits.
 *
 * write-excel-file writes the workbook; the dropdowns and the hidden sheet are
 * added afterwards by addDropdownsAndHideSheets. See src/lib/xlsxDropdowns.ts
 * for why that part is hand-written, and `npm run check:xlsx` for how it is
 * verified against real Excel.
 */

/** Rows the dropdowns are applied to. A batch bigger than this should be split. */
const VALIDATED_ROWS = 1000;

const COLUMNS = [
  // ---- the university. Repeated on every one of its programme rows, which is
  // how a spreadsheet says "these belong together".
  { header: "university_name", width: 34 },
  { header: "city", width: 16 },
  { header: "region", width: 16 },
  { header: "type", width: 10 },
  { header: "levels_offered", width: 22 },
  { header: "fields_offered", width: 24 },
  { header: "contact_email", width: 26 },
  // ---- the programme on this row. Leave every one of these blank to import
  // the university on its own.
  { header: "level", width: 12 },
  { header: "program_name", width: 30 },
  { header: "core_field", width: 20 },
  { header: "sub_field", width: 20 },
  { header: "tuition_fee", width: 12 },
  { header: "duration", width: 12 },
  { header: "language_requirement", width: 20 },
  { header: "intake_dates", width: 18 },
  { header: "rounds", width: 46 },
  { header: "start_date", width: 14 },
  { header: "application_deadline", width: 20 },
  { header: "interview_required", width: 18 },
  { header: "interview_details", width: 24 },
  { header: "admission_test_required", width: 22 },
  { header: "admission_test_type", width: 20 },
  { header: "application_portal_name", width: 22 },
  { header: "application_portal_link", width: 28 },
  { header: "page_link", width: 28 },
] as const;

type Header = (typeof COLUMNS)[number]["header"];

const col = (header: Header) => COLUMNS.findIndex((c) => c.header === header) + 1;

const LEVELS = ["bachelors", "masters", "phd"];
const TYPES = ["public", "private"];
const YES_NO = ["yes", "no"];

/**
 * Two rows for one university, so the shape is visible rather than described:
 * the university columns repeat, and the second row adds a second programme
 * without creating a second university.
 */
const EXAMPLE_ROWS: Record<Header, string>[] = [
  {
    university_name: "Sapienza University of Rome",
    city: "Rome",
    region: "Lazio",
    type: "public",
    levels_offered: "bachelors;masters",
    fields_offered: "Engineering;IT/CS",
    contact_email: "admissions@example.edu",
    level: "bachelors",
    program_name: "Computer Science",
    core_field: "IT/CS",
    sub_field: "Software Engineering",
    tuition_fee: "3000",
    duration: "3 years",
    language_requirement: "B2 English",
    intake_dates: "Fall;Spring",
    rounds: "Round 1|2026-09-01|2026-01-15; Round 2|2027-02-01|2026-09-15",
    start_date: "",
    application_deadline: "",
    interview_required: "no",
    interview_details: "",
    admission_test_required: "yes",
    admission_test_type: "TOLC",
    application_portal_name: "Universitaly",
    application_portal_link: "https://universitaly.it",
    page_link: "https://example.edu/cs",
  },
  {
    university_name: "Sapienza University of Rome",
    city: "Rome",
    region: "Lazio",
    type: "public",
    levels_offered: "bachelors;masters",
    fields_offered: "Engineering;IT/CS",
    contact_email: "admissions@example.edu",
    level: "masters",
    program_name: "Data Science",
    core_field: "IT/CS",
    sub_field: "",
    tuition_fee: "4000",
    duration: "2 years",
    language_requirement: "B2 English",
    intake_dates: "Fall",
    rounds: "",
    // The single-intake columns, shown filled in beside a blank `rounds` so
    // the precedence between the two is readable from the sheet itself.
    start_date: "2026-09-01",
    application_deadline: "2026-01-15",
    interview_required: "no",
    interview_details: "",
    admission_test_required: "no",
    admission_test_type: "",
    application_portal_name: "Universitaly",
    application_portal_link: "https://universitaly.it",
    page_link: "https://example.edu/ds",
  },
];

export async function GET() {
  // Staff only. Nothing here is secret, but it is internal reference data and
  // there is no reason to serve it openly.
  const { staff } = await getStaffSession();
  if (!staff) return new Response("Not authorized", { status: 403 });

  const header = COLUMNS.map((c) => ({
    value: c.header,
    type: String,
    fontWeight: "bold" as const,
    backgroundColor: "#EFEFEF",
  }));

  const examples = EXAMPLE_ROWS.map((row) =>
    COLUMNS.map((c) => ({
      value: row[c.header],
      type: String,
      fontStyle: "italic" as const,
      color: "#888888",
    }))
  );

  const lists: { value?: string; type: typeof String }[][] = [
    [
      { value: "Levels", type: String },
      { value: "Types", type: String },
      { value: "YesNo", type: String },
    ],
  ];
  const depth = Math.max(LEVELS.length, TYPES.length, YES_NO.length);
  for (let i = 0; i < depth; i++) {
    lists.push([
      { value: LEVELS[i], type: String },
      { value: TYPES[i], type: String },
      { value: YES_NO[i], type: String },
    ]);
  }

  const written = await writeXlsxFile(
    [
      {
        data: [header, ...examples],
        sheet: "Catalogue",
        columns: COLUMNS.map((c) => ({ width: c.width })),
        stickyRowsCount: 1,
      },
      { data: lists, sheet: "Lists" },
    ],
    { fontFamily: "Calibri", fontSize: 11 }
  ).toBuffer();

  const dropdowns: Dropdown[] = [
    {
      column: col("level"),
      range: listRange("Lists", "A", LEVELS.length),
      errorTitle: "Not a level",
      errorMessage: "bachelors, masters or phd — or leave blank for a university with no programme on this row.",
    },
    {
      column: col("type"),
      range: listRange("Lists", "B", TYPES.length),
      errorTitle: "Not a track",
      errorMessage: "public or private. Leave blank and a new university takes the destination's own track.",
    },
    {
      column: col("interview_required"),
      range: listRange("Lists", "C", YES_NO.length),
      errorTitle: "yes or no",
      errorMessage: "Leave blank to leave whatever is already recorded alone.",
    },
    {
      column: col("admission_test_required"),
      range: listRange("Lists", "C", YES_NO.length),
      errorTitle: "yes or no",
      errorMessage: "Leave blank to leave whatever is already recorded alone.",
    },
  ].map((d) => ({ ...d, fromRow: 2, toRow: VALIDATED_ROWS + 1 }));

  const buffer = addDropdownsAndHideSheets(written, {
    sheet: "Catalogue",
    dropdowns,
    hideSheets: ["Lists"],
  });

  return new Response(buffer as unknown as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="catalogue-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
