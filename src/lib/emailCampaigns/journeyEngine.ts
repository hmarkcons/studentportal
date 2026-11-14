import type { SupabaseClient } from "@supabase/supabase-js";
import { contactMergeValues } from "./mergeTags";
import { campaignSlug, prepareCampaignHtml } from "./render";
import { canReallySend } from "./sender";
import { withContentBlocks } from "./server";
import { conditionMet, stepAction, TRIGGERS, type StepCondition, type Trigger } from "./journeys";

// The automations engine (Phase 6, 0364). Every ten minutes
// (/api/cron/email-journeys): each switched-on journey takes in whoever its
// trigger now starts for, then moves everyone on it through the emails that
// have fallen due — sending one by queueing them on that step's campaign, so
// the every-minute sender sends it, with its tracking and unsubscribe, as it
// sends any campaign. Each email of a journey reaches a person once.
//
// Practice mode holds here too: with no sending service connected the step
// campaigns are practice, and nobody is emailed.

type Step = { id: string; position: number; day: number; condition: StepCondition; subject: string; preheader: string | null; template_version_id: string | null; campaign_id: string | null };

/**
 * Makes each step's campaign ready when a journey is switched on: kept as it
 * is when its email has not changed, made anew (the old one closed, its
 * report kept) when it has.
 */
export async function prepareJourneySteps(admin: SupabaseClient, journeyId: string): Promise<{ practice: boolean } | { error: string }> {
  const [{ data: j }, { data: steps }, { data: settings }, real] = await Promise.all([
    admin.from("email_journeys").select("name, topic").eq("id", journeyId).single(),
    admin.from("email_journey_steps").select("id, position, day, condition, subject, preheader, template_version_id, campaign_id").eq("journey_id", journeyId).order("position"),
    admin.from("email_settings").select("from_name, from_email, reply_to").eq("id", true).maybeSingle(),
    canReallySend(admin),
  ]);
  if (!j) return { error: "That automation no longer exists." };
  const practice = !real;
  for (const s of (steps ?? []) as Step[]) {
    if (!s.template_version_id) return { error: `Email ${s.position} has no template.` };
    if (s.campaign_id) {
      const { data: c } = await admin.from("email_campaigns").select("template_version_id, subject, preheader").eq("id", s.campaign_id).maybeSingle();
      if (c && c.template_version_id === s.template_version_id && c.subject === s.subject && (c.preheader ?? null) === (s.preheader ?? null)) {
        await admin.from("email_campaigns").update({ status: "sending", paused_reason: null, practice, name: `${j.name as string} — email ${s.position}` }).eq("id", s.campaign_id);
        continue;
      }
      if (c) await admin.from("email_campaigns").update({ status: "sent", finished_at: new Date().toISOString() }).eq("id", s.campaign_id);
    }
    const { data: v } = await admin.from("email_template_versions").select("html, text_body").eq("id", s.template_version_id).maybeSingle();
    if (!v) return { error: `Email ${s.position}'s template could not be read.` };
    const full = await withContentBlocks(admin, v.html as string, v.text_body as string | null);
    if (full.missing.length) return { error: `Email ${s.position} uses a content block that no longer exists: ${full.missing.map((k) => `{{block:${k}}}`).join(", ")}.` };
    const prepared = prepareCampaignHtml(full.html, { trackClicks: true, trackOpens: true, preheader: s.preheader });
    const name = `${j.name as string} — email ${s.position}`;
    const { data: c, error } = await admin
      .from("email_campaigns")
      .insert({
        kind: "automation",
        name,
        slug: campaignSlug(name),
        status: "sending",
        practice,
        subject: s.subject,
        preheader: s.preheader,
        template_version_id: s.template_version_id,
        topic: j.topic,
        from_name: settings?.from_name ?? null,
        from_email: settings?.from_email ?? null,
        reply_to: settings?.reply_to ?? null,
        prepared_html: prepared.html,
        prepared_text: full.text,
        started_at: new Date().toISOString(),
        approved_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) return { error: error.message };
    if (prepared.links.length) await admin.from("email_campaign_links").insert(prepared.links.map((l) => ({ campaign_id: c.id, ...l })));
    await admin.from("email_journey_steps").update({ campaign_id: c.id }).eq("id", s.id);
  }
  return { practice };
}

export type JourneyRun = { journeys: number; enrolled: number; sent: number; skipped: number; exited: number; completed: number };

/** One run of every switched-on journey. */
export async function runJourneys(admin: SupabaseClient, now: Date = new Date()): Promise<JourneyRun> {
  const summary: JourneyRun = { journeys: 0, enrolled: 0, sent: 0, skipped: 0, exited: 0, completed: 0 };
  const { data: journeys } = await admin.from("email_journeys").select("id, trigger, trigger_config, topic, activated_at").eq("status", "active");
  if (!journeys?.length) return summary;

  // Practice or real follows the sending service, run by run.
  const practice = !(await canReallySend(admin));
  const { data: allSteps } = await admin
    .from("email_journey_steps")
    .select("id, journey_id, position, day, condition, subject, preheader, template_version_id, campaign_id")
    .in("journey_id", journeys.map((j) => j.id as string))
    .order("position");
  const stepCampaigns = (allSteps ?? []).map((s) => s.campaign_id as string).filter(Boolean);
  if (stepCampaigns.length) await admin.from("email_campaigns").update({ practice }).in("id", stepCampaigns).neq("practice", practice);

  for (const j of journeys) {
    summary.journeys += 1;
    const trigger = j.trigger as Trigger;
    const steps = ((allSteps ?? []) as (Step & { journey_id: string })[]).filter((s) => s.journey_id === j.id);
    if (!steps.length || steps.some((s) => !s.campaign_id)) continue;

    // 1. Whoever the trigger now starts for joins (once per thing that started it).
    const { data: candidates } = await admin.rpc("email_journey_candidates", { p_trigger: trigger, p_since: j.activated_at, p_config: j.trigger_config ?? {}, p_horizon: 61 });
    const cands = (candidates ?? []) as { lead_id: string; anchor_at: string; anchor_ref: string }[];
    for (let i = 0; i < cands.length; i += 300) {
      const chunk = cands.slice(i, i + 300);
      const { data: leads } = await admin.from("leads").select("id, email").in("id", chunk.map((c) => c.lead_id));
      const emailOf = new Map((leads ?? []).map((l) => [l.id as string, String(l.email ?? "").trim().toLowerCase()]));
      const rows = chunk
        .filter((c) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailOf.get(c.lead_id) ?? ""))
        .map((c) => ({ journey_id: j.id, lead_id: c.lead_id, email: emailOf.get(c.lead_id)!, anchor_at: c.anchor_at, anchor_ref: c.anchor_ref }));
      if (!rows.length) continue;
      const { data: added } = await admin.from("email_journey_enrolments").upsert(rows, { onConflict: "journey_id,lead_id,anchor_ref", ignoreDuplicates: true }).select("id");
      summary.enrolled += added?.length ?? 0;
    }
    const stillOn = TRIGGERS[trigger].countdown ? new Set(cands.map((c) => `${c.lead_id}|${c.anchor_ref}`)) : null;

    // 2. Everyone on it, moved through what has fallen due.
    for (let from = 0; ; from += 500) {
      const { data: enrolments } = await admin
        .from("email_journey_enrolments")
        .select("id, lead_id, email, anchor_at, anchor_ref, next_position")
        .eq("journey_id", j.id)
        .eq("status", "active")
        .order("id")
        .range(from, from + 499);
      if (!enrolments?.length) break;
      const leadIds = enrolments.map((e) => e.lead_id as string);
      const emails = enrolments.map((e) => e.email as string);
      const [{ data: leads }, { data: states }, owing] = await Promise.all([
        admin.from("leads").select("id, full_name, email, country_of_interest, intake, status, assigned_counselor_id").in("id", leadIds),
        admin.from("email_contact_status").select("email, status, topics").in("email", emails),
        trigger === "missing_documents" ? admin.rpc("email_journey_owing", { p_lead_ids: leadIds }) : Promise.resolve({ data: null }),
      ]);
      const leadOf = new Map((leads ?? []).map((l) => [l.id as string, l]));
      const stateOf = new Map((states ?? []).map((s) => [s.email as string, s]));
      const owingSet = owing.data ? new Set(((owing.data ?? []) as { lead_id: string }[]).map((o) => o.lead_id)) : null;
      const counsellorIds = [...new Set((leads ?? []).map((l) => l.assigned_counselor_id as string | null).filter(Boolean))] as string[];
      const { data: counsellors } = counsellorIds.length ? await admin.from("staff").select("id, full_name").in("id", counsellorIds) : { data: [] };
      const counsellorName = new Map((counsellors ?? []).map((s) => [s.id as string, s.full_name as string]));

      for (const e of enrolments) {
        const lead = leadOf.get(e.lead_id as string);
        const state = stateOf.get(e.email as string);
        // Why they leave: gone, not to be emailed, opted out of the topic, or whatever started it has ended.
        let exit: string | null = null;
        if (!lead) exit = "The lead was deleted.";
        else if (state && state.status !== "subscribed") exit = `Their address is ${state.status}.`;
        else if (j.topic && state && Array.isArray(state.topics) && state.topics.length && !(state.topics as string[]).includes(j.topic as string)) exit = "They opted out of the topic.";
        else if (trigger === "new_lead" && ["registered", "not_interested", "not_eligible"].includes(String(lead.status))) exit = `Their status is now ${String(lead.status).replace(/_/g, " ")}.`;
        else if (owingSet && !owingSet.has(e.lead_id as string)) exit = "They owe no documents now.";
        else if (stillOn && !stillOn.has(`${e.lead_id}|${e.anchor_ref}`) && Date.parse(e.anchor_at as string) > now.getTime()) exit = "The appointment was moved or cancelled.";
        if (exit) {
          await admin.from("email_journey_enrolments").update({ status: "exited", exit_reason: exit }).eq("id", e.id);
          summary.exited += 1;
          continue;
        }

        let position = e.next_position as number;
        let previous: { opened: boolean; clicked: boolean } | null = null;
        if (position > 1) {
          const prev = steps.find((s) => s.position === position - 1);
          if (prev?.campaign_id) {
            const { data: pr } = await admin.from("email_campaign_recipients").select("human_open_count, human_click_count").eq("campaign_id", prev.campaign_id).eq("email", e.email).maybeSingle();
            previous = pr ? { opened: (pr.human_open_count as number) > 0, clicked: (pr.human_click_count as number) > 0 } : null;
          }
        }
        let over = false;
        while (position <= steps.length) {
          const step = steps.find((s) => s.position === position)!;
          const action = stepAction({ anchorAt: e.anchor_at as string, day: step.day, countdown: TRIGGERS[trigger].countdown, now });
          if (action === "wait") break;
          if (action === "over") {
            over = true;
            break;
          }
          if (action === "skip" || !conditionMet(step.condition, previous)) {
            summary.skipped += 1;
            previous = null;
            position += 1;
            continue;
          }
          // Every address needs its row for its preference and unsubscribe links.
          await admin.from("email_contact_status").upsert({ email: e.email, consent_source: "Enquiry (they contacted HMARK)", consent_at: null }, { onConflict: "email", ignoreDuplicates: true });
          const { error } = await admin.from("email_campaign_recipients").insert({
            campaign_id: step.campaign_id,
            lead_id: e.lead_id,
            contact_id: null,
            email: e.email,
            status: "queued",
            next_attempt_at: null,
            variant: null,
            merge_values: contactMergeValues(
              { full_name: lead!.full_name as string | null, email: e.email as string, country_of_interest: lead!.country_of_interest as string | null, intake: lead!.intake as string | null },
              lead!.assigned_counselor_id ? (counsellorName.get(lead!.assigned_counselor_id as string) ?? null) : null
            ),
          });
          // 23505: they have had this email already (from an earlier round) — once each, so it is not sent again.
          if (error && error.code !== "23505") break;
          if (!error) summary.sent += 1;
          await admin.from("email_campaigns").update({ recipients_total: await recipientCount(admin, step.campaign_id!) }).eq("id", step.campaign_id);
          previous = { opened: false, clicked: false };
          position += 1;
        }
        if (over) {
          await admin.from("email_journey_enrolments").update({ status: "exited", exit_reason: "The appointment has passed.", next_position: position }).eq("id", e.id);
          summary.exited += 1;
        } else if (position > steps.length) {
          await admin.from("email_journey_enrolments").update({ status: "completed", next_position: position }).eq("id", e.id);
          summary.completed += 1;
        } else if (position !== e.next_position) {
          await admin.from("email_journey_enrolments").update({ next_position: position }).eq("id", e.id);
        }
      }
      if (enrolments.length < 500) break;
    }
  }
  return summary;
}

async function recipientCount(admin: SupabaseClient, campaignId: string): Promise<number> {
  const { count } = await admin.from("email_campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId);
  return count ?? 0;
}
