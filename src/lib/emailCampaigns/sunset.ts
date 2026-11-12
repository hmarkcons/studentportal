import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_SKIPPED_LEAD_STATUSES } from "./audience";
import { campaignSlug } from "./render";
import { karachiDay } from "./sendingRules";
import { sunsetSuppressDue } from "./engagement";
import { startCampaign } from "./sender";
import { logEmailActivity } from "./activity";

// The sunset policy (Phase 6, 0362): people emailed for months who never open
// are sent one re-engagement email, and — still silent once a grace period
// has passed — are no longer emailed. In "confirm" mode a person presses the
// button for each step (Audience › Sunset); in "automatic" mode the daily run
// does both. Only REAL campaigns count: nobody is judged silent on a practice
// send, and a practice re-engagement suppresses no one.

export type SunsetSettings = { mode: "confirm" | "automatic"; months: number; graceDays: number; templateId: string | null; subject: string };

export async function readSunsetSettings(client: SupabaseClient): Promise<SunsetSettings> {
  const { data } = await client.from("email_settings").select("sunset_mode, sunset_months, sunset_grace_days, sunset_template_id, sunset_subject").eq("id", true).maybeSingle();
  return {
    mode: data?.sunset_mode === "automatic" ? "automatic" : "confirm",
    months: Number(data?.sunset_months ?? 6),
    graceDays: Number(data?.sunset_grace_days ?? 30),
    templateId: (data?.sunset_template_id as string | null) ?? null,
    subject: (data?.sunset_subject as string) || "Do you still want to hear from HMARK?",
  };
}

export type SunsetCandidate = { email: string; lead_id: string | null; contact_id: string | null; received: number; last_engaged_at: string | null };

/** Everyone gone silent, a thousand at a time (service role). */
export async function sunsetCandidates(admin: SupabaseClient, months: number): Promise<SunsetCandidate[]> {
  const out: SunsetCandidate[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.rpc("email_sunset_candidates", { p_months: months }).order("email").range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as SunsetCandidate[]));
    if (!data || data.length < 1000) return out;
  }
}

export type SunsetRun = { id: string; mode: string; list_id: string | null; campaign_id: string | null; people: number; status: string; suppressed: number; note: string | null; created_at: string };

/**
 * Step one: a list of everyone gone silent and a re-engagement campaign to
 * it — a draft to check and send (confirm), or sent at once (automatic, which
 * needs the template chosen in Settings).
 */
export async function startSunsetRun(admin: SupabaseClient, { by, settings }: { by: string | null; settings: SunsetSettings }): Promise<{ runId: string; campaignId: string; people: number } | { error: string }> {
  const { data: open } = await admin.from("email_sunset_runs").select("id").eq("status", "waiting").limit(1);
  if (open?.length) return { error: "A re-engagement is already under way — finish it first." };
  const people = await sunsetCandidates(admin, settings.months);
  if (!people.length) return { error: `Nobody has gone silent: no one sent real campaigns for over ${settings.months} months has stopped opening them.` };
  if (settings.mode === "automatic" && !settings.templateId) return { error: "Choose the re-engagement email in Settings first." };

  const day = karachiDay();
  const { data: list, error: listError } = await admin
    .from("email_lists")
    .insert({ name: `Re-engagement ${day}`, description: `Silent for ${settings.months} months: no opens or clicks (sunset policy).`, created_by: by })
    .select("id")
    .single();
  if (listError) return { error: listError.message };
  for (let i = 0; i < people.length; i += 500) {
    const rows = people.slice(i, i + 500).map((p) => ({ list_id: list.id, lead_id: p.lead_id ?? null, contact_id: p.lead_id ? null : p.contact_id, added_by: by }));
    const { error } = await admin.from("email_list_members").insert(rows);
    if (error) return { error: `The list was made, but not everyone was added: ${error.message}` };
  }

  const [{ data: sender }, { data: template }] = await Promise.all([
    admin.from("email_settings").select("from_name, from_email, reply_to").eq("id", true).maybeSingle(),
    settings.templateId ? admin.from("email_templates").select("current_version_id").eq("id", settings.templateId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const name = `Re-engagement ${day}`;
  const { data: campaign, error: campaignError } = await admin
    .from("email_campaigns")
    .insert({
      name,
      slug: campaignSlug(name),
      subject: settings.subject,
      from_name: sender?.from_name ?? null,
      from_email: sender?.from_email ?? null,
      reply_to: sender?.reply_to ?? null,
      template_version_id: (template?.current_version_id as string | null) ?? null,
      audience: { include: { all: false, segments: [], lists: [list.id] }, exclude: { segments: [], lists: [] }, skipLeadStatuses: DEFAULT_SKIPPED_LEAD_STATUSES },
      created_by: by,
    })
    .select("id")
    .single();
  if (campaignError) return { error: campaignError.message };
  const { data: run, error: runError } = await admin
    .from("email_sunset_runs")
    .insert({ mode: settings.mode, list_id: list.id, campaign_id: campaign.id, people: people.length, created_by: by })
    .select("id")
    .single();
  if (runError) return { error: runError.message };

  if (settings.mode === "automatic") {
    if (!template?.current_version_id) return { error: "The re-engagement template has no version to send." };
    await admin.from("email_campaigns").update({ status: "sending", approved_at: new Date().toISOString(), scheduled_at: new Date().toISOString() }).eq("id", campaign.id);
    const started = await startCampaign(admin, campaign.id as string);
    if ("error" in started) return started;
  }
  await logEmailActivity("sunset_campaign", { campaignId: campaign.id as string, staffId: by, summary: `${people.length} people silent for ${settings.months} months (${settings.mode})` });
  return { runId: run.id as string, campaignId: campaign.id as string, people: people.length };
}

/**
 * Who is still silent after the re-engagement email: got it, did not open or
 * click it, and has engaged with nothing since it went — still subscribed.
 */
export async function stillSilent(admin: SupabaseClient, campaignId: string): Promise<string[]> {
  const { data: c } = await admin.from("email_campaigns").select("started_at").eq("id", campaignId).maybeSingle();
  if (!c?.started_at) return [];
  const quiet: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await admin
      .from("email_campaign_recipients")
      .select("email")
      .eq("campaign_id", campaignId)
      .eq("status", "sent")
      .eq("human_open_count", 0)
      .eq("human_click_count", 0)
      .order("id")
      .range(from, from + 999);
    quiet.push(...(data ?? []).map((r) => r.email as string));
    if (!data || data.length < 1000) break;
  }
  const out: string[] = [];
  for (let i = 0; i < quiet.length; i += 200) {
    const { data } = await admin.from("email_contact_status").select("email, status, last_engaged_at").in("email", quiet.slice(i, i + 200));
    for (const s of data ?? []) {
      if (s.status !== "subscribed") continue;
      if (s.last_engaged_at && Date.parse(s.last_engaged_at as string) >= Date.parse(c.started_at as string)) continue;
      out.push(s.email as string);
    }
  }
  return out;
}

/** Step two: those still silent are no longer emailed (put on the do-not-email list, with why). */
export async function suppressSunsetRun(admin: SupabaseClient, runId: string, { by, graceDays, now = new Date() }: { by: string | null; graceDays: number; now?: Date }): Promise<{ suppressed: number } | { error: string }> {
  const { data: run } = await admin.from("email_sunset_runs").select("id, status, campaign_id").eq("id", runId).maybeSingle();
  if (!run || run.status !== "waiting") return { error: "That re-engagement is no longer waiting." };
  if (!run.campaign_id) return { error: "Its campaign has been deleted." };
  const { data: c } = await admin.from("email_campaigns").select("status, practice, finished_at").eq("id", run.campaign_id).maybeSingle();
  if (!c || c.status !== "sent") return { error: "Send the re-engagement email first, and let it finish." };
  if (c.practice) {
    // A practice send reached nobody: no one can be judged silent on it.
    await admin.from("email_sunset_runs").update({ status: "closed", note: "A practice send — nobody was emailed, so nobody was stopped.", closed_at: now.toISOString() }).eq("id", runId);
    return { suppressed: 0 };
  }
  const due = sunsetSuppressDue({ finishedAt: c.finished_at as string | null, graceDays, now });
  if (!due.due) return { error: `Give people until ${due.on ? karachiDay(due.on) : "the grace period ends"} to open it.` };
  const silent = await stillSilent(admin, run.campaign_id as string);
  const reason = "No opens or clicks for months, nor after a re-engagement email (sunset policy).";
  let suppressed = 0;
  for (let i = 0; i < silent.length; i += 200) {
    const { data } = await admin
      .from("email_contact_status")
      .update({ status: "suppressed", status_reason: reason, status_changed_at: now.toISOString() })
      .in("email", silent.slice(i, i + 200))
      .eq("status", "subscribed")
      .select("email");
    suppressed += data?.length ?? 0;
  }
  await admin.from("email_sunset_runs").update({ status: "suppressed", suppressed, closed_at: now.toISOString() }).eq("id", runId);
  await logEmailActivity("sunset_suppressed", { campaignId: run.campaign_id as string, staffId: by, summary: `${suppressed} people no longer emailed` });
  return { suppressed };
}

/** The daily run, in automatic mode only: suppress whoever is due, then start a new round if there is anyone to ask. */
export async function runSunsetDaily(admin: SupabaseClient): Promise<{ mode: string; suppressed: number; started: number; note: string }> {
  const settings = await readSunsetSettings(admin);
  if (settings.mode !== "automatic") return { mode: settings.mode, suppressed: 0, started: 0, note: "confirm mode: staff take each step" };
  let suppressed = 0;
  const { data: waiting } = await admin.from("email_sunset_runs").select("id, campaign_id").eq("status", "waiting");
  for (const run of waiting ?? []) {
    const r = await suppressSunsetRun(admin, run.id as string, { by: null, graceDays: settings.graceDays });
    if ("suppressed" in r) suppressed += r.suppressed;
  }
  const { data: still } = await admin.from("email_sunset_runs").select("id").eq("status", "waiting").limit(1);
  if (still?.length) return { mode: "automatic", suppressed, started: 0, note: "a re-engagement is under way" };
  const started = await startSunsetRun(admin, { by: null, settings });
  return { mode: "automatic", suppressed, started: "people" in started ? started.people : 0, note: "error" in started ? started.error : "re-engagement sent" };
}
