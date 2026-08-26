import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { NewReferralForm } from "./NewReferralForm";
import { IncentiveStatusButton } from "./IncentiveStatusButton";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function ReferralsPage() {
  const supabase = await createClient();
  const { data: leads } = await supabase.from("leads").select("id, full_name").order("full_name");
  const { data: referrals } = await supabase
    .from("referrals")
    .select("id, referrer_name, incentive_owed, incentive_status, created_at, lead:leads(full_name)")
    .order("created_at", { ascending: false });

  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold text-ink">Referral Tracking</h2>
      <Card className="mb-6">
        <NewReferralForm leads={leads ?? []} />
      </Card>
      <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
        {(referrals ?? []).map((r) => (
          <div key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <div>
              <p className="text-ink">
                {one(r.lead)?.full_name} <span className="text-muted">referred by {r.referrer_name}</span>
              </p>
              <p className="text-xs text-muted">{new Date(r.created_at).toLocaleDateString()}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm tabular-nums text-ink">{r.incentive_owed != null ? r.incentive_owed : "—"}</span>
              <Badge tone={r.incentive_status === "paid" ? "success" : "warning"}>{r.incentive_status}</Badge>
              <IncentiveStatusButton id={r.id} status={r.incentive_status} />
            </div>
          </div>
        ))}
        {(!referrals || referrals.length === 0) && <p className="px-4 py-6 text-sm text-muted">No referrals logged yet.</p>}
      </div>
    </div>
  );
}
