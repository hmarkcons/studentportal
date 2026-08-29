import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DataTable } from "@/components/ui/DataTable";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

// staff_commissions.currency is free-typed per row (public-track EUR vs
// private-track PKR genuinely coexist) — summing raw amounts across
// currencies would silently produce a meaningless total, so each staff
// member's paid/unpaid figures are kept grouped by currency.
function formatByCurrency(totals: Map<string, number>) {
  if (totals.size === 0) return "0";
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => `${amount.toFixed(0)} ${currency}`)
    .join(" · ");
}

type Row = { id: string; name: string; paid: Map<string, number>; unpaid: Map<string, number> };

export default async function StaffCommissionReportPage() {
  const supabase = await createClient();

  const { data: commissions } = await supabase
    .from("staff_commissions")
    .select("amount, status, currency, staff:staff(id, full_name)");

  const byStaff = new Map<string, Row>();
  (commissions ?? []).forEach((c) => {
    const staff = one(c.staff);
    if (!staff) return;
    const entry = byStaff.get(staff.id) ?? { id: staff.id, name: staff.full_name, paid: new Map(), unpaid: new Map() };
    const bucket = c.status === "paid" ? entry.paid : entry.unpaid;
    bucket.set(c.currency, (bucket.get(c.currency) ?? 0) + c.amount);
    byStaff.set(staff.id, entry);
  });

  return (
    <div className="w-full">
      <Link href="/reports" className="text-sm text-muted hover:text-ink">
        &larr; Back to reports
      </Link>
      <h2 className="mt-2 mb-4 text-lg font-semibold text-ink">Staff Commission Report</h2>
      <DataTable
        exportFilename="staff-commission-report"
        columns={[
          { key: "name", header: "Staff" },
          { key: "paid", header: "Paid", align: "right" },
          { key: "unpaid", header: "Unpaid", align: "right" },
        ]}
        rows={[...byStaff.values()].map((r) => ({
          id: r.id,
          cells: { name: r.name, paid: formatByCurrency(r.paid), unpaid: formatByCurrency(r.unpaid) },
          csv: { name: r.name, paid: formatByCurrency(r.paid), unpaid: formatByCurrency(r.unpaid) },
        }))}
      />
    </div>
  );
}
