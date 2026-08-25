import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/Badge";
import { DataTable } from "@/components/ui/DataTable";
import { LEAD_STATUS_LABELS, LEAD_STATUS_TONE } from "@/lib/constants";

type LeadRow = {
  id: string;
  full_name: string;
  contact_number: string | null;
  email: string | null;
  country_of_interest: string | null;
  status: string;
  date_of_inquiry: string;
  assigned_counselor: { full_name: string } | { full_name: string }[] | null;
};

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function LeadsPage() {
  const supabase = await createClient();

  const { data: leads, error } = await supabase
    .from("leads")
    .select(
      "id, full_name, contact_number, email, country_of_interest, status, date_of_inquiry, assigned_counselor:staff(full_name)"
    )
    .order("date_of_inquiry", { ascending: false })
    .returns<LeadRow[]>();

  const columns = [
    { key: "name", header: "Name" },
    { key: "contact", header: "Contact" },
    { key: "country", header: "Country" },
    { key: "status", header: "Status" },
    { key: "counselor", header: "Counselor" },
    { key: "date", header: "Inquiry date" },
  ];

  const rows = (leads ?? []).map((r) => ({
    id: r.id,
    cells: {
      name: (
        <Link href={`/leads/${r.id}`} className="font-medium text-ink hover:underline">
          {r.full_name}
        </Link>
      ),
      contact: r.contact_number ?? r.email ?? "—",
      country: r.country_of_interest ?? "—",
      status: (
        <Badge tone={LEAD_STATUS_TONE[r.status as never] ?? "neutral"}>
          {LEAD_STATUS_LABELS[r.status as never] ?? r.status}
        </Badge>
      ),
      counselor: one(r.assigned_counselor)?.full_name ?? "Unassigned",
      date: new Date(r.date_of_inquiry).toLocaleDateString(),
    },
    csv: {
      name: r.full_name,
      contact: r.contact_number ?? r.email ?? "",
      country: r.country_of_interest ?? "",
      status: r.status,
      counselor: one(r.assigned_counselor)?.full_name ?? "",
      date: r.date_of_inquiry,
    },
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">Leads</h2>
          <p className="text-sm text-muted">{leads?.length ?? 0} in the pipeline</p>
        </div>
        <Link href="/leads/new" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink">
          + New lead
        </Link>
      </div>

      {error && <p className="text-sm text-danger">{error.message}</p>}

      {!error && <DataTable exportFilename="leads" rows={rows} columns={columns} />}
    </div>
  );
}
