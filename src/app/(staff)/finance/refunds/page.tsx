import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/Badge";
import { RefundActions } from "./RefundActions";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

const TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  requested: "warning",
  approved: "info",
  processed: "success",
  rejected: "danger",
};

export default async function RefundsPage() {
  const supabase = await createClient();
  const { data: refunds } = await supabase
    .from("refund_requests")
    .select("id, reason, amount, status, requested_at, student:leads(full_name)")
    .order("requested_at", { ascending: false });

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-4 text-lg font-semibold text-ink">Refund Requests</h2>
      <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
        {(refunds ?? []).map((r) => (
          <div key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <div>
              <p className="text-ink">
                {one(r.student)?.full_name} — {r.amount ?? "—"}
              </p>
              <p className="text-xs text-muted">{r.reason}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={TONE[r.status] ?? "neutral"}>{r.status}</Badge>
              <RefundActions id={r.id} status={r.status} />
            </div>
          </div>
        ))}
        {(!refunds || refunds.length === 0) && <p className="px-4 py-6 text-sm text-muted">No refund requests.</p>}
      </div>
    </div>
  );
}
