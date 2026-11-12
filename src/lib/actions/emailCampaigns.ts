"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { sendEmail } from "@/lib/email";
import { CONTACT_STATUS_LABELS, suppressedTotal, type AudienceCounts, type ContactStatus } from "@/lib/emailCampaigns/audience";
import { campaignProblems, confirmsSend, karachiInstant } from "@/lib/emailCampaigns/campaignRules";
import { abProblems } from "@/lib/emailCampaigns/abTest";
import { renderMergeTags } from "@/lib/emailCampaigns/mergeTags";
import { getCampaignProvider } from "@/lib/emailCampaigns/providers";
import { campaignSlug, prepareCampaignHtml } from "@/lib/emailCampaigns/render";
import { canReallySend, notify, parseCampaignAudience, resolveCampaignAudience, startCampaign, superAdminIds, type CampaignAudience } from "@/lib/emailCampaigns/sender";
import { previewValues, readEmailSettings, withContentBlocks } from "@/lib/emailCampaigns/server";
import { seedOf, simulateActivity } from "@/lib/emailCampaigns/simulate";
import { logEmailActivity } from "@/lib/emailCampaigns/activity";

const CAMPAIGNS = "/marketing/email/campaigns";
const CREATE_DENIED = "You don't have permission to create email campaigns.";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Fail = { error: string };
type Ok = { success: true; message?: string };

const revalidate = (id?: string) => {
  revalidatePath(CAMPAIGNS);
  if (id) revalidatePath(`${CAMPAIGNS}/${id}`);
};

async function myId(): Promise<string | null> {
  return (await getCurrentUser())?.id ?? null;
}

/** A new draft, with the sender from Settings. */
export async function createEmailCampaign(_prev: unknown, formData: FormData): Promise<({ success: true; campaignId: string }) | Fail> {
  const denied = await requirePermission("email.campaigns.create", CREATE_DENIED);
  if (denied) return denied;
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 120) return { error: "Give the campaign a name (at most 120 characters)." };
  const supabase = await createClient();
  const settings = await readEmailSettings(supabase);
  const { data, error } = await supabase
    .from("email_campaigns")
    .insert({
      name,
      slug: campaignSlug(name),
      from_name: settings.from_name,
      from_email: settings.from_email,
      reply_to: settings.reply_to,
      created_by: await myId(),
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidate();
  return { success: true, campaignId: data.id as string };
}

function readAudience(formData: FormData): CampaignAudience {
  const list = (name: string) => formData.getAll(name).map(String).filter(Boolean);
  return {
    include: { all: formData.get("include_all") === "on", segments: list("include_segments"), lists: list("include_lists") },
    exclude: { segments: list("exclude_segments"), lists: list("exclude_lists") },
    skipLeadStatuses: list("skip_status"),
    resendOf: /^[0-9a-f-]{36}$/.test(String(formData.get("resend_of") ?? "")) ? String(formData.get("resend_of")) : null,
  };
}

/** Saves a draft's fields. A campaign waiting for approval goes back to draft when changed. */
export async function saveEmailCampaign(campaignId: string, _prev: unknown, formData: FormData): Promise<Ok | Fail> {
  const denied = await requirePermission("email.campaigns.create", CREATE_DENIED);
  if (denied) return denied;
  const supabase = await createClient();
  const { data: current } = await supabase.from("email_campaigns").select("status").eq("id", campaignId).maybeSingle();
  if (!current) return { error: "That campaign no longer exists." };
  if (!["draft", "pending_approval"].includes(current.status as string)) return { error: "Only a draft can be changed. Pause or cancel it first." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 120) return { error: "Give the campaign a name (at most 120 characters)." };
  const subject = String(formData.get("subject") ?? "").trim();
  if (subject.length > 200) return { error: "Keep the subject line to 200 characters." };
  const preheader = String(formData.get("preheader") ?? "").trim();
  if (preheader.length > 250) return { error: "Keep the preview text to 250 characters." };
  const from_name = String(formData.get("from_name") ?? "").trim();
  if (from_name.length > 80) return { error: "Keep the sender's name to 80 characters." };
  const from_email = String(formData.get("from_email") ?? "").trim().toLowerCase();
  if (from_email && !EMAIL_RE.test(from_email)) return { error: "The sender's address is not an email address." };
  const reply_to = String(formData.get("reply_to") ?? "").trim().toLowerCase();
  if (reply_to && !EMAIL_RE.test(reply_to)) return { error: "The reply-to address is not an email address." };
  const templateVersionId = String(formData.get("template_version_id") ?? "") || null;
  const topic = String(formData.get("topic") ?? "") || null;
  const ab_enabled = formData.get("ab_enabled") === "on";
  const ab_subject_b = String(formData.get("ab_subject_b") ?? "").trim() || null;
  if (ab_subject_b && ab_subject_b.length > 200) return { error: "Keep version B's subject to 200 characters." };
  const ab_preheader_b = String(formData.get("ab_preheader_b") ?? "").trim() || null;
  if (ab_preheader_b && ab_preheader_b.length > 250) return { error: "Keep version B's preview text to 250 characters." };
  const ab_template_version_id_b = String(formData.get("ab_template_version_id_b") ?? "") || null;
  const ab_test_percent = Number(formData.get("ab_test_percent") ?? 20);
  if (!Number.isInteger(ab_test_percent) || ab_test_percent < 10 || ab_test_percent > 50) return { error: "Test the versions on 10 to 50 per cent of the audience." };
  const ab_winner_by = formData.get("ab_winner_by") === "clicks" ? "clicks" : "opens";
  const ab_wait_hours = Number(formData.get("ab_wait_hours") ?? 4);
  if (!Number.isInteger(ab_wait_hours) || ab_wait_hours < 1 || ab_wait_hours > 48) return { error: "Wait a whole number of hours, 1 to 48, before picking the winner." };
  const spreadRaw = String(formData.get("spread_hours") ?? "").trim();
  const spread_hours = spreadRaw ? Number(spreadRaw) : null;
  if (spread_hours !== null && (!Number.isInteger(spread_hours) || spread_hours < 1 || spread_hours > 72)) {
    return { error: "Spread it over a whole number of hours, from 1 to 72 — or leave it blank to send as fast as Settings allows." };
  }

  const { data: saved, error } = await supabase
    .from("email_campaigns")
    .update({
      name,
      slug: campaignSlug(name),
      subject: subject || null,
      preheader: preheader || null,
      from_name: from_name || null,
      from_email: from_email || null,
      reply_to: reply_to || null,
      template_version_id: templateVersionId,
      topic,
      audience: readAudience(formData),
      track_opens: formData.get("track_opens") === "on",
      track_clicks: formData.get("track_clicks") === "on",
      add_utm: formData.get("add_utm") === "on",
      spread_hours,
      send_at_best_hour: formData.get("send_at_best_hour") === "on",
      ab_enabled,
      ab_subject_b,
      ab_preheader_b,
      ab_template_version_id_b,
      ab_test_percent,
      ab_winner_by,
      ab_wait_hours,
      ...(current.status === "pending_approval" ? { status: "draft", submitted_at: null, submitted_by: null } : {}),
    })
    .eq("id", campaignId)
    .select("id");
  if (error) return { error: error.message };
  if (!saved?.length) return { error: CREATE_DENIED };
  revalidate(campaignId);
  return { success: true, message: current.status === "pending_approval" ? "Saved — and back to draft, so it needs approving again." : "Saved." };
}

export type AudienceSummary = { counts: AudienceCounts; lines: string[] };

/** How many the chosen audience reaches now, and why the rest fall out. */
export async function previewEmailCampaignAudience(formData: FormData): Promise<AudienceSummary | Fail> {
  const denied = await requirePermission("page.marketing.email", "You don't have access to email campaigns.");
  if (denied) return denied;
  const audience = readAudience(formData);
  // A resend (Phase 6) has no segments or lists of its own: its people are the first campaign's non-openers.
  if (!audience.resendOf && !audience.include.all && !audience.include.segments.length && !audience.include.lists.length) {
    return { counts: { matched: 0, excluded: 0, invalid: 0, duplicates: 0, skippedLeadStatus: 0, suppressed: {}, topicOptOut: 0, final: 0 }, lines: ["Choose segments or lists to send to, or everyone."] };
  }
  const { counts } = await resolveCampaignAudience(createAdminClient(), audience, String(formData.get("topic") ?? "") || null);
  return { counts, lines: audienceLines(counts) };
}

function audienceLines(c: AudienceCounts): string[] {
  const lines = [`${c.matched.toLocaleString("en-US")} records match`];
  if (c.excluded) lines.push(`− ${c.excluded} excluded`);
  if (c.invalid) lines.push(`− ${c.invalid} with no usable address`);
  if (c.duplicates) lines.push(`− ${c.duplicates} with an address already counted`);
  if (c.skippedLeadStatus) lines.push(`− ${c.skippedLeadStatus} by lead status`);
  if (suppressedTotal(c)) {
    lines.push(
      `− ${suppressedTotal(c)} on the do-not-email list (${(Object.entries(c.suppressed) as [ContactStatus, number][])
        .map(([s, n]) => `${CONTACT_STATUS_LABELS[s].toLowerCase()} ${n}`)
        .join(", ")})`
    );
  }
  if (c.topicOptOut) lines.push(`− ${c.topicOptOut} opted out of this topic`);
  return lines;
}

async function readyToGo(campaignId: string): Promise<{ count: number; realSend: boolean; problems: string[]; campaign: Record<string, unknown> } | Fail> {
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("email_campaigns")
    .select("id, name, status, subject, from_name, from_email, template_version_id, audience, topic, created_by, ab_enabled, ab_subject_b, ab_template_version_id_b, spread_hours, send_at_best_hour")
    .eq("id", campaignId)
    .maybeSingle();
  if (!c) return { error: "That campaign no longer exists." };
  const admin = createAdminClient();
  const [realSend, { counts }] = await Promise.all([canReallySend(admin), resolveCampaignAudience(admin, parseCampaignAudience(c.audience), (c.topic as string) ?? null)]);
  const problems = [...campaignProblems(c as never, { realSend, audienceCount: counts.final }), ...abProblems(c as never, counts.final)];
  return { count: counts.final, realSend, problems, campaign: c };
}

/** Sends a draft (or an approved one) now: its audience is frozen at once and the queue starts within a minute. */
export async function sendEmailCampaignNow(campaignId: string, _prev: unknown, formData: FormData): Promise<Ok | Fail> {
  const denied = await requirePermission("email.campaigns.send", "You don't have permission to send campaigns. Send it for approval instead.");
  if (denied) return denied;
  const ready = await readyToGo(campaignId);
  if ("error" in ready) return ready;
  if (ready.campaign.status !== "draft") return { error: "Only a draft can be sent." };
  if (ready.problems.length) return { error: ready.problems.join(" ") };
  if (!confirmsSend(ready.count, String(formData.get("confirm") ?? ""))) {
    return { error: `This goes to ${ready.count.toLocaleString("en-US")} people. Type ${ready.count} (or SEND) in the box to confirm.` };
  }
  const admin = createAdminClient();
  const me = await myId();
  const { data: claimed } = await admin
    .from("email_campaigns")
    .update({ status: "sending", approved_by: me, approved_at: new Date().toISOString(), scheduled_at: new Date().toISOString() })
    .eq("id", campaignId)
    .eq("status", "draft")
    .select("id");
  if (!claimed?.length) return { error: "Someone else has just sent or changed it — reload the page." };
  const started = await startCampaign(admin, campaignId);
  revalidate(campaignId);
  if ("error" in started) return started;
  await logEmailActivity("campaign_sent", { campaignId, summary: `${ready.realSend ? "Sent" : "Practice send"} to ${started.recipients.toLocaleString("en-US")} people` });
  return {
    success: true,
    message: ready.realSend
      ? `Sending to ${started.recipients.toLocaleString("en-US")} people — the first emails go within a minute.`
      : `Practice send to ${started.recipients.toLocaleString("en-US")} people started — nothing leaves the portal until a sending service is connected.`,
  };
}

/** Schedules a draft for a time in Karachi; its audience is frozen when that time comes. */
export async function scheduleEmailCampaign(campaignId: string, _prev: unknown, formData: FormData): Promise<Ok | Fail> {
  const denied = await requirePermission("email.campaigns.send", "You don't have permission to schedule campaigns. Send it for approval instead.");
  if (denied) return denied;
  const at = karachiInstant(String(formData.get("scheduled_at") ?? ""));
  if (!at) return { error: "Choose the date and time to send it (Karachi time)." };
  if (at.getTime() < Date.now() + 60_000) return { error: "Choose a time in the future — or use Send now." };
  const ready = await readyToGo(campaignId);
  if ("error" in ready) return ready;
  if (ready.campaign.status !== "draft") return { error: "Only a draft can be scheduled." };
  if (ready.problems.length) return { error: ready.problems.join(" ") };
  if (!confirmsSend(ready.count, String(formData.get("confirm") ?? ""))) {
    return { error: `This goes to about ${ready.count.toLocaleString("en-US")} people. Type ${ready.count} (or SEND) in the box to confirm.` };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_campaigns")
    .update({ status: "scheduled", scheduled_at: at.toISOString(), approved_by: await myId(), approved_at: new Date().toISOString() })
    .eq("id", campaignId)
    .eq("status", "draft")
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "It was changed meanwhile — reload the page." };
  revalidate(campaignId);
  await logEmailActivity("campaign_scheduled", { campaignId, summary: `For ${at.toISOString()}` });
  return { success: true, message: `Scheduled for ${at.toLocaleString("en-GB", { timeZone: "Asia/Karachi", dateStyle: "medium", timeStyle: "short" })} (Karachi).` };
}

/** Sends a draft to the approvers, from someone who may create campaigns but not send them. */
export async function submitEmailCampaignForApproval(campaignId: string, _prev: unknown, formData: FormData): Promise<Ok | Fail> {
  const denied = await requirePermission("email.campaigns.create", CREATE_DENIED);
  if (denied) return denied;
  const ready = await readyToGo(campaignId);
  if ("error" in ready) return ready;
  if (ready.campaign.status !== "draft") return { error: "Only a draft can be sent for approval." };
  if (ready.problems.length) return { error: ready.problems.join(" ") };
  const requested = karachiInstant(String(formData.get("scheduled_at") ?? ""));
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_campaigns")
    .update({ status: "pending_approval", submitted_by: await myId(), submitted_at: new Date().toISOString(), scheduled_at: requested?.toISOString() ?? null, review_note: null })
    .eq("id", campaignId)
    .eq("status", "draft")
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "It was changed meanwhile — reload the page." };
  const admin = createAdminClient();
  await notify(admin, await superAdminIds(admin), {
    kind: "email_campaign_approval",
    title: `Campaign to approve: ${ready.campaign.name as string}`,
    body: `To ${ready.count.toLocaleString("en-US")} people. Open it to approve or send it back.`,
    link: `${CAMPAIGNS}/${campaignId}`,
  });
  revalidate(campaignId);
  await logEmailActivity("campaign_submitted", { campaignId, summary: `To ${ready.count.toLocaleString("en-US")} people` });
  return { success: true, message: "Sent for approval. The approvers have been told." };
}

/** Approves a campaign waiting for approval: it goes at the time asked for, or within a minute. */
export async function approveEmailCampaign(campaignId: string): Promise<Ok | Fail> {
  const denied = await requirePermission("email.campaigns.approve", "You don't have permission to approve campaigns.");
  if (denied) return denied;
  const admin = createAdminClient();
  const { data: c } = await admin.from("email_campaigns").select("name, scheduled_at, submitted_by, created_by").eq("id", campaignId).eq("status", "pending_approval").maybeSingle();
  if (!c) return { error: "It is no longer waiting for approval — reload the page." };
  const when = c.scheduled_at && new Date(c.scheduled_at as string).getTime() > Date.now() ? (c.scheduled_at as string) : new Date().toISOString();
  const { data } = await admin
    .from("email_campaigns")
    .update({ status: "scheduled", scheduled_at: when, approved_by: await myId(), approved_at: new Date().toISOString() })
    .eq("id", campaignId)
    .eq("status", "pending_approval")
    .select("id");
  if (!data?.length) return { error: "It is no longer waiting for approval — reload the page." };
  await notify(admin, [c.submitted_by as string, c.created_by as string], {
    kind: "email_campaign_approved",
    title: `Campaign approved: ${c.name as string}`,
    body: "It is scheduled and will go at its time.",
    link: `${CAMPAIGNS}/${campaignId}`,
  });
  revalidate(campaignId);
  await logEmailActivity("campaign_approved", { campaignId });
  return { success: true, message: "Approved and scheduled." };
}

/** Sends a campaign back to its author with a note. */
export async function rejectEmailCampaign(campaignId: string, note: string): Promise<Ok | Fail> {
  const denied = await requirePermission("email.campaigns.approve", "You don't have permission to review campaigns.");
  if (denied) return denied;
  const text = note.trim();
  if (!text) return { error: "Say what needs changing." };
  const admin = createAdminClient();
  const { data: c } = await admin.from("email_campaigns").select("name, submitted_by, created_by").eq("id", campaignId).eq("status", "pending_approval").maybeSingle();
  if (!c) return { error: "It is no longer waiting for approval — reload the page." };
  await admin.from("email_campaigns").update({ status: "draft", review_note: text.slice(0, 1000) }).eq("id", campaignId).eq("status", "pending_approval");
  await notify(admin, [c.submitted_by as string, c.created_by as string], {
    kind: "email_campaign_rejected",
    title: `Campaign sent back: ${c.name as string}`,
    body: text.slice(0, 300),
    link: `${CAMPAIGNS}/${campaignId}`,
  });
  revalidate(campaignId);
  await logEmailActivity("campaign_sent_back", { campaignId, summary: text.slice(0, 300) });
  return { success: true, message: "Sent back to its author." };
}

/** Pause, resume, cancel, or take a scheduled one back to draft. */
export async function changeEmailCampaignState(campaignId: string, to: "paused" | "sending" | "cancelled" | "draft"): Promise<Ok | Fail> {
  const denied = await requirePermission("email.campaigns.send", "You don't have permission to pause, resume or cancel campaigns.");
  if (denied) return denied;
  const admin = createAdminClient();
  const allowedFrom: Record<typeof to, string[]> = {
    paused: ["sending"],
    sending: ["paused"],
    cancelled: ["sending", "paused", "scheduled"],
    draft: ["scheduled"],
  };
  const { data } = await admin
    .from("email_campaigns")
    .update({
      status: to,
      ...(to === "sending" ? { paused_reason: null } : {}),
      ...(to === "paused" ? { paused_reason: "Paused by staff." } : {}),
      ...(to === "cancelled" ? { finished_at: new Date().toISOString() } : {}),
      ...(to === "draft" ? { scheduled_at: null, approved_by: null, approved_at: null } : {}),
    })
    .eq("id", campaignId)
    .in("status", allowedFrom[to])
    .select("id");
  if (!data?.length) return { error: "It can't be changed that way now — reload the page." };
  if (to === "cancelled") {
    await admin.from("email_campaign_recipients").update({ status: "skipped", last_error: "Campaign cancelled" }).eq("campaign_id", campaignId).eq("status", "queued");
  }
  revalidate(campaignId);
  await logEmailActivity(({ paused: "campaign_paused", sending: "campaign_resumed", cancelled: "campaign_cancelled", draft: "campaign_unscheduled" } as const)[to], { campaignId });
  return { success: true, message: { paused: "Paused.", sending: "Resumed.", cancelled: "Cancelled — no more emails will go.", draft: "Back to draft." }[to] };
}

/** A copy of a campaign as a new draft. */
export async function duplicateEmailCampaign(campaignId: string): Promise<({ success: true; campaignId: string }) | Fail> {
  const denied = await requirePermission("email.campaigns.create", CREATE_DENIED);
  if (denied) return denied;
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("email_campaigns")
    .select("name, from_name, from_email, reply_to, subject, preheader, template_version_id, topic, audience, track_opens, track_clicks, add_utm, spread_hours, send_at_best_hour, ab_enabled, ab_subject_b, ab_preheader_b, ab_template_version_id_b, ab_test_percent, ab_winner_by, ab_wait_hours")
    .eq("id", campaignId)
    .maybeSingle();
  if (!c) return { error: "That campaign no longer exists." };
  const name = `Copy of ${c.name as string}`.slice(0, 120);
  const { data, error } = await supabase
    .from("email_campaigns")
    .insert({ ...c, name, slug: campaignSlug(name), created_by: await myId() })
    .select("id")
    .single();
  if (error) return { error: error.message };
  await logEmailActivity("campaign_duplicated", { campaignId: data.id as string, summary: `Copy of “${c.name as string}”` });
  revalidate();
  return { success: true, campaignId: data.id as string };
}

/** Deletes a draft (a campaign that went anywhere is kept for its report). */
export async function deleteEmailCampaign(campaignId: string): Promise<Ok | Fail> {
  const denied = await requirePermission("email.campaigns.create", CREATE_DENIED);
  if (denied) return denied;
  const supabase = await createClient();
  const { data, error } = await supabase.from("email_campaigns").delete().eq("id", campaignId).in("status", ["draft", "pending_approval"]).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Only a draft can be deleted; a campaign that was sent is kept for its report." };
  await logEmailActivity("campaign_deleted", { summary: `Draft ${campaignId}` });
  revalidate();
  return { success: true };
}

/**
 * A test of the campaign as it will go — its subject, preview text and sender —
 * to up to five addresses, filled in as the sample contact. Not tracked, never
 * in the report; through the portal's own mailbox until a service is connected.
 */
export async function sendEmailCampaignTest(campaignId: string, _prev: unknown, formData: FormData): Promise<Ok | Fail> {
  const denied = await requirePermission("email.campaigns.create", CREATE_DENIED);
  if (denied) return denied;
  const addresses = [...new Set(String(formData.get("to") ?? "").split(/[\s,;]+/).map((a) => a.trim().toLowerCase()).filter(Boolean))];
  if (!addresses.length) return { error: "Give at least one address." };
  if (addresses.length > 5) return { error: "A test goes to five addresses at most." };
  if (addresses.some((a) => !EMAIL_RE.test(a))) return { error: "One of those is not an email address." };
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("email_campaigns")
    .select("subject, preheader, from_name, reply_to, template_version_id, ab_enabled, ab_subject_b, ab_preheader_b, ab_template_version_id_b")
    .eq("id", campaignId)
    .maybeSingle();
  if (!c?.template_version_id) return { error: "Choose a template first." };
  const { values } = await previewValues(supabase, null);
  // Each version as its people would get it: A, and B too when the campaign is an A/B test (0363).
  const versions: { label: string; templateId: string; subject: string; preheader: string | null }[] = [
    { label: c.ab_enabled ? "Test A" : "Test", templateId: c.template_version_id as string, subject: (c.subject as string) || "(no subject yet)", preheader: c.preheader as string | null },
  ];
  if (c.ab_enabled) {
    versions.push({
      label: "Test B",
      templateId: ((c.ab_template_version_id_b as string | null) || c.template_version_id) as string,
      subject: ((c.ab_subject_b as string | null) || (c.subject as string)) || "(no subject yet)",
      preheader: ((c.ab_preheader_b as string | null) || (c.preheader as string | null)) ?? null,
    });
  }
  const settings = await readEmailSettings(supabase);
  const provider = getCampaignProvider(settings.provider);
  const failures: string[] = [];
  for (const version of versions) {
    const { data: v } = await supabase.from("email_template_versions").select("html, text_body").eq("id", version.templateId).maybeSingle();
    if (!v) return { error: "The template could not be read." };
    const full = await withContentBlocks(supabase, v.html as string, v.text_body as string | null);
    if (full.missing.length) return { error: `The email uses a content block that no longer exists: ${full.missing.map((k) => `{{block:${k}}}`).join(", ")}.` };
    const prepared = prepareCampaignHtml(full.html, { trackClicks: false, trackOpens: false, preheader: version.preheader });
    const html = renderMergeTags(prepared.html, values, { html: true });
    const text = renderMergeTags(full.text, values, { html: false });
    const subject = `[${version.label}] ${renderMergeTags(version.subject, values, { html: false })}`.slice(0, 220);
    for (const to of addresses) {
      if (provider) {
        try {
          await provider.sendOne({ to, from: settings.from_email ? `${(c.from_name as string) || settings.from_name} <${settings.from_email}>` : settings.from_name, replyTo: (c.reply_to as string) || settings.reply_to, subject, html, text, headers: { "X-HMARK-Test": "1" } });
        } catch (e) {
          failures.push(`${to}: ${e instanceof Error ? e.message : "not sent"}`);
        }
      } else {
        const sent = await sendEmail({ to, subject, html, text, replyTo: ((c.reply_to as string) || settings.reply_to) ?? undefined });
        if ("error" in sent && sent.error) failures.push(`${to}: ${sent.error}`);
      }
    }
  }
  if (failures.length === addresses.length * versions.length) return { error: `Not sent. ${failures.join("; ")}` };
  await logEmailActivity("test_sent", { campaignId, summary: `To ${addresses.join(", ")}` });
  const reached = new Set(addresses.filter((a) => !failures.some((f) => f.startsWith(`${a}:`)))).size;
  return { success: true, message: `${versions.length > 1 ? "Both versions sent" : "Test sent"} to ${reached} address${reached === 1 ? "" : "es"}${provider ? "" : " through the portal's own mailbox"}.` };
}

/** Whether the person may send (or only draft and ask). */
export async function myCampaignRights(): Promise<{ create: boolean; send: boolean; approve: boolean }> {
  const [create, send, approve] = await Promise.all([hasPermission("email.campaigns.create"), hasPermission("email.campaigns.send"), hasPermission("email.campaigns.approve")]);
  return { create, send, approve };
}

/**
 * Made-up activity for a PRACTICE campaign — nothing reached anyone, so its
 * report would stay empty — to try the reports with. Once per campaign; every
 * event is marked simulated and never touches anyone's real email state.
 */
export async function simulateEmailCampaignActivity(campaignId: string): Promise<Ok | Fail> {
  const denied = await requirePermission("email.campaigns.send", "You don't have permission to do that.");
  if (denied) return denied;
  const admin = createAdminClient();
  const { data: c } = await admin.from("email_campaigns").select("practice, status").eq("id", campaignId).maybeSingle();
  if (!c) return { error: "That campaign no longer exists." };
  if (!c.practice) return { error: "Only a practice campaign can be given made-up activity — this one really went." };
  if (!["sent", "sending", "paused", "cancelled"].includes(c.status as string)) return { error: "Send it (in practice) first." };
  const { count: already } = await admin.from("email_events").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("simulated", true);
  if (already) return { error: "It already has made-up activity." };

  const recipients: { id: string; email: string; sent_at: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await admin.from("email_campaign_recipients").select("id, email, sent_at").eq("campaign_id", campaignId).eq("status", "sent").order("id").range(from, from + 999);
    recipients.push(...((data ?? []) as typeof recipients));
    if (!data || data.length < 1000) break;
  }
  if (!recipients.length) return { error: "No emails have been sent in it yet." };
  const [{ data: links }, { data: settings }] = await Promise.all([
    admin.from("email_campaign_links").select("id, url").eq("campaign_id", campaignId),
    admin.from("email_settings").select("conversion_events").eq("id", true).maybeSingle(),
  ]);
  const conversionKeys = (Array.isArray(settings?.conversion_events) ? (settings!.conversion_events as { key?: string }[]) : []).map((c) => c.key).filter((k): k is string => Boolean(k));
  const { events, updates } = simulateActivity({
    recipients: recipients.map((r) => ({ id: r.id, campaignId, email: r.email, sentAt: r.sent_at })),
    links: (links ?? []) as { id: string; url: string }[],
    conversionKeys,
    seed: seedOf(campaignId),
  });
  for (let i = 0; i < events.length; i += 1000) {
    const { error } = await admin.from("email_events").insert(events.slice(i, i + 1000));
    if (error) return { error: error.message };
  }
  const byId = new Map(recipients.map((r) => [r.id, r]));
  for (let i = 0; i < updates.length; i += 500) {
    const { error } = await admin
      .from("email_campaign_recipients")
      .upsert(updates.slice(i, i + 500).map((u) => ({ ...u, campaign_id: campaignId, email: byId.get(u.id)!.email })), { onConflict: "id" });
    if (error) return { error: error.message };
  }
  revalidate(campaignId);
  await logEmailActivity("simulated", { campaignId, summary: `${events.length} made-up events` });
  return { success: true, message: `Made-up activity added: ${events.length.toLocaleString("en-US")} events across ${recipients.length.toLocaleString("en-US")} recipients.` };
}

/** Takes a practice campaign's made-up activity away again, so it can be simulated afresh or left empty. */
export async function clearSimulatedEmailCampaignActivity(campaignId: string): Promise<Ok | Fail> {
  const denied = await requirePermission("email.campaigns.send", "You don't have permission to do that.");
  if (denied) return denied;
  const admin = createAdminClient();
  const { data: c } = await admin.from("email_campaigns").select("practice").eq("id", campaignId).maybeSingle();
  if (!c) return { error: "That campaign no longer exists." };
  if (!c.practice) return { error: "Only a practice campaign has made-up activity." };
  const { error } = await admin.from("email_events").delete().eq("campaign_id", campaignId).eq("simulated", true);
  if (error) return { error: error.message };
  // Nothing real reaches anyone in practice, so every count on its recipients is made up.
  const { error: resetError } = await admin
    .from("email_campaign_recipients")
    .update({
      delivered_at: null,
      first_open_at: null,
      open_count: 0,
      human_open_count: 0,
      first_click_at: null,
      click_count: 0,
      human_click_count: 0,
      bounce: null,
      bounce_reason: null,
      complained_at: null,
      unsubscribed_at: null,
      visited_at: null,
      converted_at: null,
      last_activity_at: null,
      device: null,
      client: null,
      country: null,
      city: null,
    })
    .eq("campaign_id", campaignId);
  if (resetError) return { error: resetError.message };
  revalidate(campaignId);
  await logEmailActivity("simulation_cleared", { campaignId });
  return { success: true, message: "The made-up activity is gone." };
}

/**
 * Resend to non-openers (Phase 6): a new draft of the same email, with a new
 * subject, to the people the campaign reached who neither opened nor clicked
 * it. Who they are is worked out again when the resend goes, so anyone who
 * opens the first one meanwhile is left out; unsubscribes, bounces and spam
 * reports never get it.
 */
export async function resendToNonOpeners(campaignId: string, _prev: unknown, formData: FormData): Promise<({ success: true; campaignId: string }) | Fail> {
  const denied = await requirePermission("email.campaigns.create", CREATE_DENIED);
  if (denied) return denied;
  const subject = String(formData.get("subject") ?? "").trim();
  if (!subject) return { error: "Give the resend a new subject line — the same one did not get them to open it." };
  if (subject.length > 200) return { error: "Keep the subject line to 200 characters." };
  const preheader = String(formData.get("preheader") ?? "").trim();
  if (preheader.length > 250) return { error: "Keep the preview text to 250 characters." };
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("email_campaigns")
    .select("name, status, subject, from_name, from_email, reply_to, template_version_id, topic, audience, track_opens, track_clicks, add_utm")
    .eq("id", campaignId)
    .maybeSingle();
  if (!c) return { error: "That campaign no longer exists." };
  if (!["sent", "cancelled", "paused"].includes(c.status as string)) return { error: "Resend it once it has been sent." };
  if (subject.toLowerCase() === String(c.subject ?? "").trim().toLowerCase()) return { error: "Give it a different subject line from the first one." };
  const original = parseCampaignAudience(c.audience);
  const name = `${c.name as string} — resend to non-openers`.slice(0, 120);
  const { data, error } = await supabase
    .from("email_campaigns")
    .insert({
      name,
      slug: campaignSlug(name),
      subject,
      preheader: preheader || null,
      from_name: c.from_name,
      from_email: c.from_email,
      reply_to: c.reply_to,
      template_version_id: c.template_version_id,
      topic: c.topic,
      track_opens: c.track_opens,
      track_clicks: c.track_clicks,
      add_utm: c.add_utm,
      parent_campaign_id: campaignId,
      audience: {
        include: { all: false, segments: [], lists: [] },
        exclude: { segments: [], lists: [] },
        skipLeadStatuses: original.skipLeadStatuses,
        resendOf: campaignId,
      } satisfies CampaignAudience,
      created_by: await myId(),
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  await logEmailActivity("resend_created", { campaignId: data.id as string, summary: `Resend of “${c.name as string}” with the subject “${subject}”` });
  revalidate();
  return { success: true, campaignId: data.id as string };
}
