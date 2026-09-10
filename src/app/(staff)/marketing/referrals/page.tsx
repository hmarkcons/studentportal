import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { hasPermission } from "@/lib/auth/permissions";
import { formatStamp } from "@/lib/activityStamp";
import { formatAmount } from "@/lib/marketing";
import { NewReferralForm } from "./NewReferralForm";
import { IncentiveStatusButton } from "./IncentiveStatusButton";
import { IncentiveAmountInput } from "./IncentiveAmountInput";

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

  // Attaching an amount and declaring it paid is finance's, not everyone's:
  // referrals_write was the one policy in 0015 written as is_active_staff(),
  // so any active staff member could set an incentive, raise it, mark it paid
  // and delete the record. Gated on the permission rather than the role so
  // Admin > Role Permissions can move it.
  const canSetIncentives = await hasPermission("marketing.referral_incentives");

  const leadNameById = new Map((leads ?? []).map((l) => [l.id, l.full_name]));

  const rows = referrals ?? [];
  const owed = rows.filter((r) => r.incentive_status !== "paid");
  const owedTotal = owed.reduce((sum, r) => sum + Number(r.incentive_owed ?? 0), 0);
  // Which leads already carry a referral, so the form can say so rather than
  // letting somebody log a second one and find out from a constraint.
  const alreadyReferred = new Set(rows.map((r) => r.lead_id));

  return (
    <div className="w-full">
      <h2 className="mb-1 text-lg font-semibold text-ink">Referral Tracking</h2>
      {/* What is outstanding, which is the question this page exists to
          answer and which nothing on it used to add up. */}
      <p className="mb-4 text-sm text-muted">
        {rows.length === 0
          ? "No referrals logged yet."
          : `${rows.length} logged · ${owed.length} still owed · ${formatAmount(owedTotal)} outstanding`}
      </p>
      <Card className="mb-6">
        <NewReferralForm
          leads={(leads ?? []).map((l) => ({ ...l, alreadyReferred: alreadyReferred.has(l.id) }))}
          canSetIncentives={canSetIncentives}
        />
      </Card>
      <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <div>
              <p className="text-ink">
                <Link href={`/leads/${r.lead_id}`} className="font-medium text-primary hover:underline">
                  {leadNameById.get(r.lead_id) ?? "Unknown lead"}
                </Link>{" "}
                <span className="text-muted">referred by {r.referrer_name}</span>
              </p>
              {/* Was toLocaleDateString() with no locale or zone, so it
                  rendered in the server's timezone — UTC on Vercel — and a
                  referral logged after 5am Karachi showed the day before. */}
              <p className="text-xs text-muted">Logged {formatStamp(r.created_at)}</p>
            </div>
            <div className="flex items-center gap-2">
              {canSetIncentives && r.incentive_status !== "paid" ? (
                <IncentiveAmountInput id={r.id} amount={r.incentive_owed} />
              ) : (
                <span className="text-sm tabular-nums text-ink">{formatAmount(r.incentive_owed)}</span>
              )}
              <Badge tone={r.incentive_status === "paid" ? "success" : "warning"}>
                {r.incentive_status === "paid" ? "Paid" : "Owed"}
              </Badge>
              {canSetIncentives && <IncentiveStatusButton id={r.id} status={r.incentive_status} />}
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="px-4 py-6">
            <EmptyState>No referrals logged yet.</EmptyState>
          </div>
        )}
      </div>
    </div>
  );
}
