import { hasRole } from "@/lib/auth/roles";
import { readAll } from "@/lib/catalogueReads";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DataTable } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { LongTextCell } from "@/components/ui/LongTextCell";
import { ImportRegisteredStudentsForm } from "./ImportRegisteredStudentsForm";
import { InlineRegistrationStatusCell } from "./InlineRegistrationStatusCell";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import { searchTerm } from "@/lib/listSearch";
import { loginEmailMatches } from "@/lib/loginEmailSearch";
import { getCurrentUser } from "@/lib/auth/currentUser";

type StudentRow = {
  id: string;
  student_code: string | null;
  student_seq: number | null;
  full_name: string;
  email: string | null;
  contact_number: string | null;
  country_of_interest: string | null;
  registered_at: string;
  registration_status: string;
  portal_active: boolean;
  intake: string | null;
  assigned_counselor: { full_name: string } | { full_name: string }[] | null;
  processing_officer: { full_name: string } | { full_name: string }[] | null;
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 3)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/** A thousand students to a page, read by the server one page at a time. */
const PAGE_SIZE = 1000;

const STUDENT_SELECT =
  "id, student_code, student_seq, full_name, email, contact_number, country_of_interest, registered_at, registration_status, portal_active, intake, assigned_counselor:staff!assigned_counselor_id(full_name), processing_officer:staff!processing_officer_id(full_name)";

/** What the search box looks through on the student; counsellors, officers and statuses are matched besides. */
const SEARCHED_COLUMNS = ["full_name", "email", "contact_number", "student_code", "country_of_interest", "intake"];

type OptionRow = {
  country_of_interest: string | null;
  intake: string | null;
  registered_at: string;
  student_code: string | null;
  assigned_counselor_id: string | null;
  processing_officer_id: string | null;
  assigned_counselor: { full_name: string } | { full_name: string }[] | null;
  processing_officer: { full_name: string } | { full_name: string }[] | null;
};

/** The first instant of a month, UTC — the clock the Month column is read on. */
const monthStart = (year: number, monthIndex: number) => new Date(Date.UTC(year, monthIndex, 1)).toISOString();

export default async function StudentsPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Server-side paging, as on the leads list: only the page shown is read and
  // sent, and the search, the filters and the page are in the address
  // (?q=, ?f_<key>=, ?page=), answered by the database.
  const params = await props.searchParams;
  const param = (k: string) => {
    const v = params[k];
    return (Array.isArray(v) ? v[0] : (v ?? "")).trim();
  };
  const page = Math.max(1, Math.floor(Number(param("page")) || 1));
  const search = param("q").slice(0, 100);
  const filters = {
    regStatus: param("f_regStatus"),
    idStatus: param("f_idStatus"),
    portal: param("f_portal"),
    country: param("f_country"),
    counselor: param("f_counselor"),
    officer: param("f_officer"),
    intake: param("f_intake"),
    month: param("f_month"),
    year: param("f_year"),
  };
  // The search as an ilike pattern, without what PostgREST's filter syntax
  // would read as structure — commas, brackets, quotes — or as wildcards; an
  // email address's underscore kept (src/lib/listSearch.ts).
  const term = searchTerm(search);
  const like = `%${term}%`;

  const supabase = await createClient();
  const user = await getCurrentUser();
  // First, what does not depend on the page, beside each other: the filter
  // choices and the total from every student — a few columns, a thousand rows
  // at a time, since PostgREST stops at 1000 to a request without saying so —
  // and the backup countries, by what RLS lets this viewer see.
  type BackupRow = { lead_id: string; destination: { display_name: string } | { display_name: string }[] | null };
  const [{ data: staffRow }, optionRows, backupRows, loginHits] = await Promise.all([
    supabase.from("staff").select("role, roles").eq("id", user?.id ?? "").maybeSingle(),
    readAll<OptionRow>((from, to) =>
      supabase
        .from("students")
        .select(
          "country_of_interest, intake, registered_at, student_code, assigned_counselor_id, processing_officer_id, assigned_counselor:staff!assigned_counselor_id(full_name), processing_officer:staff!processing_officer_id(full_name)"
        )
        .order("id")
        .range(from, to)
        .returns<OptionRow[]>()
    ).catch(() => [] as OptionRow[]),
    readAll<BackupRow>((from, to) =>
      supabase
        .from("lead_destinations")
        .select("lead_id, destination:destinations(display_name)")
        .eq("is_backup", true)
        .order("lead_id")
        .order("destination_id")
        .range(from, to)
        .returns<BackupRow[]>()
    ).catch(() => [] as BackupRow[]),
    // Students whose portal sign-in address says it, where that is not the
    // email on their record (0327).
    term.length >= 2 ? loginEmailMatches(supabase, term) : Promise.resolve([] as string[]),
  ]);
  const canDelete = hasRole(staffRow, "super_admin") || hasRole(staffRow, "processing");

  // The filter choices, from every student rather than the page shown.
  const counselorIdByName = new Map<string, string>();
  const officerIdByName = new Map<string, string>();
  for (const r of optionRows) {
    const c = one(r.assigned_counselor)?.full_name;
    if (c && r.assigned_counselor_id) counselorIdByName.set(c, r.assigned_counselor_id);
    const o = one(r.processing_officer)?.full_name;
    if (o && r.processing_officer_id) officerIdByName.set(o, r.processing_officer_id);
  }
  const countryOptions = Array.from(new Set(optionRows.map((r) => r.country_of_interest).filter(Boolean))).sort() as string[];
  const counselorOptions = Array.from(counselorIdByName.keys()).sort();
  // "none" is a real choice here: it is the one people will filter for.
  const officerOptions = [...Array.from(officerIdByName.keys()).sort(), ...(optionRows.some((r) => !r.processing_officer_id) ? ["none"] : [])];
  const intakeOptions = Array.from(new Set(optionRows.map((r) => r.intake).filter(Boolean))).sort() as string[];
  const registered = optionRows.map((r) => new Date(r.registered_at));
  const monthOptions = MONTH_NAMES.filter((_, i) => registered.some((d) => d.getUTCMonth() === i));
  const yearOptions = Array.from(new Set(registered.map((d) => String(d.getUTCFullYear())))).sort((a, b) => Number(b) - Number(a));
  const idStatusOf = (r: { student_code: string | null; intake: string | null }) => (r.student_code ? "issued" : r.intake ? "no country" : "no intake");
  const idStatusOptions = ["issued", "no intake", "no country"].filter((o) => optionRows.some((r) => idStatusOf(r) === o));
  const totalStudents = optionRows.length;

  // Then the page itself: searched and filtered by the database, counted in all.
  let query = supabase.from("students").select(STUDENT_SELECT, { count: "exact" });
  if (filters.regStatus) query = query.eq("registration_status", filters.regStatus);
  if (filters.idStatus === "issued") query = query.not("student_code", "is", null);
  if (filters.idStatus === "no country") query = query.is("student_code", null).not("intake", "is", null);
  if (filters.idStatus === "no intake") query = query.is("student_code", null).is("intake", null);
  if (filters.portal) query = query.eq("portal_active", filters.portal === "active");
  if (filters.country) query = query.eq("country_of_interest", filters.country);
  if (filters.counselor) query = query.eq("assigned_counselor_id", counselorIdByName.get(filters.counselor) ?? "00000000-0000-0000-0000-000000000000");
  if (filters.officer === "none") query = query.is("processing_officer_id", null);
  else if (filters.officer) query = query.eq("processing_officer_id", officerIdByName.get(filters.officer) ?? "00000000-0000-0000-0000-000000000000");
  if (filters.intake) query = query.eq("intake", filters.intake);

  // Each condition that is itself an either/or, joined as one: PostgREST takes
  // one "or" to a request, so two are nested inside an "and".
  const eitherOr: string[] = [];
  const monthIndex = MONTH_NAMES.indexOf(filters.month);
  const year = Number(filters.year) || null;
  if (year && monthIndex >= 0) {
    query = query.gte("registered_at", monthStart(year, monthIndex)).lt("registered_at", monthStart(year, monthIndex + 1));
  } else if (year) {
    query = query.gte("registered_at", monthStart(year, 0)).lt("registered_at", monthStart(year + 1, 0));
  } else if (monthIndex >= 0) {
    // A month in any year: that month in each year students registered in.
    const years = yearOptions.map(Number);
    eitherOr.push(
      years.length
        ? years.map((y) => `and(registered_at.gte.${monthStart(y, monthIndex)},registered_at.lt.${monthStart(y, monthIndex + 1)})`).join(",")
        : "id.is.null"
    );
  }
  if (term) {
    const lower = term.toLowerCase();
    const ors = SEARCHED_COLUMNS.map((c) => `${c}.ilike."${like}"`);
    const byName = (map: Map<string, string>, column: string) => {
      const ids = Array.from(map.entries())
        .filter(([name]) => name.toLowerCase().includes(lower))
        .map(([, id]) => id);
      if (ids.length) ors.push(`${column}.in.(${ids.join(",")})`);
    };
    byName(counselorIdByName, "assigned_counselor_id");
    byName(officerIdByName, "processing_officer_id");
    const statuses = ["registered", "withdrawn", "ghost"].filter((st) => st.includes(lower));
    if (statuses.length) ors.push(`registration_status.in.(${statuses.join(",")})`);
    if (loginHits.length) ors.push(`id.in.(${loginHits.join(",")})`);
    eitherOr.push(ors.join(","));
  }
  if (eitherOr.length === 1) query = query.or(eitherOr[0]);
  else if (eitherOr.length > 1) query = query.or(`and(${eitherOr.map((g) => `or(${g})`).join(",")})`);

  const { data: students, error, count } = await query
    .order("registered_at", { ascending: false })
    .order("id")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    .returns<StudentRow[]>();
  const matching = count ?? students?.length ?? 0;

  const backupNamesByLead = new Map<string, string[]>();
  for (const row of backupRows ?? []) {
    const dest = one(row.destination);
    if (!dest?.display_name) continue;
    const list = backupNamesByLead.get(row.lead_id) ?? [];
    list.push(dest.display_name);
    backupNamesByLead.set(row.lead_id, list);
  }
  // By name, so a student's backups read the same way every time.
  for (const list of backupNamesByLead.values()) list.sort((x, y) => x.localeCompare(y));

  const columns = [
    { key: "month", header: "Month" },
    // Their own number. First after the month because that is how the
    // office refers to a student once the agreement is out.
    { key: "code", header: "Student ID" },
    { key: "name", header: "Name" },
    { key: "contact", header: "Contact" },
    { key: "country", header: "Country" },
    { key: "backupCountry", header: "Backup Country" },
    { key: "counselor", header: "Counselor", align: "center" as const },
    { key: "officer", header: "Processing", align: "center" as const },
    { key: "intake", header: "Intake" },
    // Kept wrapping: it carries the inline registration-status control.
    { key: "regStatus", header: "Registration status", wrap: true },
    { key: "portal", header: "Portal" },
    { key: "date", header: "Registered" },
    { key: "actions", header: "", align: "right" as const, exportable: false },
  ];

  const rows = (students ?? []).map((r) => {
    const registeredDate = new Date(r.registered_at);
    const month = MONTH_NAMES[registeredDate.getUTCMonth()];
    const year = String(registeredDate.getUTCFullYear());
    const monthYearLabel = registeredDate.toLocaleString("en-US", { month: "short", year: "numeric" });
    const backups = backupNamesByLead.get(r.id) ?? [];
    // A long value is cut short on its line and opens whole in a pop-up.
    const long = (text: string | null, label: string, widthClassName?: string, items?: string[]) => (
      <LongTextCell text={text} items={items} label={label} rowName={r.full_name} widthClassName={widthClassName} />
    );
    return {
      id: r.id,
      cells: {
        month: monthYearLabel,
        // A dash here used to mean "look into it later". It now means the
        // student cannot get into the portal at all, so it says which of the
        // two missing pieces is the one to go and fix.
        code: r.student_code ? (
          <span className="font-mono text-xs text-muted">{r.student_code}</span>
        ) : (
          <span
            className="text-xs text-warning"
            title={
              r.intake
                ? `Place ${r.student_seq ?? "?"} is held. No country on file, so no ID could be composed — add one and it is issued.`
                : `Place ${r.student_seq ?? "?"} is held by registration date. No intake recorded, so no ID and no portal — record the intake and the ID is issued.`
            }
          >
            {r.intake ? "no country" : "no intake"}
          </span>
        ),
        name: <LongTextCell text={r.full_name} label="Name" rowName={r.full_name} href={`/students/${r.id}`} widthClassName="max-w-[16rem]" />,
        contact: long(r.contact_number ?? r.email, "Contact", "max-w-[14rem]"),
        country: long(r.country_of_interest, "Country"),
        backupCountry: long(backups.join(", ") || null, "Backup Country", "max-w-[12rem]", backups),
        counselor: one(r.assigned_counselor)?.full_name ? (
          <span
            title={one(r.assigned_counselor)!.full_name}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[11px] font-medium text-primary"
          >
            {initials(one(r.assigned_counselor)!.full_name)}
          </span>
        ) : (
          "—"
        ),
        // Unassigned is not a gap in cover — deadline reminders fall back to
        // the whole processing team — but it is worth seeing, and it was
        // invisible until now.
        officer: one(r.processing_officer)?.full_name ? (
          <span
            title={one(r.processing_officer)!.full_name}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-info-bg text-[11px] font-medium text-info"
          >
            {initials(one(r.processing_officer)!.full_name)}
          </span>
        ) : (
          <span title="Nobody assigned — the whole processing team covers this student" className="text-xs text-warning">
            none
          </span>
        ),
        intake: long(r.intake, "Intake", "max-w-[10rem]"),
        regStatus: <InlineRegistrationStatusCell studentId={r.id} status={r.registration_status} stacked />,
        portal: <Badge tone={r.portal_active ? "success" : "neutral"}>{r.portal_active ? "Active" : "Inactive"}</Badge>,
        date: registeredDate.toLocaleDateString(),
        actions: (
          <RowActionsMenu id={r.id} name={r.full_name} editHref={`/students/${r.id}`} canDelete={canDelete} deleteLabel="Delete student" />
        ),
      },
      csv: {
        // Was missing entirely, so the Student ID — the thing the office
        // refers to a student by — was neither searchable nor in the export.
        code: r.student_code ?? "",
        // Filterable state rather than the code itself, which would offer one
        // dropdown option per student. "no intake" is the one worth finding:
        // those students are locked out of the portal.
        idStatus: r.student_code ? "issued" : r.intake ? "no country" : "no intake",
        name: r.full_name,
        contact: r.contact_number ?? r.email ?? "",
        country: r.country_of_interest ?? "",
        backupCountry: (backupNamesByLead.get(r.id) ?? []).join(", "),
        counselor: one(r.assigned_counselor)?.full_name ?? "",
        // "none" rather than blank: the filter matches on this value, so an
        // empty string would offer a "none" option that selected nothing. It
        // reads better in the export too.
        officer: one(r.processing_officer)?.full_name ?? "none",
        intake: r.intake ?? "",
        regStatus: r.registration_status,
        portal: r.portal_active ? "active" : "inactive",
        date: r.registered_at,
        month,
        year,
      },
    };
  });


  return (
    <div className="w-full">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">Registered Students</h2>
          <p className="text-sm text-muted">{totalStudents} students</p>
        </div>
        <Link prefetch={false} href="/students/new" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink">
          + Register student manually
        </Link>
      </div>

      <ImportRegisteredStudentsForm />

      {error && <p className="text-sm text-danger">{error.message}</p>}

      {!error && (
        <div className="mt-4">
          <DataTable
            exportFilename="students"
            rowHighlight
            dense
            expandable
            label="Registered students"
            freezeColumn="name"
            rows={rows}
            columns={columns}
            searchable
            searchPlaceholder="Search name, email, phone, Student ID…"
            oneLine
            minTableWidthClassName="min-w-[640px] lg:min-w-[1250px]"
            pageSize={PAGE_SIZE}
            server={{ page, total: matching, search, filters }}
            filters={[
              { key: "regStatus", label: "Registration", options: ["registered", "withdrawn", "ghost"] },
              // Only offered once there is something to find. "no intake" is
              // a worklist: every one of those students is shut out of the
              // portal until somebody acts on it.
              ...(idStatusOptions.some((o) => o !== "issued") ? [{ key: "idStatus", label: "Student ID", options: idStatusOptions }] : []),
              { key: "portal", label: "Portal", options: ["active", "inactive"] },
              { key: "country", label: "Country", options: countryOptions },
              { key: "counselor", label: "Counselor", options: counselorOptions },
              { key: "officer", label: "Processing", options: officerOptions },
              { key: "intake", label: "Intake", options: intakeOptions },
              { key: "month", label: "Month", options: monthOptions },
              { key: "year", label: "Year", options: yearOptions },
            ]}
          />
        </div>
      )}
    </div>
  );
}
