import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { NewReferralForm } from "./NewReferralForm";
import { IncentiveStatusButton } from "./IncentiveStatusButton";

export default async function ReferralsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
  const orgWideRoles = ["management", "super_admin", "marketing", "digital_marketing"];

  // Referral tracking is org-wide — logging who referred a lead isn't a
  // case-ownership action, so the "referred lead" picker shouldn't be
  // limited to a Counselor's own assigned leads the way leads_select
  // normally restricts it. But that breadth is only warranted for the
  // roles leads_select's own org-wide clause already grants it to
  // (management/super_admin/marketing/digital_marketing) — going through
  // the admin client unconditionally for every role would let e.g. a
  // Counselor or Finance staffer browse every other counselor's leads by
  // full name just by opening this page, which leads_select was
  // specifically built to prevent. Any other role falls back to the
  // session client, correctly scoped by RLS to their own visibility.
  const { data: leads } = staffRow && orgWideRoles.includes(staffRow.role)
    ? await createAdminClient().from("leads").select("id, full_name").order("full_name")
    : await supabase.from("leads").select("id, full_name").order("full_name");
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
                <Link href={`/leads/${r.lead_id}`} className="font-medium text-primary hover:underline">
                  {leadNameById.get(r.lead_id) ?? "Unknown lead"}
                </Link>{" "}
                <span className="text-muted">referred by {r.referrer_name}</span>
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
