// The publishing engine. Runs under the service role (the cron and "Publish
// Now"), so it can read decrypted tokens and write any row. Idempotent: a target
// is claimed (pending -> publishing) before anything is sent, so a second run
// never publishes it twice; a target already published is skipped.

import type { SupabaseClient } from "@supabase/supabase-js";
import { providerForAccount } from "./registry.ts";
import { isSocialPlatform, type PostStatus, type PublishInput, type TargetStatus } from "./types.ts";

const MAX_ATTEMPTS = 3;

/** Minutes to wait before the Nth retry (1-based attempt count): 1m, 5m, 15m. */
export function backoffMinutes(attempts: number): number {
  return [1, 5, 15][Math.min(Math.max(attempts, 1), 3) - 1];
}

/** The post's status from its targets' statuses. */
export function rollupStatus(statuses: TargetStatus[]): Extract<PostStatus, "published" | "partially_published" | "failed" | "publishing"> {
  if (statuses.length === 0) return "publishing";
  if (statuses.every((s) => s === "published")) return "published";
  if (statuses.every((s) => s === "failed")) return "failed";
  if (statuses.some((s) => s === "pending" || s === "publishing")) return "publishing";
  return "partially_published"; // a mix of published and failed, none outstanding
}

const effectiveCaption = (base: string | null, override: string | null, hashtags: string | null) =>
  `${(override?.trim() || base?.trim() || "")}${hashtags?.trim() ? `\n\n${hashtags.trim()}` : ""}`.trim();

type Admin = SupabaseClient;

/** Publish (or advance) every outstanding target of one post. */
export async function publishPost(admin: Admin, postId: string): Promise<void> {
  const nowIso = new Date().toISOString();

  const { data: post } = await admin
    .from("social_posts")
    .select("id, caption, hashtags, link, media_asset_ids, author_id")
    .eq("id", postId)
    .maybeSingle();
  if (!post) return;

  const mediaIds: string[] = post.media_asset_ids ?? [];
  const { data: mediaRows } = mediaIds.length
    ? await admin.from("media_assets").select("id, public_url, kind").in("id", mediaIds)
    : { data: [] as { id: string; public_url: string; kind: "image" | "video" }[] };
  const mediaById = new Map((mediaRows ?? []).map((m) => [m.id, m]));
  const media = mediaIds.map((id) => mediaById.get(id)).filter(Boolean) as { id: string; public_url: string; kind: "image" | "video" }[];
  const mediaUrls = media.map((m) => m.public_url);
  const mediaKind: PublishInput["mediaKind"] = media.length === 0 ? "none" : media.some((m) => m.kind === "video") ? "video" : "image";

  // Targets that are due: pending and past any backoff.
  const { data: targets } = await admin
    .from("social_post_targets")
    .select("id, account_id, platform, caption_override, options, status, attempts, container_id")
    .eq("post_id", postId)
    .eq("status", "pending")
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`);

  let anyFinalFailure: { platform: string; error: string } | null = null;

  for (const t of targets ?? []) {
    if (!isSocialPlatform(t.platform)) continue;

    // Claim it: only one runner wins the pending -> publishing transition.
    const { data: claimed } = await admin
      .from("social_post_targets")
      .update({ status: "publishing", updated_at: nowIso })
      .eq("id", t.id)
      .eq("status", "pending")
      .select("id");
    if (!claimed?.length) continue;

    const { data: account } = await admin
      .from("social_accounts")
      .select("id, platform, display_name, username, avatar_url, external_id, status, scopes, profile_ref, is_mock, token_expires_at, connected_at")
      .eq("id", t.account_id)
      .maybeSingle();
    const attempts = (t.attempts ?? 0) + 1;

    const fail = async (error: string, retryable: boolean) => {
      const giveUp = !retryable || attempts >= MAX_ATTEMPTS;
      await admin
        .from("social_post_targets")
        .update({
          status: giveUp ? "failed" : "pending",
          attempts,
          error,
          next_attempt_at: giveUp ? null : new Date(Date.now() + backoffMinutes(attempts) * 60_000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", t.id);
      if (giveUp) anyFinalFailure = { platform: t.platform, error };
    };

    if (!account) {
      await fail("The account no longer exists.", false);
      continue;
    }

    try {
      const { data: tokenJson } = await admin.rpc("read_social_token", { p_account_id: account.id });
      const token = tokenJson ? (JSON.parse(tokenJson as string) as Record<string, unknown>) : {};
      const provider = providerForAccount(account);
      const input: PublishInput = {
        caption: effectiveCaption(post.caption, t.caption_override, post.hashtags),
        link: post.link ?? null,
        mediaUrls,
        mediaKind,
        options: (t.options as Record<string, unknown>) ?? {},
      };

      const result = t.container_id
        ? await provider.getStatus(account, token, t.container_id)
        : await provider.publish(account, token, input);

      if (result.ok === true) {
        await admin
          .from("social_post_targets")
          .update({ status: "published", platform_post_id: result.platformPostId, platform_post_url: result.url, error: null, published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", t.id);
      } else if (result.ok === "pending") {
        // Async container: remember it, come back next run to poll.
        await admin
          .from("social_post_targets")
          .update({ status: "pending", container_id: result.containerId, attempts, next_attempt_at: new Date(Date.now() + 60_000).toISOString(), updated_at: new Date().toISOString() })
          .eq("id", t.id);
      } else {
        await fail(result.error, result.retryable);
      }
    } catch (e) {
      await fail(e instanceof Error ? e.message : "Unexpected publish error.", true);
    }
  }

  // Roll the post's status up from its targets.
  const { data: allTargets } = await admin.from("social_post_targets").select("status").eq("post_id", postId);
  const status = rollupStatus((allTargets ?? []).map((x) => x.status as TargetStatus));
  await admin.from("social_posts").update({ status, updated_at: new Date().toISOString() }).eq("id", postId);

  // Tell the author if something gave up for good.
  if (anyFinalFailure && post.author_id) {
    const f = anyFinalFailure as { platform: string; error: string };
    await admin.from("notifications").insert({
      user_id: post.author_id,
      kind: "social_publish_failed",
      title: `A post failed to publish to ${f.platform}`,
      body: f.error.slice(0, 300),
      link: "/social/posts",
    });
    await admin.from("social_post_audit_log").insert({ post_id: postId, actor_id: null, action: "publish_failed", detail: `${f.platform}: ${f.error}`.slice(0, 500) });
  } else if (status === "published") {
    await admin.from("social_post_audit_log").insert({ post_id: postId, actor_id: null, action: "published", detail: null });
  }
}

/** Claim every scheduled post whose time has come and publish it; also advance anything mid-publish. */
export async function runDuePosts(admin: Admin): Promise<{ processed: number }> {
  const nowIso = new Date().toISOString();

  // Atomically take due scheduled posts into "publishing" so a second run can't re-claim them.
  await admin.from("social_posts").update({ status: "publishing", updated_at: nowIso }).eq("status", "scheduled").lte("scheduled_at", nowIso);

  const { data: posts } = await admin.from("social_posts").select("id").eq("status", "publishing");
  for (const p of posts ?? []) await publishPost(admin, p.id as string);
  return { processed: (posts ?? []).length };
}

/** Refresh cached engagement metrics for published targets not fetched recently. */
export async function syncMetrics(admin: Admin, limit = 25): Promise<{ synced: number }> {
  const stale = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const { data: targets } = await admin
    .from("social_post_targets")
    .select("id, account_id, platform_post_id")
    .eq("status", "published")
    .not("platform_post_id", "is", null)
    .or(`metrics_fetched_at.is.null,metrics_fetched_at.lte.${stale}`)
    .limit(limit);

  let synced = 0;
  for (const t of targets ?? []) {
    const { data: account } = await admin
      .from("social_accounts")
      .select("id, platform, display_name, username, avatar_url, external_id, status, scopes, profile_ref, is_mock, token_expires_at, connected_at")
      .eq("id", t.account_id)
      .maybeSingle();
    if (!account) continue;
    let metrics: Record<string, number> | null = null;
    try {
      const { data: tokenJson } = await admin.rpc("read_social_token", { p_account_id: account.id });
      const token = tokenJson ? (JSON.parse(tokenJson as string) as Record<string, unknown>) : {};
      metrics = await providerForAccount(account).fetchMetrics(account, token, t.platform_post_id as string);
    } catch {
      metrics = null;
    }
    await admin.from("social_post_targets").update({ metrics, metrics_fetched_at: new Date().toISOString() }).eq("id", t.id);
    synced += 1;
  }
  return { synced };
}
