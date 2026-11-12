"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { requirePermission } from "@/lib/auth/permissions";
import { readSunsetSettings, startSunsetRun, suppressSunsetRun } from "@/lib/emailCampaigns/sunset";
import { logEmailActivity } from "@/lib/emailCampaigns/activity";

const SUNSET = "/marketing/email/audience/sunset";
type Result = { success: true; message: string; campaignId?: string } | { error: string };

/** The sunset policy's settings (0362): confirm or automatic, how long silent, the grace period, the email. */
export async function updateSunsetSettings(_prev: unknown, formData: FormData): Promise<Result> {
  const denied = await requirePermission("email.settings.manage", "Only someone allowed to change the email settings can save them.");
  if (denied) return denied;
  const mode = formData.get("sunset_mode") === "automatic" ? "automatic" : "confirm";
  const months = Number(formData.get("sunset_months"));
  if (!Number.isInteger(months) || months < 2 || months > 24) return { error: "Silent for a whole number of months, from 2 to 24." };
  const grace = Number(formData.get("sunset_grace_days"));
  if (!Number.isInteger(grace) || grace < 7 || grace > 90) return { error: "Give them a whole number of days to answer, from 7 to 90." };
  const templateId = String(formData.get("sunset_template_id") ?? "") || null;
  if (templateId && !/^[0-9a-f-]{36}$/.test(templateId)) return { error: "Choose a template." };
  if (mode === "automatic" && !templateId) return { error: "Automatic needs the re-engagement email chosen." };
  const subject = String(formData.get("sunset_subject") ?? "").trim();
  if (!subject || subject.length > 200) return { error: "Give the re-engagement email a subject (at most 200 characters)." };
  const supabase = await createClient();
  const user = await getCurrentUser();
  const { data: saved, error } = await supabase
    .from("email_settings")
    .update({ sunset_mode: mode, sunset_months: months, sunset_grace_days: grace, sunset_template_id: templateId, sunset_subject: subject, updated_by: user?.id ?? null })
    .eq("id", true)
    .select("id");
  if (error) return { error: error.message };
  if (!saved?.length) return { error: "The settings weren't saved — you may not change them." };
  await logEmailActivity("settings_changed", { summary: `Sunset: ${mode}, ${months} months, ${grace} days` });
  revalidatePath(SUNSET);
  revalidatePath("/marketing/email/settings");
  return { success: true, message: "Saved." };
}

/** Step one, by hand: a list of everyone gone silent and the re-engagement campaign to them. */
export async function startSunsetNow(): Promise<Result> {
  const denied =
    (await requirePermission("email.audience.manage", "You don't have permission to manage the audience.")) ??
    (await requirePermission("email.campaigns.create", "You don't have permission to create campaigns."));
  if (denied) return denied;
  const user = await getCurrentUser();
  const admin = createAdminClient();
  const settings = await readSunsetSettings(admin);
  const r = await startSunsetRun(admin, { by: user?.id ?? null, settings });
  if ("error" in r) return r;
  revalidatePath(SUNSET);
  return {
    success: true,
    campaignId: r.campaignId,
    message:
      settings.mode === "automatic"
        ? `Re-engagement sent to ${r.people.toLocaleString("en-US")} people.`
        : `A re-engagement campaign to ${r.people.toLocaleString("en-US")} people is ready to check and send.`,
  };
}

/** Step two, by hand: those still silent after the grace period are no longer emailed. */
export async function suppressSunsetNow(runId: string): Promise<Result> {
  const denied = await requirePermission("email.audience.manage", "You don't have permission to manage the audience.");
  if (denied) return denied;
  const user = await getCurrentUser();
  const admin = createAdminClient();
  const settings = await readSunsetSettings(admin);
  const r = await suppressSunsetRun(admin, runId, { by: user?.id ?? null, graceDays: settings.graceDays });
  if ("error" in r) return r;
  revalidatePath(SUNSET);
  revalidatePath("/marketing/email/audience/suppressed");
  return { success: true, message: r.suppressed ? `${r.suppressed.toLocaleString("en-US")} people are no longer emailed.` : "Nobody was still silent." };
}
