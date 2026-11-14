"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { requirePermission } from "@/lib/auth/permissions";
import { isTrigger, validateSteps, type Trigger } from "@/lib/emailCampaigns/journeys";
import { prepareJourneySteps } from "@/lib/emailCampaigns/journeyEngine";
import { logEmailActivity } from "@/lib/emailCampaigns/activity";

// Automations (Phase 6, 0364). Drafting a journey is creating campaigns
// (email.campaigns.create); switching one on sends email by itself, so it
// takes the right to send (email.campaigns.send).

const AUTOMATIONS = "/marketing/email/automations";
const CREATE_DENIED = "You don't have permission to create automations.";
type Result = { success: true; message?: string; journeyId?: string } | { error: string };

export async function createJourney(_prev: unknown, formData: FormData): Promise<Result> {
  const denied = await requirePermission("email.campaigns.create", CREATE_DENIED);
  if (denied) return denied;
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 120) return { error: "Give the automation a name (at most 120 characters)." };
  const trigger = String(formData.get("trigger") ?? "");
  if (!isTrigger(trigger)) return { error: "Choose what starts it." };
  const supabase = await createClient();
  const user = await getCurrentUser();
  const { data, error } = await supabase.from("email_journeys").insert({ name, trigger, created_by: user?.id ?? null }).select("id").single();
  if (error) return { error: error.message };
  revalidatePath(AUTOMATIONS);
  return { success: true, journeyId: data.id as string };
}

/** Saves a draft or paused journey: its name, topic, stages and emails. An active one must be paused first. */
export async function saveJourney(journeyId: string, _prev: unknown, formData: FormData): Promise<Result> {
  const denied = await requirePermission("email.campaigns.create", CREATE_DENIED);
  if (denied) return denied;
  const supabase = await createClient();
  const { data: j } = await supabase.from("email_journeys").select("trigger, status").eq("id", journeyId).maybeSingle();
  if (!j) return { error: "That automation no longer exists." };
  if (j.status === "active") return { error: "Pause it to change it." };
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 120) return { error: "Give the automation a name (at most 120 characters)." };
  const topic = String(formData.get("topic") ?? "") || null;
  const stages = formData.getAll("stages").map(String).filter(Boolean).slice(0, 50);
  if (j.trigger === "application_stage" && !stages.length) return { error: "Choose at least one stage that starts it." };
  const parsed = validateSteps(String(formData.get("steps") ?? "[]"), j.trigger as Trigger);
  if ("error" in parsed) return parsed;

  const { data: saved, error } = await supabase
    .from("email_journeys")
    .update({ name, topic, trigger_config: j.trigger === "application_stage" ? { stages } : {} })
    .eq("id", journeyId)
    .select("id");
  if (error) return { error: error.message };
  if (!saved?.length) return { error: CREATE_DENIED };

  // Steps by position: changed ones are updated (their campaign is remade when switched on), extra ones go.
  const { data: existing } = await supabase.from("email_journey_steps").select("id, position").eq("journey_id", journeyId);
  const byPosition = new Map((existing ?? []).map((s) => [s.position as number, s.id as string]));
  for (const [i, s] of parsed.steps.entries()) {
    const position = i + 1;
    const row = { day: s.day, condition: s.condition, subject: s.subject, preheader: s.preheader, template_version_id: s.template_version_id };
    const id = byPosition.get(position);
    const { error: stepError } = id
      ? await supabase.from("email_journey_steps").update(row).eq("id", id)
      : await supabase.from("email_journey_steps").insert({ journey_id: journeyId, position, ...row });
    if (stepError) return { error: stepError.message };
  }
  const extra = (existing ?? []).filter((s) => (s.position as number) > parsed.steps.length).map((s) => s.id as string);
  if (extra.length) await supabase.from("email_journey_steps").delete().in("id", extra);
  revalidatePath(`${AUTOMATIONS}/${journeyId}`);
  return { success: true, message: "Saved." };
}

/** Switches a journey on (or back on): its emails are made ready, and people start joining it within ten minutes. */
export async function activateJourney(journeyId: string): Promise<Result> {
  const denied = await requirePermission("email.campaigns.send", "Only someone allowed to send campaigns can switch an automation on.");
  if (denied) return denied;
  const admin = createAdminClient();
  const { data: j } = await admin.from("email_journeys").select("name, status, trigger, trigger_config").eq("id", journeyId).maybeSingle();
  if (!j) return { error: "That automation no longer exists." };
  if (j.status === "active") return { error: "It is on already." };
  const { data: steps } = await admin.from("email_journey_steps").select("day, condition, subject, preheader, template_version_id").eq("journey_id", journeyId).order("position");
  const checked = validateSteps(steps ?? [], j.trigger as Trigger);
  if ("error" in checked) return { error: `Save it with its emails first: ${checked.error}` };
  if (j.trigger === "application_stage" && !((j.trigger_config as { stages?: string[] } | null)?.stages ?? []).length) return { error: "Choose the stages that start it, and save." };
  const prepared = await prepareJourneySteps(admin, journeyId);
  if ("error" in prepared) return prepared;
  const now = new Date().toISOString();
  const { data: on } = await admin
    .from("email_journeys")
    .update({ status: "active", ...(j.status === "draft" ? { activated_at: now } : {}) })
    .eq("id", journeyId)
    .neq("status", "active")
    .select("id");
  if (!on?.length) return { error: "It changed meanwhile — reload the page." };
  await logEmailActivity("journey_activated", { summary: `“${j.name as string}” (${j.status === "draft" ? "switched on" : "resumed"})` });
  revalidatePath(`${AUTOMATIONS}/${journeyId}`);
  revalidatePath(AUTOMATIONS);
  return { success: true, message: prepared.practice ? "Switched on — as practice: nobody is emailed until the sending service is connected." : "Switched on." };
}

/** Pauses a journey: nobody new joins, and nobody is sent its next email, until it is resumed. */
export async function pauseJourney(journeyId: string): Promise<Result> {
  const denied = await requirePermission("email.campaigns.send", "Only someone allowed to send campaigns can pause an automation.");
  if (denied) return denied;
  const admin = createAdminClient();
  const { data: j } = await admin.from("email_journeys").update({ status: "paused" }).eq("id", journeyId).eq("status", "active").select("name");
  if (!j?.length) return { error: "It is not on." };
  const { data: steps } = await admin.from("email_journey_steps").select("campaign_id").eq("journey_id", journeyId).not("campaign_id", "is", null);
  const ids = (steps ?? []).map((s) => s.campaign_id as string);
  if (ids.length) await admin.from("email_campaigns").update({ status: "paused", paused_reason: "Its automation is paused." }).in("id", ids).eq("status", "sending");
  await logEmailActivity("journey_paused", { summary: `“${j[0].name as string}”` });
  revalidatePath(`${AUTOMATIONS}/${journeyId}`);
  revalidatePath(AUTOMATIONS);
  return { success: true, message: "Paused." };
}

/** Deletes a journey that was never switched on. */
export async function deleteJourney(journeyId: string): Promise<Result> {
  const denied = await requirePermission("email.campaigns.create", CREATE_DENIED);
  if (denied) return denied;
  const supabase = await createClient();
  const { data, error } = await supabase.from("email_journeys").delete().eq("id", journeyId).eq("status", "draft").select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Only an automation never switched on can be deleted — pause it instead." };
  revalidatePath(AUTOMATIONS);
  return { success: true };
}
