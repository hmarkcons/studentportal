import type { SupabaseClient } from "@supabase/supabase-js";
import { getSiteUrl } from "@/lib/siteUrl";
import { loadAudience } from "./audienceLoad";
import { DEFAULT_SKIPPED_LEAD_STATUSES, resolveAudience, validateRuleSet, type AudienceContact, type AudienceCounts, type RuleSet } from "./audience";
import { contactMergeValues, renderMergeTags, type MergeValues } from "./mergeTags";
import { prepareCampaignHtml, renderForRecipient } from "./render";
import { getCampaignProvider, type EmailProvider } from "./providers";
import { autoPause, karachiDay, MAX_ATTEMPTS, retryDelayMs, runBudget, warmupCap } from "./sendingRules";
import { htmlToText } from "./templateHtml";

// The sending engine. A campaign is started (its audience frozen into
// recipients, its email prepared) when it is sent or its scheduled time
// comes; then the email-send cron sends the queue a batch a minute at the
// configured speed. Every claim is conditional on the row's status, so two
// runs never take the same recipient; a recipient claimed and never confirmed
// is failed, not sent again — no one gets a campaign twice.
//
// With no sending service connected, a campaign is sent in PRACTICE: the
// "sending" below goes to a stand-in that hands back a made-up id, and no
// email leaves the portal.

export type CampaignAudience = {
  include: { all: boolean; segments: string[]; lists: string[] };
  exclude: { segments: string[]; lists: string[] };
  skipLeadStatuses: string[];
};

const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** A campaign's stored audience, read safely. */
export function parseCampaignAudience(raw: unknown): CampaignAudience {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, Record<string, unknown> | unknown>;
  const inc = (o.include ?? {}) as Record<string, unknown>;
  const exc = (o.exclude ?? {}) as Record<string, unknown>;
  return {
    include: { all: inc.all === true, segments: ids(inc.segments), lists: ids(inc.lists) },
    exclude: { segments: ids(exc.segments), lists: ids(exc.lists) },
    skipLeadStatuses: Array.isArray(o.skipLeadStatuses) ? ids(o.skipLeadStatuses) : DEFAULT_SKIPPED_LEAD_STATUSES,
  };
}

async function segmentRules(admin: SupabaseClient, segmentIds: string[]): Promise<RuleSet[]> {
  if (!segmentIds.length) return [];
  const { data } = await admin.from("email_segments").select("id, rules").in("id", segmentIds);
  return (data ?? []).map((s) => validateRuleSet(s.rules)).filter((r): r is RuleSet => !("error" in r));
}

/** Who a campaign's audience is now, and how many fell out and why. */
export async function resolveCampaignAudience(
  admin: SupabaseClient,
  audience: CampaignAudience,
  topic: string | null
): Promise<{ recipients: AudienceContact[]; counts: AudienceCounts }> {
  const [{ contacts, statuses }, incSegs, excSegs] = await Promise.all([
    loadAudience(admin),
    segmentRules(admin, audience.include.segments),
    segmentRules(admin, audience.exclude.segments),
  ]);
  return resolveAudience({
    contacts,
    include: { all: audience.include.all, segments: incSegs, lists: audience.include.lists },
    exclude: { segments: excSegs, lists: audience.exclude.lists },
    statuses,
    topic,
    skipLeadStatuses: audience.skipLeadStatuses,
  });
}

type SettingsRow = {
  provider: string;
  from_name: string;
  from_email: string | null;
  reply_to: string | null;
  send_per_second: number;
  send_per_hour: number;
  warmup_enabled: boolean;
  warmup_start_cap: number;
  warmup_growth_pct: number;
  warmup_started_on: string | null;
};

async function readSettings(admin: SupabaseClient): Promise<SettingsRow> {
  const { data } = await admin
    .from("email_settings")
    .select("provider, from_name, from_email, reply_to, send_per_second, send_per_hour, warmup_enabled, warmup_start_cap, warmup_growth_pct, warmup_started_on")
    .eq("id", true)
    .single();
  return { ...(data as SettingsRow), send_per_second: Number(data?.send_per_second ?? 10) };
}

/** The stand-in for a sending service, in practice: nothing is sent. */
export const PRACTICE_SENDER: Pick<EmailProvider, "sendOne"> & { label: string } = {
  label: "Practice (nothing sent)",
  async sendOne() {
    return { providerMessageId: `practice-${crypto.randomUUID()}` };
  },
};

/** Whether the portal can really send now: a service chosen and connected. */
export async function canReallySend(admin: SupabaseClient): Promise<boolean> {
  return Boolean(getCampaignProvider((await readSettings(admin)).provider));
}

/**
 * Freezes a campaign's audience into its recipients and prepares its email.
 * The caller has already moved it to "sending", so only one caller ever gets here.
 */
export async function startCampaign(admin: SupabaseClient, campaignId: string): Promise<{ recipients: number } | { error: string }> {
  const { data: c } = await admin
    .from("email_campaigns")
    .select("id, status, topic, audience, template_version_id, track_opens, track_clicks, preheader, recipients_total")
    .eq("id", campaignId)
    .single();
  if (!c || c.status !== "sending") return { error: "The campaign is not starting." };
  if ((c.recipients_total as number) > 0) return { recipients: c.recipients_total as number };
  const fail = async (why: string) => {
    await admin.from("email_campaigns").update({ status: "failed", paused_reason: why, finished_at: new Date().toISOString() }).eq("id", campaignId);
    return { error: why };
  };
  const { data: version } = await admin.from("email_template_versions").select("html, text_body").eq("id", c.template_version_id).single();
  if (!version) return fail("Its template version could not be read.");

  const settings = await readSettings(admin);
  const practice = !getCampaignProvider(settings.provider);
  const { recipients, counts } = await resolveCampaignAudience(admin, parseCampaignAudience(c.audience), (c.topic as string | null) ?? null);
  if (!recipients.length) return fail("No one to send to: the audience is empty once the do-not-email list and the other rules are applied.");

  const prepared = prepareCampaignHtml(version.html as string, {
    trackClicks: c.track_clicks as boolean,
    trackOpens: c.track_opens as boolean,
    preheader: c.preheader as string | null,
  });
  const text = (version.text_body as string) || htmlToText(version.html as string);
  if (prepared.links.length) {
    const { error } = await admin.from("email_campaign_links").insert(prepared.links.map((l) => ({ campaign_id: campaignId, ...l })));
    if (error) return fail(`Its links could not be saved: ${error.message}`);
  }

  const { data: staff } = await admin.from("staff").select("id, full_name");
  const counsellor = new Map((staff ?? []).map((s) => [s.id as string, s.full_name as string]));

  // Every address needs its row for its preference and unsubscribe links; a lead's consent is their enquiry.
  for (let i = 0; i < recipients.length; i += 1000) {
    const chunk = recipients.slice(i, i + 1000);
    await admin.from("email_contact_status").upsert(
      chunk.map((r) => ({ email: r.email!, consent_source: r.kind === "lead" ? "Enquiry (they contacted HMARK)" : null, consent_at: r.enquiredAt ?? null })),
      { onConflict: "email", ignoreDuplicates: true }
    );
    const { error } = await admin.from("email_campaign_recipients").insert(
      chunk.map((r) => ({
        campaign_id: campaignId,
        lead_id: r.kind === "lead" ? r.id : null,
        contact_id: r.kind === "contact" ? r.id : null,
        email: r.email!,
        merge_values: contactMergeValues(
          { full_name: r.fullName, email: r.email, country_of_interest: r.country, intake: r.intake },
          r.counsellorId ? (counsellor.get(r.counsellorId) ?? null) : null
        ),
      }))
    );
    if (error) return fail(`The recipients could not be saved: ${error.message}`);
  }

  await admin
    .from("email_campaigns")
    .update({
      prepared_html: prepared.html,
      prepared_text: text,
      practice,
      recipients_total: recipients.length,
      audience_counts: counts,
      started_at: new Date().toISOString(),
    })
    .eq("id", campaignId);
  return { recipients: recipients.length };
}

/** Super Admins, for an alert that a campaign stopped itself or waits for approval. */
export async function superAdminIds(admin: SupabaseClient): Promise<string[]> {
  const { data } = await admin.from("staff").select("id").contains("roles", ["super_admin"]).eq("status", "active");
  return (data ?? []).map((s) => s.id as string);
}

export async function notify(admin: SupabaseClient, userIds: (string | null | undefined)[], n: { kind: string; title: string; body: string; link: string }) {
  const to = [...new Set(userIds.filter((u): u is string => Boolean(u)))];
  if (to.length) await admin.from("notifications").insert(to.map((user_id) => ({ user_id, ...n })));
}

export type RunSummary = { started: number; sent: number; retried: number; failed: number; finished: number; paused: number; budget: number };

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One run of the sending queue: start what is due, send what the budget allows, finish or pause. */
export async function sendDueEmails(admin: SupabaseClient, { deadline }: { deadline: number }): Promise<RunSummary> {
  const site = getSiteUrl();
  const summary: RunSummary = { started: 0, sent: 0, retried: 0, failed: 0, finished: 0, paused: 0, budget: 0 };
  const now = new Date();

  // 1. Scheduled campaigns whose time has come.
  const { data: due } = await admin.from("email_campaigns").select("id").eq("status", "scheduled").lte("scheduled_at", now.toISOString()).limit(5);
  for (const d of due ?? []) {
    const { data: claimed } = await admin.from("email_campaigns").update({ status: "sending" }).eq("id", d.id).eq("status", "scheduled").select("id");
    if (!claimed?.length) continue;
    const r = await startCampaign(admin, d.id as string);
    if (!("error" in r)) summary.started += 1;
  }

  // 2. A recipient claimed by a run that never came back is failed, never retried: it may have gone.
  await admin
    .from("email_campaign_recipients")
    .update({ status: "failed", last_error: "Interrupted while sending. Not tried again, so it can never arrive twice." })
    .eq("status", "sending")
    .lt("claimed_at", new Date(now.getTime() - 10 * 60_000).toISOString());

  // 3. How many this run may send.
  const settings = await readSettings(admin);
  const dayStart = new Date(`${karachiDay(now)}T00:00:00+05:00`).toISOString();
  const [{ count: lastHour }, { count: today }] = await Promise.all([
    admin.from("email_campaign_recipients").select("id", { count: "exact", head: true }).gte("sent_at", new Date(now.getTime() - 3_600_000).toISOString()),
    admin.from("email_campaign_recipients").select("id", { count: "exact", head: true }).gte("sent_at", dayStart),
  ]);
  let budget = runBudget({
    perSecond: settings.send_per_second,
    perHour: settings.send_per_hour,
    sentLastHour: lastHour ?? 0,
    dailyCap: warmupCap(
      { enabled: settings.warmup_enabled, startCap: settings.warmup_start_cap, growthPct: settings.warmup_growth_pct, startedOn: settings.warmup_started_on },
      karachiDay(now)
    ),
    sentToday: today ?? 0,
  });
  summary.budget = budget;

  // 4. Send, campaign by campaign, oldest first.
  const provider = getCampaignProvider(settings.provider);
  const { data: sending } = await admin
    .from("email_campaigns")
    .select("id, name, slug, practice, prepared_html, prepared_text, from_name, from_email, reply_to, subject, created_by")
    .eq("status", "sending")
    .order("started_at", { ascending: true });

  for (const c of sending ?? []) {
    if (!c.prepared_html) continue; // still being started
    if (!c.practice && !provider) {
      await admin.from("email_campaigns").update({ status: "paused", paused_reason: "The sending service is no longer connected. Connect it in Settings, then resume." }).eq("id", c.id);
      summary.paused += 1;
      continue;
    }
    const sender = c.practice ? PRACTICE_SENDER : provider!;
    const fromName = (c.from_name as string) || settings.from_name;
    const fromEmail = (c.from_email as string) || settings.from_email;
    const from = fromEmail ? `${fromName} <${fromEmail}>` : fromName;

    while (budget > 0 && Date.now() < deadline) {
      const nowIso = new Date().toISOString();
      const { data: queued } = await admin
        .from("email_campaign_recipients")
        .select("id")
        .eq("campaign_id", c.id)
        .eq("status", "queued")
        .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
        .limit(Math.min(budget, 100));
      if (!queued?.length) break;
      const { data: claimed } = await admin
        .from("email_campaign_recipients")
        .update({ status: "sending", claimed_at: nowIso })
        .in("id", queued.map((q) => q.id as string))
        .eq("status", "queued")
        .select("id, email, token, merge_values, attempts");
      if (!claimed?.length) continue;
      const { data: tokens } = await admin.from("email_contact_status").select("email, token").in("email", claimed.map((r) => r.email as string));
      const addressToken = new Map((tokens ?? []).map((t) => [t.email as string, t.token as string]));
      const events: Record<string, unknown>[] = [];
      const done = new Set<string>();

      for (const r of claimed) {
        if (Date.now() > deadline || budget <= 0) break;
        const values = (r.merge_values ?? {}) as MergeValues;
        const rendered = renderForRecipient({
          preparedHtml: c.prepared_html as string,
          text: (c.prepared_text as string) ?? "",
          values,
          links: { site, recipientToken: r.token as string, addressToken: addressToken.get(r.email as string) ?? "" },
          campaignId: c.id as string,
          recipientId: r.id as string,
        });
        const started = Date.now();
        try {
          const { providerMessageId } = await sender.sendOne({
            to: r.email as string,
            from,
            replyTo: (c.reply_to as string) || settings.reply_to,
            subject: renderMergeTags((c.subject as string) ?? "", values, { html: false }),
            html: rendered.html,
            text: rendered.text,
            headers: rendered.headers,
          });
          const at = new Date().toISOString();
          await admin
            .from("email_campaign_recipients")
            .update({ status: "sent", sent_at: at, provider_message_id: providerMessageId, attempts: (r.attempts as number) + 1, last_error: null })
            .eq("id", r.id);
          events.push({ campaign_id: c.id, recipient_id: r.id, type: "sent", occurred_at: at, diagnostic: null, meta: c.practice ? { practice: true } : {} });
          summary.sent += 1;
          budget -= 1;
        } catch (e) {
          const attempts = (r.attempts as number) + 1;
          const message = e instanceof Error ? e.message : "Not sent";
          const permanent = Boolean((e as { permanent?: boolean })?.permanent);
          if (permanent || attempts >= MAX_ATTEMPTS) {
            await admin.from("email_campaign_recipients").update({ status: "failed", attempts, last_error: message.slice(0, 500) }).eq("id", r.id);
            events.push({ campaign_id: c.id, recipient_id: r.id, type: "failed", occurred_at: new Date().toISOString(), diagnostic: message.slice(0, 500), meta: c.practice ? { practice: true } : {} });
            summary.failed += 1;
          } else {
            await admin
              .from("email_campaign_recipients")
              .update({ status: "queued", attempts, last_error: message.slice(0, 500), next_attempt_at: new Date(Date.now() + retryDelayMs(attempts)).toISOString() })
              .eq("id", r.id);
            summary.retried += 1;
          }
        }
        done.add(r.id as string);
        // A real service is paced to the configured speed; practice need not be.
        if (!c.practice) {
          const wait = 1000 / settings.send_per_second - (Date.now() - started);
          if (wait > 0) await delay(wait);
        }
      }
      // Whatever this run claimed and did not reach goes back on the queue untouched.
      const untouched = claimed.map((r) => r.id as string).filter((id) => !done.has(id));
      if (untouched.length) await admin.from("email_campaign_recipients").update({ status: "queued", claimed_at: null }).in("id", untouched).eq("status", "sending");
      // Every row carries the same keys: a batch's missing key is sent as null, not its default.
      if (events.length) {
        const { error } = await admin.from("email_events").insert(events);
        if (error) console.error("email-send: events not recorded", error.message);
      }
    }

    // 5. Finished, or stopping itself.
    const { count: left } = await admin
      .from("email_campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", c.id)
      .in("status", ["queued", "sending"]);
    if ((left ?? 0) === 0) {
      await admin.from("email_campaigns").update({ status: "sent", finished_at: new Date().toISOString() }).eq("id", c.id).eq("status", "sending");
      await notify(admin, [c.created_by as string], {
        kind: "email_campaign_sent",
        title: c.practice ? `Practice send finished: ${c.name}` : `Campaign sent: ${c.name}`,
        body: c.practice ? "Nothing left the portal — it was a practice run." : "Every email has gone. Its report fills in as people open and click.",
        link: `/marketing/email/campaigns/${c.id}`,
      });
      summary.finished += 1;
    } else {
      const [{ count: sent }, { count: bounced }, { count: complained }] = await Promise.all([
        admin.from("email_campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).eq("status", "sent"),
        admin.from("email_campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).not("bounce", "is", null),
        admin.from("email_campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).not("complained_at", "is", null),
      ]);
      const reason = autoPause({ sent: sent ?? 0, bounced: bounced ?? 0, complained: complained ?? 0 });
      if (reason) {
        await admin.from("email_campaigns").update({ status: "paused", paused_reason: reason }).eq("id", c.id).eq("status", "sending");
        await notify(admin, [...(await superAdminIds(admin)), c.created_by as string], {
          kind: "email_campaign_paused",
          title: `Campaign paused: ${c.name}`,
          body: reason,
          link: `/marketing/email/campaigns/${c.id}`,
        });
        summary.paused += 1;
      }
    }
    if (budget <= 0 || Date.now() >= deadline) break;
  }
  return summary;
}
