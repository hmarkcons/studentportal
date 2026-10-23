"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getStaffSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { validateForPlatform, type DraftMedia } from "@/lib/social/validate";
import { isSocialPlatform, type SocialPlatform } from "@/lib/social/types";

export type CreatePostTarget = {
  accountId: string;
  captionOverride?: string | null;
  options?: Record<string, unknown>;
};

export type CreatePostInput = {
  caption: string;
  hashtags?: string | null;
  link?: string | null;
  mediaAssetIds: string[];
  destinationCountry?: string | null;
  campaignId?: string | null;
  intake?: string | null;
  targets: CreatePostTarget[];
  mode: "draft" | "schedule";
  /** ISO UTC; required when mode is "schedule". */
  scheduledAt?: string | null;
};

const effectiveCaption = (base: string, override: string | null | undefined, hashtags: string | null | undefined) =>
  `${(override?.trim() || base).trim()}${hashtags?.trim() ? `\n\n${hashtags.trim()}` : ""}`;

export async function createPost(input: CreatePostInput) {
  // Draft needs create; scheduling needs the schedule permission too.
  const denied = await requirePermission(
    input.mode === "schedule" ? "social.posts.schedule" : "social.posts.create",
    input.mode === "schedule" ? "You do not have permission to schedule posts." : "You do not have permission to create posts.",
  );
  if (denied) return { error: denied.error };

  if (!input.targets.length) return { error: "Choose at least one account to post to." };

  let scheduledAt: string | null = null;
  if (input.mode === "schedule") {
    if (!input.scheduledAt) return { error: "Pick a date and time to schedule the post." };
    const when = new Date(input.scheduledAt);
    if (Number.isNaN(when.getTime())) return { error: "That schedule time isn't valid." };
    if (when.getTime() < Date.now() - 60_000) return { error: "Pick a time in the future." };
    scheduledAt = when.toISOString();
  }

  const supabase = await createClient();
  const { staff } = await getStaffSession();

  // The accounts' platforms, and the media's kind/size, for validation.
  const accountIds = input.targets.map((t) => t.accountId);
  const [{ data: accountRows }, { data: mediaRows }] = await Promise.all([
    supabase.from("social_accounts").select("id, platform, status").in("id", accountIds),
    input.mediaAssetIds.length
      ? supabase.from("media_assets").select("id, kind, size_bytes").in("id", input.mediaAssetIds)
      : Promise.resolve({ data: [] as { id: string; kind: "image" | "video"; size_bytes: number | null }[] }),
  ]);
  const accountById = new Map((accountRows ?? []).map((a) => [a.id as string, a]));
  const media: DraftMedia[] = (mediaRows ?? []).map((m) => ({ kind: m.kind, sizeBytes: m.size_bytes }));

  // Validate every target against its platform; collect the problems.
  const problems: string[] = [];
  const platformByTarget = new Map<string, SocialPlatform>();
  for (const t of input.targets) {
    const acc = accountById.get(t.accountId);
    if (!acc || !isSocialPlatform(acc.platform)) {
      problems.push("One of the chosen accounts no longer exists — reload and pick again.");
      continue;
    }
    if (acc.status !== "active") problems.push(`${acc.platform}: that account needs reconnecting before it can post.`);
    platformByTarget.set(t.accountId, acc.platform);
    const errs = validateForPlatform(acc.platform, {
      caption: effectiveCaption(input.caption, t.captionOverride, input.hashtags),
      link: input.link ?? null,
      media,
      options: t.options ?? {},
    });
    problems.push(...errs);
  }
  if (problems.length) return { error: problems.join(" ") };

  // Create the post, then its per-platform targets.
  const { data: post, error } = await supabase
    .from("social_posts")
    .insert({
      caption: input.caption.trim() || null,
      hashtags: input.hashtags?.trim() || null,
      link: input.link?.trim() || null,
      media_asset_ids: input.mediaAssetIds,
      destination_country: input.destinationCountry?.trim() || null,
      campaign_id: input.campaignId || null,
      intake: input.intake?.trim() || null,
      status: input.mode === "schedule" ? "scheduled" : "draft",
      scheduled_at: scheduledAt,
      author_id: staff?.id ?? null,
    })
    .select("id")
    .single();
  if (error || !post) return { error: error?.message ?? "Couldn't save the post." };

  const targetRows = input.targets.map((t) => ({
    post_id: post.id,
    account_id: t.accountId,
    platform: platformByTarget.get(t.accountId),
    caption_override: t.captionOverride?.trim() || null,
    options: t.options ?? {},
    status: "pending",
  }));
  const { error: targetError } = await supabase.from("social_post_targets").insert(targetRows);
  if (targetError) {
    await supabase.from("social_posts").delete().eq("id", post.id);
    return { error: targetError.message };
  }

  await supabase.from("social_post_audit_log").insert({
    post_id: post.id,
    actor_id: staff?.id ?? null,
    action: input.mode === "schedule" ? "scheduled" : "created",
    detail: input.mode === "schedule" ? `Scheduled for ${scheduledAt}` : "Saved as draft",
  });

  revalidatePath("/social/posts");
  return { success: true, postId: post.id };
}

// Move a draft/scheduled post to a new time (calendar drag-and-drop). A post
// that is publishing or already out can't be moved.
export async function rescheduleSocialPost(postId: string, scheduledAtIso: string) {
  const denied = await requirePermission("social.posts.schedule", "You do not have permission to reschedule posts.");
  if (denied) return { error: denied.error };
  const when = new Date(scheduledAtIso);
  if (Number.isNaN(when.getTime())) return { error: "That time isn't valid." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("social_posts")
    .update({ scheduled_at: when.toISOString(), status: "scheduled" })
    .eq("id", postId)
    .in("status", ["draft", "scheduled"])
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "That post can't be rescheduled — it may already be published." };

  const { staff } = await getStaffSession();
  await supabase.from("social_post_audit_log").insert({ post_id: postId, actor_id: staff?.id ?? null, action: "rescheduled", detail: `Moved to ${when.toISOString()}` });
  revalidatePath("/social/calendar");
  revalidatePath("/social/posts");
  return { success: true };
}

// Delete a post that hasn't gone out. The delete is in the audit log, so a
// Super Admin can restore it; deleting a published record does not unpublish it,
// so those are left alone.
export async function deleteSocialPost(postId: string) {
  const denied = await requirePermission("social.posts.create", "You do not have permission to delete posts.");
  if (denied) return { error: denied.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("social_posts")
    .delete()
    .eq("id", postId)
    .in("status", ["draft", "scheduled", "failed"])
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "That post can't be deleted here (only drafts, scheduled or failed posts)." };
  revalidatePath("/social/calendar");
  revalidatePath("/social/posts");
  return { success: true };
}

// Copy a post (and its per-platform targets) as a fresh draft.
export async function duplicateSocialPost(postId: string) {
  const denied = await requirePermission("social.posts.create", "You do not have permission to create posts.");
  if (denied) return { error: denied.error };
  const supabase = await createClient();
  const { data: src } = await supabase
    .from("social_posts")
    .select("caption, hashtags, link, media_asset_ids, destination_country, campaign_id, intake")
    .eq("id", postId)
    .maybeSingle();
  if (!src) return { error: "That post no longer exists." };
  const { data: targets } = await supabase.from("social_post_targets").select("account_id, platform, caption_override, options").eq("post_id", postId);

  const { staff } = await getStaffSession();
  const { data: copy, error } = await supabase
    .from("social_posts")
    .insert({ ...src, status: "draft", scheduled_at: null, author_id: staff?.id ?? null })
    .select("id")
    .single();
  if (error || !copy) return { error: error?.message ?? "Couldn't duplicate the post." };

  if (targets?.length) {
    await supabase.from("social_post_targets").insert(
      targets.map((t) => ({ post_id: copy.id, account_id: t.account_id, platform: t.platform, caption_override: t.caption_override, options: t.options, status: "pending" })),
    );
  }
  revalidatePath("/social/posts");
  return { success: true, postId: copy.id };
}
