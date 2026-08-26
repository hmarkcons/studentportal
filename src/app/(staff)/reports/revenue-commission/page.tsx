import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";

export default async function RevenueCommissionPage() {
  const supabase = await createClient();

  const { data: invoices } = await supabase.from("invoices").select("admin_charge, consultancy_fee, currency");
  const { data: installments } = await supabase.from("invoice_installments").select("amount, status");
  const { data: staffCommissions } = await supabase.from("staff_commissions").select("amount, status");
  const { data: partnerCommissions } = await supabase.from("partner_commissions").select("expected_amount, status");

  const totalInvoiced = (invoices ?? []).reduce((s, i) => s + i.admin_charge + i.consultancy_fee, 0);
  const totalCollected = (installments ?? []).filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const outstanding = totalInvoiced - totalCollected;

  const staffPaid = (staffCommissions ?? []).filter((c) => c.status === "paid").reduce((s, c) => s + c.amount, 0);
  const staffUnpaid = (staffCommissions ?? []).filter((c) => c.status === "unpaid").reduce((s, c) => s + c.amount, 0);

  const partnerReceived = (partnerCommissions ?? []).filter((c) => c.status === "received").reduce((s, c) => s + (c.expected_amount ?? 0), 0);
  const partnerOutstanding = (partnerCommissions ?? []).filter((c) => c.status !== "received").reduce((s, c) => s + (c.expected_amount ?? 0), 0);

  return (
    <div className="w-full">
      <Link href="/reports" className="text-sm text-muted hover:text-ink">
        &larr; Back to reports
      </Link>
      <h2 className="mt-2 mb-4 text-lg font-semibold text-ink">Revenue & Commission</h2>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total invoiced" value={totalInvoiced.toFixed(0)} />
        <StatCard label="Collected" value={totalCollected.toFixed(0)} tone="success" />
        <StatCard label="Outstanding" value={outstanding.toFixed(0)} tone="warning" />
        <StatCard label="Partner commission received" value={partnerReceived.toFixed(0)} tone="success" />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <h3 className="mb-3 text-sm font-medium text-ink">Staff commission</h3>
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Paid</span>
              <span className="tabular-nums text-ink">{staffPaid.toFixed(0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Unpaid</span>
              <span className="tabular-nums text-ink">{staffUnpaid.toFixed(0)}</span>
            </div>
          </div>
        </Card>
        <Card>
          <h3 className="mb-3 text-sm font-medium text-ink">Partner commission</h3>
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Received</span>
              <span className="tabular-nums text-ink">{partnerReceived.toFixed(0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Outstanding</span>
              <span className="tabular-nums text-ink">{partnerOutstanding.toFixed(0)}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
