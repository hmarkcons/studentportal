import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PLATFORM_LABELS, type PostStatus, type SocialPlatform } from "@/lib/social/types";

const STATUS_TONE: Record<PostStatus, "neutral" | "info" | "warning" | "success" | "danger"> = {
  draft: "neutral",
  pending_approval: "warning",
  scheduled: "info",
  publishing: "info",
  published: "success",
  partially_published: "warning",
  failed: "danger",
};
const STATUS_LABEL: Record<PostStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  scheduled: "Scheduled",
  publishing: "Publishing",
  published: "Published",
  partially_published: "Partly published",
  failed: "Failed",
};

const karachi = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null;

type Row = {
  id: string;
  caption: string | null;
  status: PostStatus;
  scheduled_at: string | null;
  created_at: string;
  destination_country: string | null;
  intake: string | null;
  targets: { platform: SocialPlatform; status: string }[];
};

export default async function PostsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("social_posts")
    .select("id, caption, status, scheduled_at, created_at, destination_country, intake, targets:social_post_targets(platform, status)")
    .order("created_at", { ascending: false })
    .limit(100);
  const posts = (data ?? []) as Row[];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Posts</h1>
          <p className="mt-1 text-sm text-muted">Everything drafted, scheduled or published.</p>
        </div>
        <Link prefetch={false} href="/social/create" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink">
          + Create post
        </Link>
      </div>

      {posts.length === 0 ? (
        <Card>
          <EmptyState>No posts yet.</EmptyState>
        </Card>
      ) : (
        <div className="flex flex-col gap-2" data-posts>
          {posts.map((p) => (
            <Link key={p.id} prefetch={false} href={`/social/posts/${p.id}`} data-post={p.id} className="block">
            <Card className="flex flex-wrap items-center justify-between gap-3 transition-colors hover:border-primary">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">{p.caption?.trim() || <span className="text-muted">No caption</span>}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  {[...new Set(p.targets.map((t) => t.platform))].map((pl) => (
                    <span key={pl} className="rounded-full border border-border px-1.5 py-0.5">{PLATFORM_LABELS[pl] ?? pl}</span>
                  ))}
                  {p.destination_country && <span>· {p.destination_country}</span>}
                  {p.intake && <span>· {p.intake}</span>}
                  {p.scheduled_at && <span>· {karachi(p.scheduled_at)} PKT</span>}
                </p>
              </div>
              <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
            </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
