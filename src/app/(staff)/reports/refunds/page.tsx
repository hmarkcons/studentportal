import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/ui/StatCard";

// refund_requests.currency is a free-typed field per row (public-track EUR
// vs private-track PKR genuinely coexist, same as every other report this
// session) — group totals by currency instead of summing across them.
function formatByCurrency(totals: Map<string, number>) {
  if (totals.size === 0) return "0";
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => `${amount.toFixed(0)} ${currency}`)
    .join(" · ");
}

export default async function RefundReportPage() {
  const supabase = await createClient();

  const { data: refunds } = await supabase.from("refund_requests").select("status, amount, currency");

  const byStatus = new Map<string, { count: number; totals: Map<string, number> }>();
  (refunds ?? []).forEach((r) => {
    const entry = byStatus.get(r.status) ?? { count: 0, totals: new Map<string, number>() };
    entry.count += 1;
    const currency = r.currency ?? "EUR";
    entry.totals.set(currency, (entry.totals.get(currency) ?? 0) + (r.amount ?? 0));
    byStatus.set(r.status, entry);
  });

  const statuses = ["requested", "approved", "processed", "rejected"];

  return (
    <div className="w-full">
      <Link href="/reports" className="text-sm text-muted hover:text-ink">
        &larr; Back to reports
      </Link>
      <h2 className="mt-2 mb-4 text-lg font-semibold text-ink">Refund Report</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {statuses.map((s) => {
          const entry = byStatus.get(s) ?? { count: 0, totals: new Map<string, number>() };
          return <StatCard key={s} label={`${s} (count / total)`} value={`${entry.count} / ${formatByCurrency(entry.totals)}`} />;
        })}
      </div>
    </div>
  );
}
