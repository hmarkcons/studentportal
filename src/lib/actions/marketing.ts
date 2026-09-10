"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import {
  amountError,
  readAmount,
  dateRangeError,
  isSocialPostStatus,
  isReferralIncentiveStatus,
} from "@/lib/marketing";

// Every update in this file used to report success whether or not it wrote
// anything. Row-level security refuses by returning no rows rather than an
// error, and none of these looked — so a marketing-role user typing an ad
// spend (the policy gives ad campaigns to digital_marketing) and a counselor
// changing a content slot's status both saw the value accepted and silently
// discarded. Verified against production: 0 rows, no error, in both cases.
const REFUSED = "You don't have permission to change this.";

export async function createCampaign(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const type = String(formData.get("type") ?? "event");
  const name = String(formData.get("name") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim() || null;
  const event_date_start = String(formData.get("event_date_start") ?? "") || null;
  const event_date_end = String(formData.get("event_date_end") ?? "") || null;

  if (!name) return { error: "Name is required." };
  if (type !== "event" && type !== "digital") return { error: "Choose whether this is an event or a digital campaign." };

  const budgetInvalid = amountError(formData.get("budget"), "budget");
  if (budgetInvalid) return { error: budgetInvalid };
  const datesInvalid = dateRangeError(event_date_start, event_date_end);
  if (datesInvalid) return { error: datesInvalid };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("campaigns").insert({
    type,
    name,
    budget: readAmount(formData.get("budget")),
    city,
    event_date_start,
    event_date_end,
    created_by: user?.id,
  });
  if (error) return { error: error.message };

  revalidatePath("/marketing/campaigns");
  return { success: true };
}

/**
 * Records what a campaign actually cost.
 *
 * campaigns.actual_spend has been on the page since the beginning — "Budget
 * 50000 · Spend 0" — with nothing anywhere able to write it, so every campaign
 * read as having cost nothing whatever was spent on it. This is the missing
 * half, matching the one the ad campaigns table already had.
 */
export async function updateCampaignActualSpend(id: string, actualSpend: string) {
  const supabase = await createClient();

  const invalid = amountError(actualSpend, "spend");
  if (invalid) return { error: invalid };

  const { data, error } = await supabase
    .from("campaigns")
    .update({ actual_spend: readAmount(actualSpend) })
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: REFUSED };

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
  if (!isSocialPostStatus(status)) return { error: "That is not a status a content slot can be in." };

  const { data, error } = await supabase
    .from("social_calendar_posts")
    .update({ status })
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Only Marketing, Management or Super Admin can move a content slot along." };

  revalidatePath("/marketing/social-calendar");
  return { success: true };
}

export async function createReferral(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const lead_id = String(formData.get("lead_id") ?? "");
  const referrer_name = String(formData.get("referrer_name") ?? "").trim();

  if (!lead_id || !referrer_name) return { error: "Lead and referrer name are required." };
  if (referrer_name.length > 120) return { error: "That referrer name is too long — 120 characters is the limit." };

  const incentiveInvalid = amountError(formData.get("incentive_owed"), "incentive");
  if (incentiveInvalid) return { error: incentiveInvalid };
  const incentive_owed = readAmount(formData.get("incentive_owed"));

  // Logging a referral is ordinary work; attaching money to it is not. The
  // policy in 0159 refuses a row that carries an amount unless the writer holds
  // the money roles, and this turns that into a sentence rather than a
  // row-level-security error.
  if (incentive_owed !== null) {
    const denied = await requirePermission(
      "marketing.referral_incentives",
      "Log the referral without an amount — only Finance, Management or Super Admin can set what is owed."
    );
    if (denied) return { error: denied.error };
  }

  const { error } = await supabase.from("referrals").insert({ lead_id, referrer_name, incentive_owed });
  if (error) {
    // The unique index on (lead_id, referrer) reaches the user as a constraint
    // name otherwise, and the thing they need to know is that it is already
    // recorded — not that a database index objected.
    if (error.code === "23505") {
      return { error: "That referrer is already logged against this lead, so nobody will be paid twice." };
    }
    return { error: error.message };
  }

  revalidatePath("/marketing/referrals");
  return { success: true };
}

export async function updateReferralIncentiveStatus(id: string, status: string) {
  const supabase = await createClient();
  if (!isReferralIncentiveStatus(status)) return { error: "An incentive is either owed or paid." };

  // Declaring money paid was open to any active staff member: referrals_write
  // was the one policy in 0015 written as is_active_staff(). Verified against
  // production that a counselor could mark an incentive paid, raise it
  // afterwards and delete the record.
  const denied = await requirePermission(
    "marketing.referral_incentives",
    "Only Finance, Management or Super Admin can mark an incentive paid."
  );
  if (denied) return { error: denied.error };

  const { data, error } = await supabase
    .from("referrals")
    .update({ incentive_status: status })
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: REFUSED };

  revalidatePath("/marketing/referrals");
  return { success: true };
}

export async function updateReferralIncentiveAmount(id: string, amount: string) {
  const supabase = await createClient();

  const invalid = amountError(amount, "incentive");
  if (invalid) return { error: invalid };

  const denied = await requirePermission(
    "marketing.referral_incentives",
    "Only Finance, Management or Super Admin can set what a referral is worth."
  );
  if (denied) return { error: denied.error };

  const { data, error } = await supabase
    .from("referrals")
    .update({ incentive_owed: readAmount(amount) })
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: REFUSED };

  revalidatePath("/marketing/referrals");
  return { success: true };
}

export async function createAdCampaign(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const platform = String(formData.get("platform") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim() || null;
  const university_id = String(formData.get("university_id") ?? "") || null;
  const budget_period = String(formData.get("budget_period") ?? "monthly");
  const start_date = String(formData.get("start_date") ?? "") || null;
  const end_date = String(formData.get("end_date") ?? "") || null;

  if (!platform) return { error: "Platform is required." };
  if (!["daily", "weekly", "monthly"].includes(budget_period)) return { error: "Choose a budget period." };

  const spendInvalid = amountError(formData.get("planned_spend"), "planned spend");
  if (spendInvalid) return { error: spendInvalid };
  const datesInvalid = dateRangeError(start_date, end_date, "ad campaign");
  if (datesInvalid) return { error: datesInvalid };

  const { error } = await supabase.from("ad_campaigns").insert({
    platform,
    country,
    university_id,
    budget_period,
    planned_spend: readAmount(formData.get("planned_spend")),
    start_date,
    end_date,
  });
  if (error) return { error: error.message };

  revalidatePath("/marketing/ad-campaigns");
  return { success: true };
}

export async function updateAdCampaignActualSpend(id: string, actualSpend: string) {
  const supabase = await createClient();

  // Was `Number(value)` straight from a text input. "abc" became NaN, which
  // JSON.stringify writes as null, so an unreadable figure was stored as "no
  // spend recorded" and reported as a success.
  const invalid = amountError(actualSpend, "spend");
  if (invalid) return { error: invalid };

  const { data, error } = await supabase
    .from("ad_campaigns")
    .update({ actual_spend: readAmount(actualSpend) })
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) {
    return { error: "Only Digital Marketing, Management or Super Admin can record ad spend." };
  }

  revalidatePath("/marketing/ad-campaigns");
  return { success: true };
}
