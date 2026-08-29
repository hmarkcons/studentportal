import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

// Invoices/commissions carry a genuinely mixed currency (EUR for public
// track, PKR for private track) — summing raw amounts across currencies
// would silently produce a meaningless total, so every metric here is kept
// grouped by currency and rendered as one figure per currency present.
function sumByCurrency(rows: { amount: number; currency: string }[]) {
  const totals = new Map<string, number>();
  for (const { amount, currency } of rows) {
    totals.set(currency, (totals.get(currency) ?? 0) + amount);
  }
  return totals;
}

function formatTotals(totals: Map<string, number>) {
  if (totals.size === 0) return "0";
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => `${amount.toFixed(0)} ${currency}`)
    .join(" · ");
}

export default async function RevenueCommissionPage() {
  const supabase = await createClient();

  const { data: invoices } = await supabase.from("invoices").select("admin_charge, consultancy_fee, currency");
  const { data: installments } = await supabase
    .from("invoice_installments")
    .select("amount, status, invoice:invoices(currency)");
  const { data: staffCommissions } = await supabase.from("staff_commissions").select("amount, status, currency");
  const { data: partnerCommissions } = await supabase.from("partner_commissions").select("expected_amount, status, currency");

  const totalInvoiced = sumByCurrency(
    (invoices ?? []).map((i) => ({ amount: i.admin_charge + i.consultancy_fee, currency: i.currency }))
  );
  const totalCollected = sumByCurrency(
    (installments ?? [])
      .filter((i) => i.status === "paid")
      .map((i) => ({ amount: i.amount, currency: one(i.invoice)?.currency ?? "EUR" }))
  );
  const outstanding = new Map(
    [...totalInvoiced.entries()].map(([currency, invoiced]) => [currency, invoiced - (totalCollected.get(currency) ?? 0)])
  );

  const staffPaid = sumByCurrency((staffCommissions ?? []).filter((c) => c.status === "paid"));
  const staffUnpaid = sumByCurrency((staffCommissions ?? []).filter((c) => c.status === "unpaid"));

  const partnerReceived = sumByCurrency(
    (partnerCommissions ?? []).filter((c) => c.status === "received").map((c) => ({ amount: c.expected_amount ?? 0, currency: c.currency }))
  );
  const partnerOutstanding = sumByCurrency(
    (partnerCommissions ?? []).filter((c) => c.status !== "received").map((c) => ({ amount: c.expected_amount ?? 0, currency: c.currency }))
  );

  return (
    <div className="w-full">
      <Link href="/reports" className="text-sm text-muted hover:text-ink">
        &larr; Back to reports
      </Link>
      <h2 className="mt-2 mb-4 text-lg font-semibold text-ink">Revenue & Commission</h2>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total invoiced" value={formatTotals(totalInvoiced)} />
        <StatCard label="Collected" value={formatTotals(totalCollected)} tone="success" />
        <StatCard label="Outstanding" value={formatTotals(outstanding)} tone="warning" />
        <StatCard label="Partner commission received" value={formatTotals(partnerReceived)} tone="success" />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <h3 className="mb-3 text-sm font-medium text-ink">Staff commission</h3>
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Paid</span>
              <span className="tabular-nums text-ink">{formatTotals(staffPaid)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Unpaid</span>
              <span className="tabular-nums text-ink">{formatTotals(staffUnpaid)}</span>
            </div>
          </div>
        </Card>
        <Card>
          <h3 className="mb-3 text-sm font-medium text-ink">Partner commission</h3>
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Received</span>
              <span className="tabular-nums text-ink">{formatTotals(partnerReceived)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Outstanding</span>
              <span className="tabular-nums text-ink">{formatTotals(partnerOutstanding)}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
