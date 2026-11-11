import Link from "next/link";
import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { campaignStats, pct } from "@/lib/emailCampaigns/campaignData";
import { EmailTabs, karachiTime } from "../EmailTabs";
import { NewCampaignForm } from "./CampaignClient";
import { STATUS } from "./campaignStatus";


export default async function EmailCampaignsListPage() {
  const { supabase } = await getStaffSession();
  const [canCreate, { data: campaigns }] = await Promise.all([
    hasPermission("email.campaigns.create"),
    supabase
      .from("email_campaigns")
      .select("id, name, subject, status, practice, recipients_total, scheduled_at, started_at, finished_at, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  const list = campaigns ?? [];
  const stats = await campaignStats(supabase, list.filter((c) => c.recipients_total > 0).map((c) => c.id as string));

  return (
    <div className="w-full">
      <h2 className="mb-1 text-lg font-semibold text-ink">Email campaigns</h2>
      <p className="mb-4 text-sm text-muted">Send a template to an audience, now or at a time, and see who opened, clicked and visited the website.</p>
      <EmailTabs active="campaigns" />

      {canCreate && (
        <Card className="mb-6">
          <NewCampaignForm />
        </Card>
      )}

      {!list.length ? (
        <EmptyState>No campaigns yet.</EmptyState>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" data-campaign-list>
              <thead className="text-muted">
                <tr>
                  <th className="py-1 pr-3 font-medium">Campaign</th>
                  <th className="py-1 pr-3 font-medium">Status</th>
                  <th className="py-1 pr-3 text-right font-medium">Recipients</th>
                  <th className="py-1 pr-3 text-right font-medium">Opened</th>
                  <th className="py-1 pr-3 text-right font-medium">Clicked</th>
                  <th className="py-1 pr-3 font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.map((c) => {
                  const s = stats.get(c.id as string);
                  const st = STATUS[c.status as string] ?? STATUS.draft;
                  return (
                    <tr key={c.id as string}>
                      <td className="py-2 pr-3">
                        <Link prefetch={false} href={`/marketing/email/campaigns/${c.id}`} className="font-medium text-ink hover:text-primary">
                          {c.name as string}
                        </Link>
                        {c.subject && <p className="truncate text-muted">{c.subject as string}</p>}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge tone={st.tone}>{st.label}</Badge> {c.practice && <Badge tone="warning">Practice</Badge>}
                      </td>
                      <td className="py-2 pr-3 text-right text-ink">{(c.recipients_total as number) > 0 ? (c.recipients_total as number).toLocaleString("en-US") : "—"}</td>
                      <td className="py-2 pr-3 text-right text-ink">{s && s.sent ? pct(s.opened_human, s.delivered || s.sent) : "—"}</td>
                      <td className="py-2 pr-3 text-right text-ink">{s && s.sent ? pct(s.clicked_human, s.delivered || s.sent) : "—"}</td>
                      <td className="py-2 pr-3 text-muted">
                        {c.status === "scheduled"
                          ? `Goes ${karachiTime(c.scheduled_at as string)}`
                          : c.finished_at
                            ? karachiTime(c.finished_at as string)
                            : c.started_at
                              ? `Started ${karachiTime(c.started_at as string)}`
                              : `Created ${karachiTime(c.created_at as string)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
