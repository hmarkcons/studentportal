import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DataTable } from "@/components/ui/DataTable";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

type Row = { id: string; name: string; paid: number; unpaid: number };

export default async function StaffCommissionReportPage() {
  const supabase = await createClient();

  const { data: commissions } = await supabase.from("staff_commissions").select("amount, status, staff:staff(id, full_name)");

  const byStaff = new Map<string, Row>();
  (commissions ?? []).forEach((c) => {
    const staff = one(c.staff);
    if (!staff) return;
    const entry = byStaff.get(staff.id) ?? { id: staff.id, name: staff.full_name, paid: 0, unpaid: 0 };
    if (c.status === "paid") entry.paid += c.amount;
    else entry.unpaid += c.amount;
    byStaff.set(staff.id, entry);
  });

  return (
    <div className="mx-auto max-w-2xl">
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
          cells: { name: r.name, paid: r.paid.toFixed(0), unpaid: r.unpaid.toFixed(0) },
          csv: { name: r.name, paid: String(r.paid), unpaid: String(r.unpaid) },
        }))}
      />
    </div>
  );
}
