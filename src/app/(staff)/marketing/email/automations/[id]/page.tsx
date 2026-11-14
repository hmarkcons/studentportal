import Link from "next/link";
import { notFound } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { campaignStats, pct, type CampaignStats } from "@/lib/emailCampaigns/campaignData";
import { readEmailTopics } from "@/lib/emailCampaigns/subscription";
import { applicationStageLabel } from "@/lib/finalizedStage";
import { STEP_CONDITIONS, stepWhen, TRIGGERS, type StepCondition, type Trigger } from "@/lib/emailCampaigns/journeys";
import { EmailTabs, karachiTime } from "../../EmailTabs";
import { JourneyControls, JourneyEditor } from "../JourneyClient";

const STATUS = { draft: { label: "Draft", tone: "neutral" }, active: { label: "On", tone: "success" }, paused: { label: "Paused", tone: "warning" } } as const;
const ENROL = { active: "On their way", completed: "Finished", exited: "Left" } as const;

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export default async function AutomationPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { supabase } = await getStaffSession();
  const admin = createAdminClient();
  const [{ data: j }, { data: steps }, canCreate, canSend, canReports] = await Promise.all([
    supabase.from("email_journeys").select("id, name, trigger, trigger_config, status, topic, activated_at").eq("id", id).maybeSingle(),
    supabase.from("email_journey_steps").select("position, day, condition, subject, preheader, template_version_id, campaign_id").eq("journey_id", id).order("position"),
    hasPermission("email.campaigns.create"),
    hasPermission("email.campaigns.send"),
    hasPermission("email.reports.view"),
  ]);
  if (!j) notFound();
  const trigger = j.trigger as Trigger;
  const stepCampaigns = (steps ?? []).map((s) => s.campaign_id as string).filter(Boolean);
  const [{ data: templates }, topics, { data: destinations }, { data: enrolments }, stats, { count: activeCount }] = await Promise.all([
    supabase.from("email_templates").select("name, current_version_id").is("archived_at", null).not("current_version_id", "is", null).order("name"),
    readEmailTopics(admin),
    trigger === "application_stage" ? admin.from("destinations").select("pipeline_stages") : Promise.resolve({ data: null }),
    supabase
      .from("email_journey_enrolments")
      .select("id, lead_id, status, exit_reason, anchor_at, next_position, enrolled_at, lead:leads(full_name)")
      .eq("journey_id", id)
      .order("enrolled_at", { ascending: false })
      .limit(50),
    canReports && stepCampaigns.length ? campaignStats(supabase, stepCampaigns) : Promise.resolve(new Map<string, CampaignStats>()),
    supabase.from("email_journey_enrolments").select("id", { count: "exact", head: true }).eq("journey_id", id).eq("status", "active"),
  ]);
  // The stages any country's pipeline has, and the three that close an application anywhere.
  const stageKeys = new Set<string>(["rejected", "declined", "withdrawn"]);
  for (const d of destinations ?? []) for (const k of (Array.isArray(d.pipeline_stages) ? d.pipeline_stages : []) as string[]) stageKeys.add(k);
  const stages = [...stageKeys].sort().map((k) => ({ key: k, label: applicationStageLabel(k) }));
  const st = STATUS[j.status as keyof typeof STATUS] ?? STATUS.draft;

  return (
    <div className="w-full">
      <Link prefetch={false} href="/marketing/email/automations" className="mb-2 inline-block text-xs text-primary hover:underline">
        ← All automations
      </Link>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-ink">{j.name as string}</h2>
        <span data-journey-status={j.status as string}>
          <Badge tone={st.tone}>{st.label}</Badge>
        </span>
      </div>
      <p className="mb-3 text-xs text-muted">
        {TRIGGERS[trigger].label}
        {j.activated_at ? ` · on since ${karachiTime(j.activated_at as string)}` : ""} · {(activeCount ?? 0).toLocaleString("en-US")} on their way now
      </p>
      <EmailTabs active="automations" />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <JourneyEditor
            journey={{
              id,
              name: j.name as string,
              trigger,
              status: j.status as string,
              topic: (j.topic as string | null) ?? null,
              stages: ((j.trigger_config as { stages?: string[] } | null)?.stages ?? []) as string[],
            }}
            steps={(steps ?? []).map((s) => ({
              day: s.day as number,
              condition: s.condition as StepCondition,
              subject: s.subject as string,
              preheader: (s.preheader as string | null) ?? null,
              template_version_id: (s.template_version_id as string | null) ?? null,
            }))}
            templates={(templates ?? []).map((t) => ({ versionId: t.current_version_id as string, name: t.name as string }))}
            stages={stages}
            topics={topics}
            canEdit={canCreate}
          />
        </Card>
        <div className="flex flex-col gap-6">
          <Card>
            <h3 className="mb-2 text-sm font-medium text-ink">Switch</h3>
            <p className="mb-3 text-[11px] text-muted">
              Switched on, it checks every ten minutes for anyone new it starts for, and sends each email as it falls due. With no sending service
              connected, its emails go as practice — nobody is emailed.
            </p>
            <JourneyControls journeyId={id} status={j.status as string} canSend={canSend} canDelete={canCreate} />
          </Card>
          {canReports && stepCampaigns.length > 0 && (
            <Card>
              <h3 className="mb-2 text-sm font-medium text-ink">How each email is doing</h3>
              <table className="w-full text-left text-xs" data-journey-steps-stats>
                <thead className="text-muted">
                  <tr>
                    <th className="py-1 pr-2 font-medium">Email</th>
                    <th className="py-1 pr-2 text-right font-medium">Sent</th>
                    <th className="py-1 pr-2 text-right font-medium">Opened</th>
                    <th className="py-1 text-right font-medium">Clicked</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(steps ?? []).map((s) => {
                    const x = s.campaign_id ? stats.get(s.campaign_id as string) : undefined;
                    const base = x ? x.delivered || x.sent : 0;
                    const when = `${s.position as number}. ${stepWhen(s.day as number, trigger)}`;
                    return (
                      <tr key={s.position as number}>
                        <td className="py-1.5 pr-2">
                          {s.campaign_id ? (
                            <Link prefetch={false} href={`/marketing/email/campaigns/${s.campaign_id}/report`} className="text-primary hover:underline">
                              {when}
                            </Link>
                          ) : (
                            when
                          )}
                          {s.condition !== "always" && <p className="text-muted">{STEP_CONDITIONS[s.condition as StepCondition]}</p>}
                        </td>
                        <td className="py-1.5 pr-2 text-right text-ink">{x ? x.sent.toLocaleString("en-US") : "—"}</td>
                        <td className="py-1.5 pr-2 text-right text-ink">{x ? pct(x.opened_human, base) : "—"}</td>
                        <td className="py-1.5 text-right text-ink">{x ? pct(x.clicked_human, base) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      </div>

      <Card className="mt-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Who is on it</h3>
        {!(enrolments ?? []).length ? (
          <p className="text-xs text-muted">Nobody yet.</p>
        ) : (
          <table className="w-full text-left text-xs" data-journey-enrolments>
            <thead className="text-muted">
              <tr>
                <th className="py-1 pr-3 font-medium">Lead</th>
                <th className="py-1 pr-3 font-medium">Joined</th>
                <th className="py-1 pr-3 font-medium">{TRIGGERS[trigger].countdown ? "Appointment" : "Started"}</th>
                <th className="py-1 pr-3 font-medium">Where they are</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(enrolments ?? []).map((e) => (
                <tr key={e.id as string}>
                  <td className="py-1.5 pr-3">
                    <Link prefetch={false} href={`/leads/${e.lead_id}`} className="text-ink hover:text-primary">
                      {(one(e.lead as never) as { full_name?: string } | null)?.full_name ?? "A lead"}
                    </Link>
                  </td>
                  <td className="py-1.5 pr-3 text-muted">{karachiTime(e.enrolled_at as string)}</td>
                  <td className="py-1.5 pr-3 text-muted">{karachiTime(e.anchor_at as string)}</td>
                  <td className="py-1.5 pr-3 text-ink">
                    {ENROL[e.status as keyof typeof ENROL] ?? (e.status as string)}
                    {e.status === "active" ? ` — next: email ${e.next_position as number}` : ""}
                    {e.exit_reason && <p className="text-muted">{e.exit_reason as string}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
