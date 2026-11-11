import Link from "next/link";
import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { recipientOutcome } from "@/lib/emailCampaigns/reportRules";

const STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  subscribed: { label: "Subscribed", tone: "success" },
  unsubscribed: { label: "Unsubscribed", tone: "warning" },
  bounced: { label: "Address bounced", tone: "danger" },
  complained: { label: "Marked us as spam", tone: "danger" },
  suppressed: { label: "Do not email", tone: "warning" },
  invalid: { label: "Invalid address", tone: "danger" },
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", year: "numeric" }) : "—";

/**
 * The campaigns a lead was sent and what they did with each — for whoever
 * may see email reports; nobody else gets the card at all.
 */
export async function EmailActivityCard({ leadId, email, className = "" }: { leadId: string; email: string | null; className?: string }) {
  if (!(await hasPermission("email.reports.view"))) return null;
  const { supabase } = await getStaffSession();
  const [{ data: rows }, { data: state }] = await Promise.all([
    supabase
      .from("email_campaign_recipients")
      .select(
        "id, status, sent_at, delivered_at, human_open_count, human_click_count, bounce, complained_at, unsubscribed_at, visited_at, converted_at, campaign:email_campaigns(id, name, practice)"
      )
      .eq("lead_id", leadId)
      .order("sent_at", { ascending: false, nullsFirst: false })
      .limit(20),
    email ? supabase.from("email_contact_status").select("status, status_reason").eq("email", email.trim().toLowerCase()).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const list = rows ?? [];
  // Every address a campaign reached has a state; none, and none sent, is a lead never emailed. None read but
  // some sent is a viewer who may not read address states, who is shown no badge rather than a guess.
  const st = state ? (STATUS[state.status as string] ?? STATUS.subscribed) : list.length ? null : { label: "Not emailed yet", tone: "neutral" as const };
  return (
    <Card className={className}>
      <div className="mb-3 flex flex-wrap items-center gap-2" data-lead-email-activity>
        <h3 className="text-sm font-medium text-ink">Email campaigns</h3>
        {email && st && <Badge tone={st.tone}>{st.label}</Badge>}
        {state?.status_reason && <span className="text-xs text-muted">{state.status_reason as string}</span>}
      </div>
      {!list.length ? (
        <p className="text-xs text-muted">{email ? "No campaign has been sent to them yet." : "No email address on file."}</p>
      ) : (
        <ul className="divide-y divide-border text-xs">
          {list.map((r) => {
            const c = (Array.isArray(r.campaign) ? r.campaign[0] : r.campaign) as { id: string; name: string; practice: boolean } | null;
            return (
              <li key={r.id as string} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span>
                  {c ? (
                    <Link prefetch={false} href={`/marketing/email/campaigns/${c.id}/report?tab=recipients&r=${r.id}`} className="font-medium text-ink hover:text-primary">
                      {c.name}
                    </Link>
                  ) : (
                    "A campaign"
                  )}{" "}
                  {c?.practice && <Badge tone="warning">Practice</Badge>}
                  <span className="text-muted"> · {when(r.sent_at as string | null)}</span>
                </span>
                <span className="text-ink">{recipientOutcome(r as never)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
