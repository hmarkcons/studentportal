import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DataTable } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { ImportRegisteredStudentsForm } from "./ImportRegisteredStudentsForm";
import { InlineRegistrationStatusCell } from "./InlineRegistrationStatusCell";
import { RowActionsMenu } from "@/components/RowActionsMenu";

type StudentRow = {
  id: string;
  full_name: string;
  email: string | null;
  contact_number: string | null;
  country_of_interest: string | null;
  registered_at: string;
  registration_status: string;
  portal_active: boolean;
  intake: string | null;
  assigned_counselor: { full_name: string } | { full_name: string }[] | null;
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

export default async function StudentsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
  const canDelete = staffRow?.role === "super_admin" || staffRow?.role === "processing";

  const { data: students, error } = await supabase
    .from("students")
    .select(
      "id, full_name, email, contact_number, country_of_interest, registered_at, registration_status, portal_active, intake, assigned_counselor:staff(full_name)"
    )
    .order("registered_at", { ascending: false })
    .returns<StudentRow[]>();

  const studentIds = (students ?? []).map((r) => r.id);
  const { data: backupRows } =
    studentIds.length > 0
      ? await supabase
          .from("lead_destinations")
          .select("lead_id, destination:destinations(display_name)")
          .eq("is_backup", true)
          .in("lead_id", studentIds)
      : { data: [] as { lead_id: string; destination: { display_name: string } | { display_name: string }[] | null }[] };
  const backupNamesByLead = new Map<string, string[]>();
  for (const row of backupRows ?? []) {
    const dest = one(row.destination);
    if (!dest?.display_name) continue;
    const list = backupNamesByLead.get(row.lead_id) ?? [];
    list.push(dest.display_name);
    backupNamesByLead.set(row.lead_id, list);
  }

  const columns = [
    { key: "month", header: "Month" },
    { key: "name", header: "Name" },
    { key: "contact", header: "Contact" },
    { key: "country", header: "Country" },
    { key: "backupCountry", header: "Backup Country" },
    { key: "counselor", header: "Counselor", align: "center" as const },
    { key: "intake", header: "Intake" },
    { key: "regStatus", header: "Registration status" },
    { key: "portal", header: "Portal" },
    { key: "date", header: "Registered" },
    { key: "actions", header: "", align: "right" as const, exportable: false },
  ];

  const rows = (students ?? []).map((r) => {
    const registeredDate = new Date(r.registered_at);
    const month = MONTH_NAMES[registeredDate.getMonth()];
    const year = String(registeredDate.getFullYear());
    const monthYearLabel = registeredDate.toLocaleString("en-US", { month: "short", year: "numeric" });
    return {
      id: r.id,
      cells: {
        month: monthYearLabel,
        name: (
          <Link href={`/students/${r.id}`} className="font-medium text-ink hover:underline">
            {r.full_name}
          </Link>
        ),
        contact: r.contact_number ?? r.email ?? "—",
        country: r.country_of_interest ?? "—",
        backupCountry: (backupNamesByLead.get(r.id) ?? []).join(", ") || "—",
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
        intake: r.intake ?? "—",
        regStatus: <InlineRegistrationStatusCell studentId={r.id} status={r.registration_status} stacked />,
        portal: <Badge tone={r.portal_active ? "success" : "neutral"}>{r.portal_active ? "Active" : "Inactive"}</Badge>,
        date: registeredDate.toLocaleDateString(),
        actions: (
          <RowActionsMenu id={r.id} name={r.full_name} editHref={`/students/${r.id}`} canDelete={canDelete} deleteLabel="Delete student" />
        ),
      },
      csv: {
        name: r.full_name,
        contact: r.contact_number ?? r.email ?? "",
        country: r.country_of_interest ?? "",
        backupCountry: (backupNamesByLead.get(r.id) ?? []).join(", "),
        counselor: one(r.assigned_counselor)?.full_name ?? "",
        intake: r.intake ?? "",
        regStatus: r.registration_status,
        portal: r.portal_active ? "active" : "inactive",
        date: r.registered_at,
        month,
        year,
      },
    };
  });

  const countryOptions = Array.from(new Set((students ?? []).map((r) => r.country_of_interest).filter(Boolean))).sort() as string[];
  const counselorOptions = Array.from(
    new Set((students ?? []).map((r) => one(r.assigned_counselor)?.full_name).filter(Boolean))
  ).sort() as string[];
  const intakeOptions = Array.from(new Set((students ?? []).map((r) => r.intake).filter(Boolean))).sort() as string[];
  const monthOptions = MONTH_NAMES.filter((m) => rows.some((r) => r.csv.month === m));
  const yearOptions = Array.from(new Set(rows.map((r) => r.csv.year))).sort((a, b) => Number(b) - Number(a));

  return (
    <div className="w-full">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">Registered Students</h2>
          <p className="text-sm text-muted">{students?.length ?? 0} students</p>
        </div>
        <Link href="/students/new" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink">
          + Register student manually
        </Link>
      </div>

      <ImportRegisteredStudentsForm />

      {error && <p className="text-sm text-danger">{error.message}</p>}

      {!error && (
        <div className="mt-4">
          <DataTable
            exportFilename="students"
            rows={rows}
            columns={columns}
            searchable
            searchPlaceholder="Search name, contact…"
            minTableWidthClassName="min-w-[640px] lg:min-w-[1250px]"
            filters={[
              { key: "regStatus", label: "Registration", options: ["registered", "withdrawn", "ghost"] },
              { key: "portal", label: "Portal", options: ["active", "inactive"] },
              { key: "country", label: "Country", options: countryOptions },
              { key: "counselor", label: "Counselor", options: counselorOptions },
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
