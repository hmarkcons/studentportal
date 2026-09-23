import writeXlsxFile from "write-excel-file/node";
import { getStaffSession } from "@/lib/auth/session";
import { catalogueWorkbook } from "@/lib/catalogueWorkbook";
import type { CatalogueRow } from "@/lib/catalogueSheet";

/**
 * The combined catalogue template — universities and their programmes on one
 * sheet, one row per programme.
 *
 * A real .xlsx rather than a CSV because the two columns most often got wrong
 * by hand are the ones a dropdown fixes: `type` (a wrong one files a university
 * under the wrong track) and `level` (anything but bachelors, masters or phd
 * is refused, and the row is lost from the import).
 *
 * For a destination that already has a catalogue, /api/export/catalogue is the
 * better starting point: it hands back the same sheet with the stored rows
 * already in it, so the names match exactly and nothing is held back as a
 * near-miss. This one is for starting from nothing.
 *
 * The destination is chosen in the form, not in the sheet, so it is not a
 * column. It decides which universities the names are matched against, and
 * what track a new university inherits.
 */

/**
 * Two rows for one university, so the shape is visible rather than described:
 * the university columns repeat, and the second row adds a second programme
 * without creating a second university.
 */
const EXAMPLE_ROWS: CatalogueRow[] = [
  {
    university_name: "Sapienza University of Rome",
    city: "Rome",
    region: "Lazio",
    type: "public",
    levels_offered: "bachelors; masters",
    fields_offered: "Engineering; IT/CS",
    contact_email: "admissions@example.edu",
    level: "bachelors",
    program_name: "Computer Science",
    core_field: "IT/CS",
    sub_field: "Software Engineering",
    tuition_fee: "3000",
    duration: "3 years",
    language_requirement: "B2 English",
    intake_dates: "Fall; Spring",
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
    levels_offered: "bachelors; masters",
    fields_offered: "Engineering; IT/CS",
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
    // The single-intake columns, filled in beside a blank `rounds` so the
    // precedence between the two is readable from the sheet itself.
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

  const { sheets, options, finish } = catalogueWorkbook(EXAMPLE_ROWS, { italic: true });
  const buffer = finish(await writeXlsxFile(sheets, options).toBuffer());

  return new Response(buffer as unknown as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="catalogue-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
