import Link from "next/link";
import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { readSunsetSettings, stillSilent, sunsetCandidates, type SunsetRun } from "@/lib/emailCampaigns/sunset";
import { sunsetSuppressDue } from "@/lib/emailCampaigns/engagement";
import { karachiDay } from "@/lib/emailCampaigns/sendingRules";
import { EmailTabs, karachiTime } from "../../EmailTabs";
import { AudienceNav } from "../AudienceNav";
import { StartSunsetButton, SunsetSettingsForm, SuppressSilentButton } from "./SunsetForms";

const RUN_STATUS: Record<string, { label: string; tone: "warning" | "success" | "neutral" }> = {
  waiting: { label: "Waiting for answers", tone: "warning" },
  suppressed: { label: "Done — silent ones stopped", tone: "success" },
  closed: { label: "Closed", tone: "neutral" },
};

/**
 * The sunset policy (Phase 6, 0362): people emailed for months who never open
 * are asked once whether they still want HMARK's emails, and those still
 * silent are no longer emailed — which keeps the sender's reputation healthy.
 */
export default async function SunsetPage() {
  const { supabase } = await getStaffSession();
  const admin = createAdminClient();
  const [settings, canManage, canCreate, canSettings, { data: runs }, { data: templates }] = await Promise.all([
    readSunsetSettings(supabase),
    hasPermission("email.audience.manage"),
    hasPermission("email.campaigns.create"),
    hasPermission("email.settings.manage"),
    supabase.from("email_sunset_runs").select("id, mode, list_id, campaign_id, people, status, suppressed, note, created_at").order("created_at", { ascending: false }).limit(20),
    supabase.from("email_templates").select("id, name").is("archived_at", null).not("current_version_id", "is", null).order("name"),
  ]);
  const candidates = await sunsetCandidates(admin, settings.months).catch(() => []);
  const list = (runs ?? []) as SunsetRun[];
  const waiting = list.find((r) => r.status === "waiting");

  // The waiting round: how far along its campaign is, and who is still silent once it is due.
  let waitingInfo: { campaign: { name: string; status: string; practice: boolean; finished_at: string | null } | null; due: { due: boolean; on: Date | null }; silent: number | null } | null = null;
  if (waiting?.campaign_id) {
    const { data: c } = await admin.from("email_campaigns").select("name, status, practice, finished_at").eq("id", waiting.campaign_id).maybeSingle();
    const due = sunsetSuppressDue({ finishedAt: (c?.finished_at as string | null) ?? null, graceDays: settings.graceDays, now: new Date() });
    const silent = c?.status === "sent" && !c.practice ? (await stillSilent(admin, waiting.campaign_id)).length : null;
    waitingInfo = { campaign: c as never, due, silent };
  }

  return (
    <div className="w-full">
      <h2 className="mb-1 text-lg font-semibold text-ink">Email campaigns</h2>
      <p className="mb-4 text-sm text-muted">
        People who have been sent campaigns for {settings.months} months and never open them hurt every other email&rsquo;s chance of reaching the
        inbox. They are asked once whether they still want HMARK&rsquo;s emails; anyone still silent {settings.graceDays} days later is no longer emailed.
        Only real campaigns count — a practice send reached nobody.
      </p>
      <EmailTabs active="audience" />
      <AudienceNav active="sunset" />

      <Card className="mb-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium text-ink">Gone silent</h3>
          <Badge tone={settings.mode === "automatic" ? "info" : "neutral"}>{settings.mode === "automatic" ? "Automatic" : "A person confirms each step"}</Badge>
        </div>
        <p className="mb-3 text-sm text-ink" data-sunset-count>
          {candidates.length.toLocaleString("en-US")} {candidates.length === 1 ? "person has" : "people have"} been sent at least two real campaigns, the first over{" "}
          {settings.months} months ago, and opened or clicked nothing since.
        </p>
        {candidates.length > 0 && (
          <div className="mb-3 overflow-x-auto">
            <table className="w-full text-left text-xs" data-sunset-candidates>
              <thead className="text-muted">
                <tr>
                  <th className="py-1 pr-3 font-medium">Address</th>
                  <th className="py-1 pr-3 text-right font-medium">Campaigns sent</th>
                  <th className="py-1 pr-3 font-medium">Last opened or clicked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {candidates.slice(0, 50).map((c) => (
                  <tr key={c.email}>
                    <td className="py-1 pr-3">
                      {c.lead_id ? (
                        <Link prefetch={false} href={`/leads/${c.lead_id}`} className="text-ink hover:text-primary">
                          {c.email}
                        </Link>
                      ) : (
                        <span className="text-ink">{c.email}</span>
                      )}
                    </td>
                    <td className="py-1 pr-3 text-right text-ink">{c.received}</td>
                    <td className="py-1 pr-3 text-muted">{c.last_engaged_at ? karachiTime(c.last_engaged_at) : "Never"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {candidates.length > 50 && <p className="mt-1 text-[11px] text-muted">The first 50 of {candidates.length.toLocaleString("en-US")}.</p>}
          </div>
        )}
        {canManage && canCreate && !waiting && (
          <div className="flex flex-col gap-1">
            <StartSunsetButton count={candidates.length} automatic={settings.mode === "automatic"} />
            <p className="text-[11px] text-muted">
              {settings.mode === "automatic"
                ? "Automatic: the daily run does this by itself; the button does it now."
                : "Makes a list of them and a draft re-engagement campaign to check and send."}
            </p>
          </div>
        )}
      </Card>

      {waiting && (
        <Card className="mb-6">
          <h3 className="mb-2 text-sm font-medium text-ink">The re-engagement under way</h3>
          <div className="text-sm text-ink" data-sunset-waiting>
            <p>
              {waiting.people.toLocaleString("en-US")} people, from {karachiTime(waiting.created_at)}.{" "}
              {waiting.campaign_id && (
                <Link prefetch={false} href={`/marketing/email/campaigns/${waiting.campaign_id}`} className="text-primary hover:underline">
                  {waitingInfo?.campaign?.name ?? "Its campaign"}
                </Link>
              )}
            </p>
            {!waitingInfo?.campaign || waitingInfo.campaign.status !== "sent" ? (
              <p className="text-muted">Step two waits until its campaign has been sent and has finished.</p>
            ) : waitingInfo.campaign.practice ? (
              <p className="text-muted">It went as a practice send, so nobody received it — nobody can be judged silent on it.</p>
            ) : !waitingInfo.due.due ? (
              <p className="text-muted">They have until {waitingInfo.due.on ? karachiDay(waitingInfo.due.on) : "—"} to open it.</p>
            ) : (
              <div className="mt-2 flex flex-col gap-1">
                <p>{(waitingInfo.silent ?? 0).toLocaleString("en-US")} are still silent.</p>
                {canManage && settings.mode === "confirm" && <SuppressSilentButton runId={waiting.id} count={waitingInfo.silent ?? 0} />}
                {settings.mode === "automatic" && <p className="text-[11px] text-muted">The daily run stops emailing them.</p>}
              </div>
            )}
          </div>
        </Card>
      )}

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Earlier rounds</h3>
        {!list.length ? (
          <p className="text-xs text-muted">None yet.</p>
        ) : (
          <table className="w-full text-left text-xs" data-sunset-runs>
            <thead className="text-muted">
              <tr>
                <th className="py-1 pr-3 font-medium">Started</th>
                <th className="py-1 pr-3 text-right font-medium">People</th>
                <th className="py-1 pr-3 font-medium">Status</th>
                <th className="py-1 pr-3 text-right font-medium">No longer emailed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((r) => (
                <tr key={r.id}>
                  <td className="py-1.5 pr-3 text-ink">
                    {r.campaign_id ? (
                      <Link prefetch={false} href={`/marketing/email/campaigns/${r.campaign_id}`} className="hover:text-primary">
                        {karachiTime(r.created_at)}
                      </Link>
                    ) : (
                      karachiTime(r.created_at)
                    )}
                  </td>
                  <td className="py-1.5 pr-3 text-right text-ink">{r.people.toLocaleString("en-US")}</td>
                  <td className="py-1.5 pr-3">
                    <Badge tone={RUN_STATUS[r.status]?.tone ?? "neutral"}>{RUN_STATUS[r.status]?.label ?? r.status}</Badge>
                    {r.note && <p className="text-muted">{r.note}</p>}
                  </td>
                  <td className="py-1.5 pr-3 text-right text-ink">{r.suppressed.toLocaleString("en-US")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-medium text-ink">Settings</h3>
        <SunsetSettingsForm settings={settings} templates={(templates ?? []).map((t) => ({ id: t.id as string, name: t.name as string }))} canEdit={canSettings} />
      </Card>
    </div>
  );
}
