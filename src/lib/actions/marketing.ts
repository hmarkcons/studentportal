"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createCampaign(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const type = String(formData.get("type") ?? "event");
  const name = String(formData.get("name") ?? "").trim();
  const budget = formData.get("budget") ? Number(formData.get("budget")) : null;
  const city = String(formData.get("city") ?? "").trim() || null;
  const event_date_start = String(formData.get("event_date_start") ?? "") || null;

  if (!name) return { error: "Name is required." };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("campaigns").insert({ type, name, budget, city, event_date_start, created_by: user?.id });
  if (error) return { error: error.message };

  revalidatePath("/marketing/campaigns");
  return { success: true };
}

export async function createSocialPost(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const post_date = String(formData.get("post_date") ?? "");
  const theme = String(formData.get("theme") ?? "").trim();
  const platforms = String(formData.get("platforms") ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (!post_date || !theme) return { error: "Date and theme are required." };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("social_calendar_posts").insert({ post_date, theme, platforms, created_by: user?.id });
  if (error) return { error: error.message };

  revalidatePath("/marketing/social-calendar");
  return { success: true };
}

export async function advanceSocialPostStatus(id: string, status: string) {
  const supabase = await createClient();
  await supabase.from("social_calendar_posts").update({ status }).eq("id", id);
  revalidatePath("/marketing/social-calendar");
}

export async function createReferral(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const lead_id = String(formData.get("lead_id") ?? "");
  const referrer_name = String(formData.get("referrer_name") ?? "").trim();
  const incentive_owed = formData.get("incentive_owed") ? Number(formData.get("incentive_owed")) : null;

  if (!lead_id || !referrer_name) return { error: "Lead and referrer name are required." };

  const { error } = await supabase.from("referrals").insert({ lead_id, referrer_name, incentive_owed });
  if (error) return { error: error.message };

  revalidatePath("/marketing/referrals");
  return { success: true };
}

export async function updateReferralIncentiveStatus(id: string, status: string) {
  const supabase = await createClient();
  await supabase.from("referrals").update({ incentive_status: status }).eq("id", id);
  revalidatePath("/marketing/referrals");
}

export async function createAdCampaign(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const platform = String(formData.get("platform") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim() || null;
  const university_id = String(formData.get("university_id") ?? "") || null;
  const budget_period = String(formData.get("budget_period") ?? "monthly");
  const planned_spend = formData.get("planned_spend") ? Number(formData.get("planned_spend")) : null;
  const start_date = String(formData.get("start_date") ?? "") || null;
  const end_date = String(formData.get("end_date") ?? "") || null;

  if (!platform) return { error: "Platform is required." };

  const { error } = await supabase
    .from("ad_campaigns")
    .insert({ platform, country, university_id, budget_period, planned_spend, start_date, end_date });
  if (error) return { error: error.message };

  revalidatePath("/marketing/ad-campaigns");
  return { success: true };
}

export async function updateAdCampaignActualSpend(id: string, actual_spend: number) {
  const supabase = await createClient();
  await supabase.from("ad_campaigns").update({ actual_spend }).eq("id", id);
  revalidatePath("/marketing/ad-campaigns");
}
