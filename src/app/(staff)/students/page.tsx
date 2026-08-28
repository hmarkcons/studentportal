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
  assigned_counselor: { full_name: string } | { full_name: string }[] | null;
};

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
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
      "id, full_name, email, contact_number, country_of_interest, registered_at, registration_status, portal_active, assigned_counselor:staff(full_name)"
    )
    .order("registered_at", { ascending: false })
    .returns<StudentRow[]>();

  const columns = [
    { key: "name", header: "Name" },
    { key: "contact", header: "Contact" },
    { key: "country", header: "Country" },
    { key: "counselor", header: "Counselor" },
    { key: "regStatus", header: "Registration status" },
    { key: "portal", header: "Portal" },
    { key: "date", header: "Registered" },
    { key: "actions", header: "", align: "right" as const },
  ];

  const rows = (students ?? []).map((r) => ({
    id: r.id,
    cells: {
      name: (
        <Link href={`/students/${r.id}`} className="font-medium text-ink hover:underline">
          {r.full_name}
        </Link>
      ),
      contact: r.email ?? r.contact_number ?? "—",
      country: r.country_of_interest ?? "—",
      counselor: one(r.assigned_counselor)?.full_name ?? "—",
      regStatus: <InlineRegistrationStatusCell studentId={r.id} status={r.registration_status} />,
      portal: <Badge tone={r.portal_active ? "success" : "neutral"}>{r.portal_active ? "Active" : "Inactive"}</Badge>,
      date: new Date(r.registered_at).toLocaleDateString(),
      actions: (
        <RowActionsMenu id={r.id} name={r.full_name} editHref={`/students/${r.id}`} canDelete={canDelete} deleteLabel="Delete student" />
      ),
    },
    csv: {
      name: r.full_name,
      contact: r.email ?? "",
      country: r.country_of_interest ?? "",
      counselor: one(r.assigned_counselor)?.full_name ?? "",
      regStatus: r.registration_status,
      portal: r.portal_active ? "active" : "inactive",
      date: r.registered_at,
    },
  }));

  const countryOptions = Array.from(new Set((students ?? []).map((r) => r.country_of_interest).filter(Boolean))).sort() as string[];
  const counselorOptions = Array.from(
    new Set((students ?? []).map((r) => one(r.assigned_counselor)?.full_name).filter(Boolean))
  ).sort() as string[];

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
            filters={[
              { key: "regStatus", label: "Registration", options: ["registered", "withdrawn", "ghost"] },
              { key: "portal", label: "Portal", options: ["active", "inactive"] },
              { key: "country", label: "Country", options: countryOptions },
              { key: "counselor", label: "Counselor", options: counselorOptions },
            ]}
          />
        </div>
      )}
    </div>
  );
}
