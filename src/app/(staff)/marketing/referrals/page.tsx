import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { NewReferralForm } from "./NewReferralForm";
import { IncentiveStatusButton } from "./IncentiveStatusButton";

export default async function ReferralsPage() {
  const supabase = await createClient();
  // Referral tracking is org-wide — logging who referred a lead isn't a
  // case-ownership action, so it shouldn't be limited by the regular leads
  // RLS (assigned counselor, or Management/Super Admin/Marketing only).
  // Any active staff can already log/mark-paid a referral for any lead per
  // referrals_write's RLS; only the read side needs the same breadth, so
  // this page reads leads via the admin client instead of the session one.
  const admin = createAdminClient();
  const { data: leads } = await admin.from("leads").select("id, full_name").order("full_name");
  const { data: referrals } = await supabase
    .from("referrals")
    .select("id, referrer_name, incentive_owed, incentive_status, created_at, lead_id")
    .order("created_at", { ascending: false });

  const leadNameById = new Map((leads ?? []).map((l) => [l.id, l.full_name]));

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
                {leadNameById.get(r.lead_id) ?? "Unknown lead"} <span className="text-muted">referred by {r.referrer_name}</span>
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
        {(!referrals || referrals.length === 0) && (
          <div className="px-4 py-6">
            <EmptyState>No referrals logged yet.</EmptyState>
          </div>
        )}
      </div>
    </div>
  );
}
