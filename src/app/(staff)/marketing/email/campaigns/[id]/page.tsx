import Link from "next/link";
import { notFound } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { hasPermission } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { campaignProblems, CONFIRM_ABOVE } from "@/lib/emailCampaigns/campaignRules";
import { campaignStats, pct } from "@/lib/emailCampaigns/campaignData";
import { canReallySend, parseCampaignAudience, resolveCampaignAudience } from "@/lib/emailCampaigns/sender";
import { readEmailTopics } from "@/lib/emailCampaigns/subscription";
import { EmailTabs, karachiTime } from "../../EmailTabs";
import { AutoRefresh, CampaignControls, CampaignEditor, CampaignSendPanel, ResendForm, type EditorCampaign } from "../CampaignClient";
import { spamCheck } from "@/lib/emailCampaigns/spamCheck";
import { withContentBlocks } from "@/lib/emailCampaigns/server";
import { STATUS } from "../campaignStatus";

// Starting a send freezes the audience and saves every recipient, which takes a while for a big one.
export const maxDuration = 300;

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export default async function EmailCampaignPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { supabase } = await getStaffSession();
  const admin = createAdminClient();
  const [{ data: c }, canCreate, canSend, canApprove, canReports, user] = await Promise.all([
    supabase.from("email_campaigns").select("*, version:email_template_versions(version, template:email_templates!email_template_versions_template_id_fkey(name))").eq("id", id).maybeSingle(),
    hasPermission("email.campaigns.create"),
    hasPermission("email.campaigns.send"),
    hasPermission("email.campaigns.approve"),
    hasPermission("email.reports.view"),
    getCurrentUser(),
  ]);
  if (!c) notFound();
  const status = c.status as string;
  const st = STATUS[status] ?? STATUS.draft;
  const editable = status === "draft" || status === "pending_approval";
  const version = one(c.version as never) as { version: number; template: { name: string } | { name: string }[] | null } | null;
  const tpl = version ? (one(version.template as never) as { name?: string } | null) : null;
  const templateName = version ? `${tpl?.name ?? "Template"} (version ${version.version})` : "—";

  let editor: React.ReactNode = null;
  let sendPanel: React.ReactNode = null;
  if (editable) {
    const audience = parseCampaignAudience(c.audience);
    const [{ data: templates }, { data: segments }, { data: lists }, topics, realSend, reach, { data: versionBody }, { data: parent }] = await Promise.all([
      supabase
        .from("email_templates")
        .select("name, current_version_id, current:email_template_versions!email_templates_current_version_fkey(version)")
        .is("archived_at", null)
        .not("current_version_id", "is", null)
        .order("name"),
      supabase.from("email_segments").select("id, name").order("name"),
      supabase.from("email_lists").select("id, name").order("name"),
      readEmailTopics(admin),
      canReallySend(admin),
      resolveCampaignAudience(admin, audience, (c.topic as string) ?? null),
      c.template_version_id
        ? supabase.from("email_template_versions").select("html, text_body").eq("id", c.template_version_id).maybeSingle()
        : Promise.resolve({ data: null }),
      audience.resendOf ? supabase.from("email_campaigns").select("name").eq("id", audience.resendOf).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    // The email as it would go: content blocks in, then the spam check of it with the subject and preview text.
    const body = versionBody ? await withContentBlocks(supabase, versionBody.html as string, versionBody.text_body as string | null) : null;
    const spam = body && c.subject ? spamCheck({ subject: c.subject as string, preheader: c.preheader as string | null, html: body.html, text: body.text }) : null;
    const blockProblems = body?.missing.length ? [`The email uses a content block that no longer exists: ${body.missing.map((k) => `{{block:${k}}}`).join(", ")}.`] : [];
    const templateOptions = (templates ?? []).map((t) => ({
      versionId: t.current_version_id as string,
      name: t.name as string,
      note: `version ${(one(t.current as never) as { version?: number } | null)?.version ?? "?"}`,
    }));
    // A campaign holding an older version keeps it on offer, said so.
    if (c.template_version_id && !templateOptions.some((t) => t.versionId === c.template_version_id)) {
      templateOptions.unshift({ versionId: c.template_version_id as string, name: templateName, note: "an older version — choose the template again for its latest" });
    }
    if (canCreate) {
      editor = (
        <CampaignEditor
          campaign={{ ...(c as unknown as EditorCampaign), audience }}
          resendOfName={(parent?.name as string | undefined) ?? null}
          templates={templateOptions}
          segments={(segments ?? []) as { id: string; name: string }[]}
          lists={(lists ?? []) as { id: string; name: string }[]}
          topics={topics}
        />
      );
    }
    if (status === "draft" && canCreate) {
      sendPanel = (
        <CampaignSendPanel
          campaignId={id}
          problems={[...campaignProblems(c as never, { realSend, audienceCount: reach.counts.final }), ...blockProblems]}
          spam={spam}
          reach={reach.counts.final}
          realSend={realSend}
          rights={{ send: canSend, create: canCreate }}
          confirmAbove={CONFIRM_ABOVE}
          defaultTestTo={user?.email ?? ""}
        />
      );
    }
  }

  const stats = (c.recipients_total as number) > 0 ? (await campaignStats(supabase, [id])).get(id)! : null;
  // Resend to non-openers (Phase 6), once it has gone.
  const canResend = canCreate && ["sent", "cancelled", "paused"].includes(status) && (c.recipients_total as number) > 0;
  const { count: nonOpeners } = canResend
    ? await admin
        .from("email_campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", id)
        .eq("status", "sent")
        .eq("human_open_count", 0)
        .eq("human_click_count", 0)
        .is("bounce", null)
        .is("unsubscribed_at", null)
        .is("complained_at", null)
    : { count: null };
  const { count: simulated } = await admin.from("email_events").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("simulated", true);
  const progress = stats ? Math.round(((stats.sent + stats.failed) / Math.max(1, stats.recipients)) * 100) : 0;

  return (
    <div className="w-full">
      {(status === "sending" || status === "scheduled") && <AutoRefresh seconds={10} />}
      <Link prefetch={false} href="/marketing/email/campaigns" className="mb-2 inline-block text-xs text-primary hover:underline">
        ← All campaigns
      </Link>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-ink">{c.name as string}</h2>
        <Badge tone={st.tone}>{st.label}</Badge>
        {c.practice && <Badge tone="warning">Practice — nothing was sent</Badge>}
      </div>
      <EmailTabs active="campaigns" />

      {c.review_note && status === "draft" && (
        <p className="mb-4 rounded-md bg-warning-bg px-3 py-2 text-sm text-warning">Sent back: {c.review_note as string}</p>
      )}
      {status === "pending_approval" && (
        <p className="mb-4 rounded-md bg-info-bg px-3 py-2 text-sm text-info">
          Waiting for approval{c.scheduled_at ? `, to go ${karachiTime(c.scheduled_at as string)}` : ""}. Changing it sends it back to draft.
        </p>
      )}
      {c.paused_reason && (status === "paused" || status === "failed") && (
        <p className="mb-4 rounded-md bg-warning-bg px-3 py-2 text-sm text-warning">{c.paused_reason as string}</p>
      )}

      {editable ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card>{editor ?? <p className="text-sm text-muted">Only someone who may create campaigns can change it.</p>}</Card>
          <div className="flex flex-col gap-6">
            {sendPanel && <Card>{sendPanel}</Card>}
            <Card>
              <CampaignControls campaignId={id} status={status} practice={Boolean(c.practice)} canSend={canSend} canApprove={canApprove} canCreate={canCreate} hasSimulated={Boolean(simulated)} />
            </Card>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <Card>
            <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4" data-campaign-summary>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted">Subject</p>
                <p className="text-ink">{(c.subject as string) ?? "—"}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted">Template</p>
                <p className="text-ink">{templateName}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted">{status === "scheduled" ? "Goes" : "Started"}</p>
                <p className="text-ink">{karachiTime((status === "scheduled" ? c.scheduled_at : c.started_at) as string)}</p>
                {c.spread_hours && <p className="text-xs text-muted">spread over {c.spread_hours as number} hour{c.spread_hours === 1 ? "" : "s"}</p>}
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted">Recipients</p>
                <p className="text-ink" data-campaign-recipients>
                  {(c.recipients_total as number) > 0 ? (c.recipients_total as number).toLocaleString("en-US") : "Counted when it starts"}
                </p>
              </div>
            </div>
            {stats && (
              <div className="mt-4">
                <div className="h-2 w-full overflow-hidden rounded-full bg-bg">
                  <div className="h-2 rounded-full bg-primary" style={{ width: `${progress}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted" data-campaign-progress>
                  {stats.sent.toLocaleString("en-US")} sent · {stats.queued.toLocaleString("en-US")} waiting · {stats.failed.toLocaleString("en-US")} failed
                </p>
              </div>
            )}
          </Card>

          {stats && stats.sent > 0 && canReports && (
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-medium text-ink">So far</h3>
                <Link prefetch={false} href={`/marketing/email/campaigns/${id}/report`} className="text-xs text-primary hover:underline">
                  Full report →
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 text-sm">
                {[
                  ["Delivered", pct(stats.delivered, stats.sent)],
                  ["Opened (people)", pct(stats.opened_human, stats.delivered || stats.sent)],
                  ["Clicked (people)", pct(stats.clicked_human, stats.delivered || stats.sent)],
                  ["Visited the website", stats.visited.toLocaleString("en-US")],
                  ["Bounced", (stats.hard_bounces + stats.soft_bounces).toLocaleString("en-US")],
                  ["Unsubscribed", stats.unsubscribes.toLocaleString("en-US")],
                ].map(([k, v]) => (
                  <div key={k}>
                    <p className="text-[11px] uppercase tracking-wide text-muted">{k}</p>
                    <p className="text-lg font-semibold text-ink">{v}</p>
                  </div>
                ))}
              </div>
              {c.practice && !simulated && (
                <p className="mt-3 text-xs text-muted">A practice campaign reaches no one, so its report stays empty — use “Simulate activity” to try the report.</p>
              )}
            </Card>
          )}

          {canResend && (
            <Card>
              <ResendForm campaignId={id} nonOpeners={nonOpeners ?? 0} subject={(c.subject as string) ?? ""} />
            </Card>
          )}

          <Card>
            <CampaignControls campaignId={id} status={status} practice={Boolean(c.practice)} canSend={canSend} canApprove={canApprove} canCreate={canCreate} hasSimulated={Boolean(simulated)} />
          </Card>
        </div>
      )}
    </div>
  );
}
