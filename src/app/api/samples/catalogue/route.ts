import writeXlsxFile from "write-excel-file/node";
import { getStaffSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { catalogueWorkbook } from "@/lib/catalogueWorkbook";
import { EXAMPLE_UNIVERSITY, type CatalogueRow, type RoundRow } from "@/lib/catalogueSheet";

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
 * Each row names its destination, so one sheet can fill several countries;
 * the dropdown lists the destinations the portal has. A blank destination
 * falls back to the one chosen in the import form.
 */

/**
 * Two programmes of one university, so the shape is visible rather than
 * described: the university columns repeat, and the second row adds a second
 * programme without creating a second university.
 */
const university = {
  destination: "Italy (Public)",
  university_name: EXAMPLE_UNIVERSITY,
  city: "Rome",
  region: "Lazio",
  type: "public",
  levels_offered: "bachelors; masters",
  fields_offered: "Engineering; IT/CS",
  contact_email: "admissions@example.edu",
  // One fee for every programme here; the second row shows a programme with
  // its own. The currency could be left blank — it follows the destination.
  university_application_fee: "30",
  university_application_fee_currency: "EUR",
  dsu_body: "DiSCo Lazio",
};

const EXAMPLE_ROWS: CatalogueRow[] = [
  {
    ...university,
    level: "bachelors",
    program_name: "Computer Science",
    core_field: "IT/CS",
    sub_field: "Software Engineering",
    tuition_fee: "3000",
    // Blank: this programme charges the university's fee.
    program_application_fee: "",
    program_application_fee_currency: "",
    duration: "3 years",
    language_requirement: "B2 English",
    intake_dates: "Fall; Spring",
    interview_required: "no",
    interview_details: "",
    admission_test_required: "yes",
    admission_test_type: "TOLC",
    application_portal_name: "Universitaly",
    application_portal_link: "https://universitaly.it",
    coordinator_email: "cs.coordinator@example.edu",
    page_link: "https://example.edu/cs",
  },
  {
    ...university,
    level: "masters",
    program_name: "Data Science",
    core_field: "IT/CS",
    sub_field: "",
    tuition_fee: "4000",
    program_application_fee: "50",
    program_application_fee_currency: "EUR",
    duration: "2 years",
    language_requirement: "B2 English",
    intake_dates: "Fall",
    interview_required: "no",
    interview_details: "",
    admission_test_required: "no",
    admission_test_type: "",
    application_portal_name: "Universitaly",
    application_portal_link: "https://universitaly.it",
    coordinator_email: "ds.coordinator@example.edu",
    page_link: "https://example.edu/ds",
  },
];

/**
 * The three scopes a round can have, one of each — the way Italian
 * universities announce them: calls for the whole university, one for a
 * level, and the odd programme with a date of its own.
 */
const ROUND_EXAMPLES: RoundRow[] = [
  { destination: "Italy (Public)", university_name: EXAMPLE_UNIVERSITY, level: "", program_name: "",
    round: "1st call", start_date: "", application_deadline: "2027-03-15" },
  { destination: "Italy (Public)", university_name: EXAMPLE_UNIVERSITY, level: "", program_name: "",
    round: "2nd call", start_date: "", application_deadline: "2027-05-30" },
  { destination: "Italy (Public)", university_name: EXAMPLE_UNIVERSITY, level: "masters", program_name: "",
    round: "3rd call", start_date: "", application_deadline: "2027-07-15" },
  { destination: "Italy (Public)", university_name: EXAMPLE_UNIVERSITY, level: "masters", program_name: "Data Science",
    round: "Late", start_date: "2027-10-01", application_deadline: "2027-08-31" },
];

export async function GET() {
  // Staff only. Nothing here is secret, but it is internal reference data and
  // there is no reason to serve it openly.
  const { staff } = await getStaffSession();
  if (!staff) return new Response("Not authorized", { status: 403 });

  const supabase = await createClient();
  const [{ data: destinations }, { data: bodies }] = await Promise.all([
    supabase.from("destinations").select("display_name").order("display_name"),
    supabase.from("scholarship_bodies").select("name").order("name"),
  ]);

  const { sheets, options, finish } = catalogueWorkbook(EXAMPLE_ROWS, {
    italic: true,
    roundRows: ROUND_EXAMPLES,
    destinations: (destinations ?? []).map((d) => d.display_name),
    dsuBodies: (bodies ?? []).map((b) => b.name),
  });
  const buffer = finish(await writeXlsxFile(sheets, options).toBuffer());

  return new Response(buffer as unknown as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="catalogue-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
