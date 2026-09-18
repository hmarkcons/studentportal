import ExcelJS from "exceljs";
import { getStaffSession } from "@/lib/auth/session";
import { getCachedCounselors, getCachedDestinations } from "@/lib/cachedQueries";

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
 */

/** Rows the dropdowns are applied to. A batch bigger than this should be split anyway. */
const VALIDATED_ROWS = 300;

const COLUMNS = [
  { header: "full_name", width: 24, note: "Required" },
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

const col = (header: string) => COLUMNS.findIndex((c) => c.header === header) + 1;

export async function GET() {
  // Staff only. The template carries the names of active counsellors, which is
  // internal staffing information and not something to serve openly.
  const { staff } = await getStaffSession();
  if (!staff) return new Response("Not authorized", { status: 403 });

  const [counselors, destinations] = await Promise.all([getCachedCounselors(), getCachedDestinations()]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "HMARK Student Portal";
  wb.created = new Date();

  const sheet = wb.addWorksheet("Students", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const lists = wb.addWorksheet("Lists");

  // ------------------------------------------------------------- the lists
  lists.getCell("A1").value = "Counsellors";
  counselors.forEach((c, i) => {
    lists.getCell(i + 2, 1).value = c.full_name;
  });
  lists.getCell("B1").value = "Countries";
  destinations.forEach((d, i) => {
    lists.getCell(i + 2, 2).value = d.display_name;
  });
  lists.getCell("C1").value = "Levels";
  ["bachelors", "masters", "phd"].forEach((l, i) => {
    lists.getCell(i + 2, 3).value = l;
  });
  lists.state = "veryHidden";

  const range = (column: string, count: number) =>
    count > 0 ? `=Lists!$${column}$2:$${column}$${count + 1}` : `=Lists!$${column}$2`;

  // ------------------------------------------------------------ the header
  sheet.columns = COLUMNS.map((c) => ({ key: c.header, width: c.width }));
  const header = sheet.getRow(1);
  COLUMNS.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
  });
  header.commit();

  // One filled-in row, so the expected shape of each cell is visible rather
  // than described. Deliberately uses a bare "Italy" in the country column:
  // the importer resolves it to "Italy (Public)", and showing that works stops
  // anybody thinking they have to hunt for the exact suffix.
  const example = sheet.getRow(2);
  const set = (header: string, value: string) => example.getCell(col(header)).value = value;
  set("full_name", "Jane Doe");
  set("contact_number", "+92 300 1234567");
  set("email", "jane@example.com");
  set("country_of_interest", "Italy");
  // Matched on the display name because the cached destination list does not
  // carry the plain country column; the suffix is exactly what varies.
  set("backup_country", destinations.find((d) => d.display_name.startsWith("Germany"))?.display_name ?? "");
  set("intake", "Fall 2026");
  set("assigned_counselor", counselors[0]?.full_name ?? "");
  set("level_applying_for", "bachelors");
  set("course_of_interest", "Computer Science");
  set("current_qualification", "A-Levels");
  set("date_of_birth", "2003-05-14");
  set("address", "123 Main St, Lahore");
  set("home_phone", "+92 42 1234567");
  example.font = { italic: true, color: { argb: "FF888888" } };
  example.commit();

  // ------------------------------------------------------- the dropdowns
  const dropdowns: { header: string; formula: string; title: string; message: string }[] = [
    {
      header: "assigned_counselor",
      formula: range("A", counselors.length),
      title: "Not an active counsellor",
      message: "Choose from the list. Only counsellors currently active on payroll appear.",
    },
    {
      header: "country_of_interest",
      formula: range("B", destinations.length),
      title: "Not a destination",
      message: "Choose a country from the list.",
    },
    {
      header: "backup_country",
      formula: range("B", destinations.length),
      title: "Not a destination",
      message: "Choose a country from the list, or leave blank.",
    },
    {
      header: "level_applying_for",
      formula: range("C", 3),
      title: "Not a level",
      message: "bachelors, masters or phd.",
    },
  ];

  for (const d of dropdowns) {
    const index = col(d.header);
    for (let row = 2; row <= VALIDATED_ROWS + 1; row++) {
      sheet.getCell(row, index).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [d.formula],
        // A warning rather than a hard stop: a country typed by hand that the
        // importer can still resolve ("UK", "Italy") must not be blocked by
        // the spreadsheet before it ever reaches the resolver.
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: d.title,
        error: d.message,
      };
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="registered-students-template.xlsx"',
      // Live staffing data — never cached at the edge.
      "Cache-Control": "no-store",
    },
  });
}
