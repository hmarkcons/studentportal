import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/Badge";
import { RefundActions } from "./RefundActions";
import { NewRefundForm } from "./NewRefundForm";

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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
  const isSuperAdmin = staffRow?.role === "super_admin";

  const { data: refunds } = await supabase
    .from("refund_requests")
    .select("id, reason, amount, status, requested_at, student:leads(full_name)")
    .order("requested_at", { ascending: false });

  const { data: students } = await supabase.from("students").select("id, full_name").order("full_name");

  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold text-ink">Refund Requests</h2>
      {isSuperAdmin && <NewRefundForm students={students ?? []} />}
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
              <RefundActions id={r.id} status={r.status} isSuperAdmin={isSuperAdmin} />
            </div>
          </div>
        ))}
        {(!refunds || refunds.length === 0) && <p className="px-4 py-6 text-sm text-muted">No refund requests.</p>}
      </div>
    </div>
  );
}
