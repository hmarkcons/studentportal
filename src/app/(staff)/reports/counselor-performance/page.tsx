import Link from "next/link";
import { requireReportAccess } from "@/lib/auth/reportAccess";
import { buildLeadOwners, ownerKey } from "@/lib/leadOwners";
import { STAFF_ROLE_LABELS } from "@/lib/constants";
import { DataTable } from "@/components/ui/DataTable";

export default async function CounselorPerformancePage() {
  const { supabase } = await requireReportAccess("/reports/counselor-performance");

  // Every staff member, not only role='counselor'. See buildLeadOwners: 12 of
  // the 22 leads on file are held by management, super_admin or
  // digital_marketing staff and 3 by nobody, so filtering by role covered 7
  // leads and 6 of the 17 registrations while looking like the whole picture.
  const { data: staff } = await supabase.from("staff").select("id, full_name, role, status, monthly_target");
  const { data: leads } = await supabase.from("leads").select("assigned_counselor_id, registered_at");

  const owners = buildLeadOwners(staff ?? [], leads ?? []);

  const assigned = new Map<string, number>();
  const registered = new Map<string, number>();
  for (const l of leads ?? []) {
    const key = ownerKey(l);
    assigned.set(key, (assigned.get(key) ?? 0) + 1);
    if (l.registered_at) registered.set(key, (registered.get(key) ?? 0) + 1);
  }

  const rows = owners.map((o) => {
    const a = assigned.get(o.id) ?? 0;
    const r = registered.get(o.id) ?? 0;
    const note = o.isUnassigned
      ? "nobody assigned"
      : [o.isOtherRole && o.role ? (STAFF_ROLE_LABELS[o.role as never] ?? o.role) : null, o.isInactive ? "no longer active" : null]
          .filter(Boolean)
          .join(" · ");
    return { id: o.id, name: o.name, note, assigned: a, registered: r, conversionPct: a ? Math.round((r / a) * 100) : null };
  });

  const totals = rows.reduce((t, r) => ({ assigned: t.assigned + r.assigned, registered: t.registered + r.registered }), {
    assigned: 0,
    registered: 0,
  });

  return (
    <div className="w-full">
      <Link href="/reports" className="text-sm text-muted hover:text-ink">
        &larr; Back to reports
      </Link>
      <h2 className="mt-2 mb-1 text-lg font-semibold text-ink">Counselor-wise Performance</h2>
      <p className="mb-4 text-sm text-muted">
        Everyone holding leads, whatever their role, plus any leads assigned to nobody &mdash; so the{" "}
        {totals.assigned} leads and {totals.registered} registrations here are all of them, and reconcile with the
        leads list.
      </p>
      <DataTable
        exportFilename="counselor-performance"
        columns={[
          { key: "name", header: "Assigned to" },
          { key: "assigned", header: "Leads assigned", align: "right" },
          { key: "registered", header: "Registered", align: "right" },
          { key: "conv", header: "Conversion rate", align: "right" },
        ]}
        rows={rows.map((r) => ({
          id: r.id,
          cells: {
            name: r.note ? `${r.name} — ${r.note}` : r.name,
            assigned: r.assigned,
            registered: r.registered,
            // No leads means no conversion rate to report; 0% would read as a
            // failure to convert leads nobody was given.
            conv: r.conversionPct === null ? "—" : `${r.conversionPct}%`,
          },
          csv: {
            name: r.note ? `${r.name} (${r.note})` : r.name,
            assigned: String(r.assigned),
            registered: String(r.registered),
            conv: r.conversionPct === null ? "" : String(r.conversionPct),
          },
        }))}
      />
    </div>
  );
}
