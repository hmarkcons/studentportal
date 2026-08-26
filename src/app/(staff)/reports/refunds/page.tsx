import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/ui/StatCard";

export default async function RefundReportPage() {
  const supabase = await createClient();

  const { data: refunds } = await supabase.from("refund_requests").select("status, amount");

  const byStatus = new Map<string, { count: number; total: number }>();
  (refunds ?? []).forEach((r) => {
    const entry = byStatus.get(r.status) ?? { count: 0, total: 0 };
    entry.count += 1;
    entry.total += r.amount ?? 0;
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
          const entry = byStatus.get(s) ?? { count: 0, total: 0 };
          return <StatCard key={s} label={`${s} (count / total)`} value={`${entry.count} / ${entry.total.toFixed(0)}`} />;
        })}
      </div>
    </div>
  );
}
