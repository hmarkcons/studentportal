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
