import type { SupabaseClient } from "@supabase/supabase-js";
import { readAll, readAllIn } from "@/lib/catalogueReads";
import { loadApplicationRows } from "@/lib/applicationRows";
import { karachiToday } from "@/lib/intakeCycle";
import {
  buildApplicationsReport,
  loginsByApplication,
  type ApplicationsFilters,
  type ApplicationsReport,
  type AppStudentInput,
  type LoginRowInput,
} from "@/lib/applicationsReport";

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
}

export type ReportOption = { id: string; name: string };
export type ReportStudentOption = { id: string; name: string; code: string | null };

export type LoadedApplications = {
  report: ApplicationsReport;
  officers: ReportOption[];
  /** Every destination an application is to, or a registered student is pursuing. */
  countries: ReportOption[];
  /** Every registered student, whatever the filters, for picking particular ones. */
  students: ReportStudentOption[];
  registered: number;
  /** Why the logins could not be read, when they could not; the applications are reported regardless. */
  loginsError: string | null;
};

/**
 * Every registered student's applications, and the logins kept against them,
 * for the report and its downloads.
 *
 * Read through the caller's own session: row-level security decides which
 * applications are in it, and application_logins (0347) decrypts only the
 * logins of students the caller may see — Processing and Super Admin, every
 * registered student. The applications are read exactly as the Applications
 * table reads them (loadApplicationRows), so a stage, a deadline or a
 * priority number is the same here as there.
 */
export async function loadApplicationsReport(
  db: SupabaseClient,
  filters: ApplicationsFilters,
  today: string = karachiToday(),
  /** Read the chosen students' rows alone (a student's own dashboard), not everyone's. The picker's list is then theirs only. */
  { onlyChosen = false }: { onlyChosen?: boolean } = {}
): Promise<LoadedApplications> {
  const narrow = onlyChosen && filters.students.length > 0;
  const [students, { rows }] = await Promise.all([
    readAll<{ id: string; full_name: string | null; student_code: string | null; intake: string | null; processing_officer_id: string | null }>(
      (from, to) => {
        let q = db.from("students").select("id, full_name, student_code, intake, processing_officer_id").eq("registration_status", "registered");
        if (narrow) q = q.in("id", filters.students);
        return q.order("id").range(from, to);
      }
    ),
    loadApplicationRows(db, { withPrograms: false, studentId: narrow && filters.students.length === 1 ? filters.students[0] : undefined }),
  ]);

  const ids = students.map((s) => s.id);
  const registered = new Set(ids);
  const officerIds = [...new Set(students.map((s) => s.processing_officer_id).filter((v): v is string => Boolean(v)))];

  let loginsError: string | null = null;
  const [destRows, staffRows, loginRows] = await Promise.all([
    readAllIn<{ lead_id: string; destination_id: string; destination: unknown }>(ids, (chunk, from, to) =>
      db
        .from("lead_destinations")
        .select("lead_id, destination_id, destination:destinations(display_name, country)")
        .in("lead_id", chunk)
        .order("lead_id")
        .order("destination_id")
        .range(from, to)
    ),
    officerIds.length
      ? readAllIn<{ id: string; full_name: string | null }>(officerIds, (chunk, from, to) =>
          db.from("staff").select("id, full_name").in("id", chunk).order("id").range(from, to)
        )
      : Promise.resolve([]),
    ids.length
      ? readAll<LoginRowInput>((from, to) =>
          db.rpc("application_logins", { p_student_ids: ids }).order("application_id").order("credential_type").range(from, to)
        ).catch((e: unknown) => {
          // The report is still worth having without them; it says why they are missing.
          loginsError = e instanceof Error ? e.message : String(e);
          return [] as LoginRowInput[];
        })
      : Promise.resolve([] as LoginRowInput[]),
  ]);

  const countriesOf = new Map<string, { id: string; name: string }[]>();
  const countryNames = new Map<string, string>();
  for (const r of destRows) {
    const dest = one(r.destination as never) as { display_name?: string | null; country?: string | null } | null;
    const name = dest?.display_name?.trim() || dest?.country?.trim() || "Destination";
    (countriesOf.get(r.lead_id) ?? countriesOf.set(r.lead_id, []).get(r.lead_id)!).push({ id: r.destination_id, name });
    countryNames.set(r.destination_id, name);
  }
  const applications = rows.filter((r) => registered.has(r.studentId));
  for (const a of applications) if (a.destinationId && a.country) countryNames.set(a.destinationId, a.country);

  const officerNames = new Map(staffRows.map((r) => [r.id, r.full_name?.trim() || "Unnamed staff member"]));
  const studentInputs: AppStudentInput[] = students.map((s) => ({
    id: s.id,
    name: s.full_name ?? "",
    code: s.student_code,
    intake: s.intake,
    officerId: s.processing_officer_id,
    countries: countriesOf.get(s.id) ?? [],
  }));

  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  return {
    report: buildApplicationsReport({
      students: studentInputs,
      applications,
      logins: loginsByApplication(loginRows),
      officerNames,
      filters,
      today,
    }),
    officers: [...officerNames].map(([id, name]) => ({ id, name })).sort(byName),
    countries: [...countryNames].map(([id, name]) => ({ id, name })).sort(byName),
    students: students
      .map((s) => ({ id: s.id, name: s.full_name?.trim() || "Unnamed student", code: s.student_code }))
      .sort((a, b) => byName(a, b) || (a.code ?? "").localeCompare(b.code ?? "")),
    registered: students.length,
    loginsError,
  };
}
