"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { requirePermission } from "@/lib/auth/permissions";
import { providerConfigured, PROVIDER_ENV } from "@/lib/emailCampaigns/providers";
import { parseKeyedLines } from "@/lib/emailCampaigns/campaignRules";
import { karachiDay } from "@/lib/emailCampaigns/sendingRules";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Saves the email settings (0354). A sending service can be chosen only once
 * its keys are set in the environment — until the office has bought one, it
 * stays "Not connected" and nothing is sent in bulk.
 */
export async function updateEmailSettings(_prev: unknown, formData: FormData): Promise<{ success: true } | { error: string }> {
  const denied = await requirePermission("email.settings.manage", "Only someone allowed to change the email settings can save them.");
  if (denied) return denied;

  const provider = String(formData.get("provider") ?? "none");
  if (provider !== "none" && provider !== "ses" && provider !== "resend") return { error: "Choose a sending service." };
  if (provider !== "none" && !providerConfigured(provider)) {
    return { error: `${PROVIDER_ENV[provider].label} is not connected yet: its keys are not set. Add them first, then choose it.` };
  }
  const from_name = String(formData.get("from_name") ?? "").trim();
  if (!from_name || from_name.length > 80) return { error: "Give the sender name (at most 80 characters)." };
  const from_email = String(formData.get("from_email") ?? "").trim().toLowerCase() || null;
  if (from_email && !EMAIL_RE.test(from_email)) return { error: "The sender address is not an email address." };
  const reply_to = String(formData.get("reply_to") ?? "").trim().toLowerCase() || null;
  if (reply_to && !EMAIL_RE.test(reply_to)) return { error: "The reply-to address is not an email address." };
  const physical_address = String(formData.get("physical_address") ?? "").trim();
  if (!physical_address) return { error: "Give HMARK's address: every campaign email must carry it." };
  if (physical_address.length > 300) return { error: "Keep the address to 300 characters." };
  const max_upload_mb = Number(formData.get("max_upload_mb"));
  if (!Number.isInteger(max_upload_mb) || max_upload_mb < 1 || max_upload_mb > 40) return { error: "The upload limit is a whole number of MB, from 1 to 40." };

  const supabase = await createClient();
  const user = await getCurrentUser();
  // Read back: an update the database refuses matches no rows and raises nothing.
  const { data: saved, error } = await supabase
    .from("email_settings")
    .update({ provider, from_name, from_email, reply_to, physical_address, max_upload_mb, updated_by: user?.id ?? null })
    .eq("id", true)
    .select("id");
  if (error) return { error: error.message };
  if (!saved?.length) return { error: "The settings weren't saved — you may not change them." };
  revalidatePath("/marketing/email/settings");
  return { success: true };
}

/** How fast campaigns send, the warm-up, and the topic and conversion lists (0355, 0356). */
export async function updateEmailSendingSettings(_prev: unknown, formData: FormData): Promise<{ success: true } | { error: string }> {
  const denied = await requirePermission("email.settings.manage", "Only someone allowed to change the email settings can save them.");
  if (denied) return denied;

  const send_per_second = Number(formData.get("send_per_second"));
  if (!Number.isFinite(send_per_second) || send_per_second <= 0 || send_per_second > 100) return { error: "Emails a second is a number above 0, at most 100." };
  const send_per_hour = Number(formData.get("send_per_hour"));
  if (!Number.isInteger(send_per_hour) || send_per_hour < 1 || send_per_hour > 1_000_000) return { error: "Emails an hour is a whole number from 1 to 1,000,000." };
  const warmup_enabled = formData.get("warmup_enabled") === "on";
  const warmup_start_cap = Number(formData.get("warmup_start_cap"));
  if (!Number.isInteger(warmup_start_cap) || warmup_start_cap < 1 || warmup_start_cap > 1_000_000) return { error: "The first day's limit is a whole number from 1 to 1,000,000." };
  const warmup_growth_pct = Number(formData.get("warmup_growth_pct"));
  if (!Number.isInteger(warmup_growth_pct) || warmup_growth_pct < 0 || warmup_growth_pct > 500) return { error: "The daily growth is a whole percentage from 0 to 500." };
  const startedRaw = String(formData.get("warmup_started_on") ?? "").trim();
  if (startedRaw && !/^\d{4}-\d{2}-\d{2}$/.test(startedRaw)) return { error: "The warm-up start is a date." };
  // Turning warm-up on with no start date starts it today.
  const warmup_started_on = startedRaw || (warmup_enabled ? karachiDay() : null);

  const topics = parseKeyedLines(String(formData.get("topics") ?? ""), { what: "topic" });
  if ("error" in topics) return topics;
  const conversions = parseKeyedLines(String(formData.get("conversion_events") ?? ""), { what: "conversion" });
  if ("error" in conversions) return conversions;

  const supabase = await createClient();
  const user = await getCurrentUser();
  const { data: saved, error } = await supabase
    .from("email_settings")
    .update({
      send_per_second,
      send_per_hour,
      warmup_enabled,
      warmup_start_cap,
      warmup_growth_pct,
      warmup_started_on,
      topics: topics.items,
      conversion_events: conversions.items,
      updated_by: user?.id ?? null,
    })
    .eq("id", true)
    .select("id");
  if (error) return { error: error.message };
  if (!saved?.length) return { error: "The settings weren't saved — you may not change them." };
  revalidatePath("/marketing/email/settings");
  return { success: true };
}
