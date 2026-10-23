import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PLATFORM_LABELS, type PostStatus, type SocialPlatform } from "@/lib/social/types";
import { karachiYmd, karachiParts } from "@/lib/social/time";
import { PostActions } from "./PostActions";

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
}
const STATUS_TONE: Record<PostStatus, "neutral" | "info" | "warning" | "success" | "danger"> = {
  draft: "neutral", pending_approval: "warning", scheduled: "info", publishing: "info", published: "success", partially_published: "warning", failed: "danger",
};
const STATUS_LABEL: Record<PostStatus, string> = {
  draft: "Draft", pending_approval: "Pending approval", scheduled: "Scheduled", publishing: "Publishing", published: "Published", partially_published: "Partly published", failed: "Failed",
};
const when = (iso: string | null) => {
  if (!iso) return null;
  const p = karachiParts(iso);
  return `${karachiYmd(iso)} ${String(p.hh).padStart(2, "0")}:${String(p.mm).padStart(2, "0")} PKT`;
};

export default async function PostDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const supabase = await createClient();
  const [canManage, canApprove] = await Promise.all([hasPermission("social.posts.create"), hasPermission("social.posts.approve")]);

  const { data: post } = await supabase
    .from("social_posts")
    .select(
      "id, caption, hashtags, link, media_asset_ids, destination_country, intake, status, scheduled_at, created_at, approved_at, author:staff!social_posts_author_id_fkey(full_name), approver:staff!social_posts_approved_by_fkey(full_name), campaign:social_campaigns(name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!post) notFound();

  const [{ data: targets }, { data: log }, { data: media }] = await Promise.all([
    supabase.from("social_post_targets").select("id, platform, status, platform_post_url, error, caption_override, account:social_accounts(display_name)").eq("post_id", id),
    supabase.from("social_post_audit_log").select("id, action, detail, created_at, actor:staff(full_name)").eq("post_id", id).order("created_at"),
    (post.media_asset_ids as string[])?.length
      ? supabase.from("media_assets").select("id, public_url, kind").in("id", post.media_asset_ids as string[])
      : Promise.resolve({ data: [] as { id: string; public_url: string; kind: "image" | "video" }[] }),
  ]);

  const status = post.status as PostStatus;
  const author = one(post.author as { full_name?: string } | { full_name?: string }[] | null);
  const approver = one(post.approver as { full_name?: string } | { full_name?: string }[] | null);
  const campaign = one(post.campaign as { name?: string } | { name?: string }[] | null);

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Link prefetch={false} href="/social/posts" className="text-sm font-medium text-primary hover:underline">← All posts</Link>
        <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
      </div>

      <Card className="flex flex-col gap-3">
        <p className="whitespace-pre-wrap text-sm text-ink">{post.caption?.trim() || <span className="text-muted">No caption</span>}</p>
        {post.hashtags && <p className="text-sm text-primary">{post.hashtags as string}</p>}
        {post.link && <p className="truncate text-sm text-info">{post.link as string}</p>}
        {(media ?? []).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {(media ?? []).map((m) =>
              m.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element -- Supabase public URL
                <img key={m.id} src={m.public_url} alt="" className="h-20 w-20 rounded-md object-cover" />
              ) : (
                <video key={m.id} src={m.public_url} className="h-20 w-20 rounded-md object-cover" muted preload="metadata" />
              ),
            )}
          </div>
        )}
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
          {post.scheduled_at && <span>Scheduled: {when(post.scheduled_at as string)}</span>}
          {post.destination_country && <span>Country: {post.destination_country as string}</span>}
          {post.intake && <span>Intake: {post.intake as string}</span>}
          {campaign?.name && <span>Campaign: {campaign.name}</span>}
          {author?.full_name && <span>By {author.full_name}</span>}
          {approver?.full_name && <span>Approved by {approver.full_name}</span>}
        </p>
      </Card>

      <Card className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-ink">Platforms</h2>
        {(targets ?? []).map((t) => {
          const acc = one(t.account as { display_name?: string } | { display_name?: string }[] | null);
          return (
            <div key={t.id} className="flex items-center justify-between gap-2 border-b border-border py-1.5 last:border-0" data-target-platform={t.platform}>
              <div className="min-w-0">
                <span className="text-sm text-ink">{PLATFORM_LABELS[t.platform as SocialPlatform] ?? t.platform}</span>
                <span className="ml-2 truncate text-xs text-muted">{acc?.display_name}</span>
                {t.error && <p className="text-xs text-danger">{t.error as string}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {t.platform_post_url && <a href={t.platform_post_url as string} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-primary hover:underline">View</a>}
                <Badge tone={t.status === "published" ? "success" : t.status === "failed" ? "danger" : t.status === "publishing" ? "info" : "neutral"}>{t.status as string}</Badge>
              </div>
            </div>
          );
        })}
      </Card>

      <PostActions postId={id} status={status} canManage={canManage} canApprove={canApprove} />

      <Card className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-ink">Activity</h2>
        <ul className="flex flex-col gap-1.5" data-timeline>
          {(log ?? []).map((e) => {
            const actor = one(e.actor as { full_name?: string } | { full_name?: string }[] | null);
            return (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                <span className="font-medium capitalize text-ink">{(e.action as string).replace(/_/g, " ")}</span>
                {actor?.full_name && <span className="text-muted">by {actor.full_name}</span>}
                <span className="text-muted">· {when(e.created_at as string)}</span>
                {e.detail && <span className="w-full text-muted">{e.detail as string}</span>}
              </li>
            );
          })}
          {(log ?? []).length === 0 && <li className="text-xs text-muted">No activity recorded.</li>}
        </ul>
      </Card>
    </div>
  );
}
