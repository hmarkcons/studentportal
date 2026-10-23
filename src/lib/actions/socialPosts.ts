"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { validateForPlatform, type DraftMedia } from "@/lib/social/validate";
import { publishPost } from "@/lib/social/publisher";
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
  mode: "draft" | "submit" | "schedule" | "publish";
  /** ISO UTC; required for "schedule", optional for "submit". */
  scheduledAt?: string | null;
};

const effectiveCaption = (base: string, override: string | null | undefined, hashtags: string | null | undefined) =>
  `${(override?.trim() || base).trim()}${hashtags?.trim() ? `\n\n${hashtags.trim()}` : ""}`;

export async function createPost(input: CreatePostInput) {
  // Draft needs create; scheduling needs schedule; publishing now needs publish.
  const permKey = input.mode === "publish" ? "social.posts.publish" : input.mode === "schedule" ? "social.posts.schedule" : "social.posts.create";
  const permMsg =
    input.mode === "publish"
      ? "You do not have permission to publish posts."
      : input.mode === "schedule"
        ? "You do not have permission to schedule posts."
        : "You do not have permission to create posts.";
  const denied = await requirePermission(permKey, permMsg);
  if (denied) return { error: denied.error };

  if (!input.targets.length) return { error: "Choose at least one account to post to." };

  let scheduledAt: string | null = null;
  if (input.scheduledAt && (input.mode === "schedule" || input.mode === "submit")) {
    const when = new Date(input.scheduledAt);
    if (Number.isNaN(when.getTime())) return { error: "That schedule time isn't valid." };
    if (when.getTime() < Date.now() - 60_000) return { error: "Pick a time in the future." };
    scheduledAt = when.toISOString();
  }
  if (input.mode === "schedule" && !scheduledAt) return { error: "Pick a date and time to schedule the post." };
  if (input.mode === "publish") scheduledAt = new Date().toISOString();

  const postStatus = input.mode === "submit" ? "pending_approval" : input.mode === "draft" ? "draft" : "scheduled";

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
      status: postStatus,
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

  await createAdminClient().from("social_post_audit_log").insert({
    post_id: post.id,
    actor_id: staff?.id ?? null,
    action: input.mode === "publish" ? "publishing" : input.mode === "schedule" ? "scheduled" : input.mode === "submit" ? "submitted" : "created",
    detail:
      input.mode === "schedule" ? `Scheduled for ${scheduledAt}`
        : input.mode === "publish" ? "Publishing now"
          : input.mode === "submit" ? "Submitted for approval"
            : "Saved as draft",
  });

  // Publish now: run the engine immediately (service role, for the tokens); the
  // per-minute cron is the backstop if this request is interrupted.
  if (input.mode === "publish") {
    await publishPost(createAdminClient(), post.id);
  }

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
  await createAdminClient().from("social_post_audit_log").insert({ post_id: postId, actor_id: staff?.id ?? null, action: "rescheduled", detail: `Moved to ${when.toISOString()}` });
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

// --- approval workflow (0343 permissions; audit in social_post_audit_log) ---

/** Send an existing draft for approval. */
export async function submitForApproval(postId: string) {
  const denied = await requirePermission("social.posts.create", "You do not have permission to submit posts.");
  if (denied) return { error: denied.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("social_posts").update({ status: "pending_approval" }).eq("id", postId).eq("status", "draft").select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Only a draft can be submitted for approval." };
  const { staff } = await getStaffSession();
  await createAdminClient().from("social_post_audit_log").insert({ post_id: postId, actor_id: staff?.id ?? null, action: "submitted", detail: "Submitted for approval" });
  revalidatePath("/social/posts");
  revalidatePath(`/social/posts/${postId}`);
  return { success: true };
}

/** Approve a post waiting for approval: it becomes scheduled (if it has a time) or a ready draft. */
export async function approvePost(postId: string) {
  const denied = await requirePermission("social.posts.approve", "You do not have permission to approve posts.");
  if (denied) return { error: denied.error };
  const supabase = await createClient();
  const { data: post } = await supabase.from("social_posts").select("scheduled_at, author_id").eq("id", postId).maybeSingle();
  const nextStatus = post?.scheduled_at ? "scheduled" : "draft";
  const { staff } = await getStaffSession();
  const { data, error } = await supabase
    .from("social_posts")
    .update({ status: nextStatus, approved_by: staff?.id ?? null, approved_at: new Date().toISOString() })
    .eq("id", postId)
    .eq("status", "pending_approval")
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "That post isn't waiting for approval." };

  await createAdminClient().from("social_post_audit_log").insert({ post_id: postId, actor_id: staff?.id ?? null, action: "approved", detail: nextStatus === "scheduled" ? "Approved — now scheduled" : "Approved" });
  if (post?.author_id && post.author_id !== staff?.id) {
    await createAdminClient().from("notifications").insert({ user_id: post.author_id, kind: "social_post_approved", title: "Your post was approved", body: nextStatus === "scheduled" ? "It's scheduled to publish." : "It's ready to schedule or publish.", link: `/social/posts/${postId}` });
  }
  revalidatePath("/social/posts");
  revalidatePath(`/social/posts/${postId}`);
  return { success: true };
}

/** Send a post back to its author with a reason. */
export async function rejectPost(postId: string, reason: string) {
  const denied = await requirePermission("social.posts.approve", "You do not have permission to review posts.");
  if (denied) return { error: denied.error };
  const trimmed = reason.trim();
  if (!trimmed) return { error: "Give a reason so the author knows what to change." };
  const supabase = await createClient();
  const { data: post } = await supabase.from("social_posts").select("author_id").eq("id", postId).maybeSingle();
  const { staff } = await getStaffSession();
  const { data, error } = await supabase.from("social_posts").update({ status: "draft" }).eq("id", postId).eq("status", "pending_approval").select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "That post isn't waiting for approval." };

  await createAdminClient().from("social_post_audit_log").insert({ post_id: postId, actor_id: staff?.id ?? null, action: "rejected", detail: trimmed.slice(0, 500) });
  if (post?.author_id && post.author_id !== staff?.id) {
    await createAdminClient().from("notifications").insert({ user_id: post.author_id, kind: "social_post_rejected", title: "Your post was sent back", body: trimmed.slice(0, 300), link: `/social/posts/${postId}` });
  }
  revalidatePath("/social/posts");
  revalidatePath(`/social/posts/${postId}`);
  return { success: true };
}
