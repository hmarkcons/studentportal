import Link from "next/link";
import { requireReportAccess } from "@/lib/auth/reportAccess";
import { computeInvoiceMath, computePaymentProgress } from "@/lib/invoiceMath";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";
import { PARTNER_COMMISSION_STATUSES, PARTNER_COMMISSION_STATUS_LABELS } from "@/lib/constants";

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
  const { supabase } = await requireReportAccess("/reports/revenue-commission");

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, admin_charge, consultancy_fee, discount_amount, tax_rate, currency");
  const { data: installments } = await supabase
    .from("invoice_installments")
    .select("invoice_id, amount, amount_paid, status, due_date");
  const { data: lineItems } = await supabase.from("invoice_line_items").select("invoice_id, amount");
  const { data: staffCommissions } = await supabase.from("staff_commissions").select("amount, status, currency");
  const { data: partnerCommissions } = await supabase.from("partner_commissions").select("expected_amount, status, currency");

  type ScheduleRow = { amount: number | null; amount_paid: number | null; status: string | null; due_date: string | null };
  const scheduleByInvoice = new Map<string, ScheduleRow[]>();
  for (const i of installments ?? []) {
    const list = scheduleByInvoice.get(i.invoice_id) ?? [];
    list.push(i);
    scheduleByInvoice.set(i.invoice_id, list);
  }

  const extrasByInvoice = new Map<string, number>();
  for (const li of lineItems ?? []) {
    extrasByInvoice.set(li.invoice_id, (extrasByInvoice.get(li.invoice_id) ?? 0) + Number(li.amount ?? 0));
  }

  // Every figure below is derived per invoice through computeInvoiceMath and
  // computePaymentProgress — the same two functions the PDF, the receipt email
  // and the student's own payments page use — so this page cannot disagree with
  // the documents it is summarising.
  //
  // It did. "Total invoiced" was admin_charge + consultancy_fee, which ignores
  // both the discount and the SRB tax, and understated real invoiced revenue by
  // EUR 108 across the three invoices on file. Outstanding was wrong by the
  // same amount. InvoicePanel had already been fixed for exactly this; the
  // report was still adding the two fees.
  //
  // The stored tax_rate is passed rather than SRB_TAX_RATE so an invoice raised
  // before the tax existed keeps its own rate instead of having 5% applied
  // retroactively — one of the three is a 0% invoice, and defaulting would
  // overstate it.
  const totalInvoiced = new Map<string, number>();
  const totalCollected = new Map<string, number>();
  const outstanding = new Map<string, number>();
  const add = (m: Map<string, number>, currency: string, amount: number) =>
    m.set(currency, (m.get(currency) ?? 0) + amount);

  for (const i of invoices ?? []) {
    const currency = i.currency ?? "EUR";
    const billed =
      computeInvoiceMath({
        consultancyFee: Number(i.consultancy_fee ?? 0),
        adminCharge: Number(i.admin_charge ?? 0),
        discountAmount: Number(i.discount_amount ?? 0),
        taxRate: Number(i.tax_rate ?? 0),
      }).total + (extrasByInvoice.get(i.id) ?? 0);
    // paid, not a raw amount_paid sum: computePaymentProgress counts a settled
    // installment by its amount and a partial one by what was actually
    // received, so an installment marked paid without a recorded figure still
    // counts as collected.
    const paid = computePaymentProgress(scheduleByInvoice.get(i.id) ?? []).paid;

    add(totalInvoiced, currency, billed);
    add(totalCollected, currency, paid);
    // Clamped per invoice, so an overpayment on one cannot mask what is still
    // owed on another.
    add(outstanding, currency, Math.max(0, billed - paid));
  }

  const staffPaid = sumByCurrency((staffCommissions ?? []).filter((c) => c.status === "paid"));
  const staffUnpaid = sumByCurrency((staffCommissions ?? []).filter((c) => c.status === "unpaid"));

  // partner_commissions.status has six values — not_yet_due, pending,
  // received, partially_received, overdue, disputed — and the table records
  // only an expected_amount, never a figure for what actually arrived. This
  // was a received/outstanding binary on `status !== "received"`, which put
  // partially_received wholly in outstanding as though none of it had come in,
  // and hid overdue and disputed inside the same number as not_yet_due. Money
  // chased differently should not be added together, so each status stands on
  // its own and nothing is silently rebucketed.
  const partnerByStatus = new Map<string, Map<string, number>>();
  for (const c of partnerCommissions ?? []) {
    const status = c.status ?? "pending";
    const totals = partnerByStatus.get(status) ?? new Map<string, number>();
    totals.set(c.currency ?? "EUR", (totals.get(c.currency ?? "EUR") ?? 0) + Number(c.expected_amount ?? 0));
    partnerByStatus.set(status, totals);
  }
  const partnerReceived = partnerByStatus.get("received") ?? new Map<string, number>();

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
          <h3 className="mb-1 text-sm font-medium text-ink">Partner commission</h3>
          <p className="mb-3 text-xs text-muted">Expected amounts, by where each one has got to.</p>
          <div className="flex flex-col gap-2 text-sm">
            {PARTNER_COMMISSION_STATUSES.filter((s) => partnerByStatus.has(s)).map((s) => (
              <div key={s} className="flex justify-between">
                <span className="text-muted">{PARTNER_COMMISSION_STATUS_LABELS[s]}</span>
                <span className="tabular-nums text-ink">{formatTotals(partnerByStatus.get(s)!)}</span>
              </div>
            ))}
            {partnerByStatus.size === 0 && <p className="text-xs text-muted">No partner commissions recorded yet.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
