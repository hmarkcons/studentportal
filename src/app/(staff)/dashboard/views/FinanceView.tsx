import type { SupabaseClient } from "@supabase/supabase-js";
import { StatCard } from "@/components/ui/StatCard";
import { ChartCard } from "@/components/charts/ChartCard";
import { ProgressRing } from "@/components/charts/ProgressRing";
import { BarChart } from "@/components/charts/BarChart";
import { DonutChart } from "@/components/charts/DonutChart";
import { compactNumber } from "@/lib/chartMath";
import { karachiToday } from "@/lib/calendarDates";
import { recentMonths } from "@/lib/leadOwners";
import { formatAmount } from "@/lib/marketing";
import { DUE_SOON_DAYS, summarizeFinance } from "@/lib/dashboards/finance";
import { loadFinanceRows } from "@/lib/dashboards/load";
import { approxPkr, days, Kpis, LinkList, Row } from "./shared";

const AGING_COLORS = ["var(--chart-3)", "var(--warning)", "var(--chart-5)", "var(--danger)"];

/**
 * Accounts & finance: money in, money owed, money late. Totals across
 * currencies are converted to PKR at the fixed rates and marked "≈"; what was
 * collected this month is also given in each currency as it was received.
 */
export async function FinanceView({ db }: { db: SupabaseClient }) {
  const today = karachiToday();
  const months = recentMonths(6);
  const rows = await loadFinanceRows(db, { months });
  const s = summarizeFinance({ ...rows, months, today });
  const collectedText = s.collectedThisMonth.length ? s.collectedThisMonth.map((c) => formatAmount(c.amount, c.currency)).join(" · ") : "Nothing yet";

  return (
    <div className="flex flex-col gap-4" data-dashboard-view="finance">
      <Kpis>
        <StatCard label="Collected this month" value={s.collectedThisMonth.length ? approxPkr(s.collectedMonthlyPkr.at(-1)?.pkr ?? 0) : "—"} tone="success" hint={collectedText} />
        <StatCard label="Overdue" value={approxPkr(s.overduePkr)} tone={s.overdueCount ? "danger" : "default"} hint={`${s.overdueCount} instalment${s.overdueCount === 1 ? "" : "s"} past due`} />
        <StatCard label={`Due in ${DUE_SOON_DAYS} days`} value={approxPkr(s.dueSoonPkr)} tone={s.dueSoonCount ? "warning" : "default"} hint={`${s.dueSoonCount} instalment${s.dueSoonCount === 1 ? "" : "s"}`} />
        <StatCard label="Outstanding" value={approxPkr(s.outstandingPkr)} hint={`${rows.unsentInvoices} invoice${rows.unsentInvoices === 1 ? "" : "s"} not yet sent`} />
      </Kpis>

      <Row cols={3}>
        <ChartCard title="This month's collections" subtitle="Received against what fell due this month">
          <div className="flex justify-center py-2">
            <ProgressRing
              value={s.collectedOfDueThisMonthPkr}
              target={s.dueThisMonthPkr || null}
              display={s.dueThisMonthPkr ? `${Math.round((s.collectedOfDueThisMonthPkr / s.dueThisMonthPkr) * 100)}%` : "—"}
              label="Collected"
              caption={s.dueThisMonthPkr ? `${approxPkr(s.collectedOfDueThisMonthPkr)} of ${approxPkr(s.dueThisMonthPkr)}` : "nothing fell due this month"}
            />
          </div>
        </ChartCard>
        <ChartCard title="Collected per month" subtitle="≈ PKR, last six months" href="/finance/consultancy-fee" linkLabel="Consultancy fee" className="lg:col-span-2">
          <BarChart label="Money collected per month, approximately in PKR" data={s.collectedMonthlyPkr.map((m) => ({ label: m.label, value: m.pkr }))} format={compactNumber} color="var(--chart-1)" />
        </ChartCard>
      </Row>

      <Row>
        <ChartCard title="How late the overdue money is" subtitle="≈ PKR, by days past due">
          <DonutChart label="Overdue money by how late it is" centerLabel="≈ PKR overdue" slices={s.aging.map((a, i) => ({ label: a.label, value: a.pkr, color: AGING_COLORS[i] }))} />
        </ChartCard>
        <ChartCard title="Overdue instalments" subtitle="Longest overdue first" href="/finance/consultancy-fee" linkLabel="Consultancy fee">
          <LinkList
            empty="Nothing overdue."
            items={s.overdue.map((o, i) => ({
              key: `${o.studentId}-${i}`,
              href: o.studentId ? `/students/${o.studentId}` : undefined,
              label: o.studentName,
              detail: `${formatAmount(o.remaining, o.currency)} · ${days(o.days)}`,
              tone: o.days > 30 ? "danger" : "warning",
            }))}
          />
        </ChartCard>
      </Row>

      <Row cols={3}>
        <ChartCard title="University commissions" subtitle="Received against expected, ≈ PKR" href="/finance/partner-commissions" linkLabel="Commissions">
          <div className="flex justify-center py-2">
            <ProgressRing
              value={s.partner.rate}
              label="Received"
              caption={
                s.partner.expectedPkr
                  ? `${approxPkr(s.partner.receivedPkr)} of ${approxPkr(s.partner.expectedPkr)}${s.partner.overdueCount ? ` · ${s.partner.overdueCount} overdue` : ""}`
                  : "no commission expected yet"
              }
              tone={s.partner.overdueCount ? "warning" : "success"}
            />
          </div>
        </ChartCard>
        <ChartCard title="Refunds" subtitle="Waiting on finance" href="/finance/refunds" linkLabel="Refunds">
          <LinkList
            empty="No refunds waiting."
            items={[
              ...(s.refunds.toApprove ? [{ key: "approve", href: "/finance/refunds", label: "Requested — to decide", detail: String(s.refunds.toApprove), tone: "warning" as const }] : []),
              ...(s.refunds.toPay ? [{ key: "pay", href: "/finance/refunds", label: "Approved — to pay out", detail: `${s.refunds.toPay} · ${approxPkr(s.refunds.toPayPkr)}`, tone: "danger" as const }] : []),
            ]}
          />
        </ChartCard>
        <ChartCard title="Staff commission" subtitle="Earned and not yet paid" href="/finance/staff-commission" linkLabel="Staff commission">
          <p className="py-4 text-center text-2xl font-semibold text-ink">{s.staffCommissionUnpaidPkr ? approxPkr(s.staffCommissionUnpaidPkr) : "—"}</p>
          <p className="text-center text-xs text-muted">{s.staffCommissionUnpaidPkr ? "to be paid with payroll" : "Nothing unpaid."}</p>
        </ChartCard>
      </Row>
    </div>
  );
}
