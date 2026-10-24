import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PLATFORM_LABELS, type SocialPlatform } from "@/lib/social/types";
import { summarize, type AnalyticsPost } from "@/lib/social/analytics";

export default async function SocialAnalyticsPage() {
  const supabase = await createClient();
  if (!(await hasPermission("social.analytics.view"))) {
    return (
      <div data-no-analytics>
        <h1 className="text-xl font-semibold text-ink">Analytics</h1>
        <Card className="mt-4"><p className="text-sm text-muted">Your role isn&rsquo;t allowed to view social analytics.</p></Card>
      </div>
    );
  }

  const { data } = await supabase
    .from("social_posts")
    .select("id, caption, destination_country, targets:social_post_targets(platform, metrics, status)")
    .in("status", ["published", "partially_published"]);

  const posts: AnalyticsPost[] = (data ?? [])
    .map((p) => ({
      id: p.id as string,
      caption: (p.caption as string | null) ?? null,
      country: (p.destination_country as string | null) ?? null,
      targets: ((p.targets as { platform: SocialPlatform; metrics: Record<string, number> | null; status: string }[]) ?? [])
        .filter((t) => t.status === "published")
        .map((t) => ({ platform: t.platform, metrics: t.metrics })),
    }))
    .filter((p) => p.targets.length > 0);

  const s = summarize(posts);
  const maxEng = Math.max(1, ...s.perPlatform.map((p) => p.engagement));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Analytics</h1>
        <p className="mt-1 text-sm text-muted">Engagement on published posts. Metrics refresh in the background; platforms that don&rsquo;t provide them show as not available.</p>
      </div>

      {posts.length === 0 ? (
        <Card><EmptyState>No published posts yet.</EmptyState></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-analytics-totals>
            <Card><p className="text-xs text-muted">Published posts</p><p className="mt-1 text-2xl font-semibold text-ink">{s.totalPublished}</p></Card>
            <Card><p className="text-xs text-muted">Total engagement</p><p className="mt-1 text-2xl font-semibold text-ink">{s.totalEngagement.toLocaleString()}</p></Card>
            <Card><p className="text-xs text-muted">Platforms used</p><p className="mt-1 text-2xl font-semibold text-ink">{s.perPlatform.length}</p></Card>
          </div>

          <Card className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-ink">By platform</h2>
            {s.perPlatform.map((p) => (
              <div key={p.platform} className="flex items-center gap-3" data-platform-row={p.platform}>
                <span className="w-24 shrink-0 text-xs text-ink">{PLATFORM_LABELS[p.platform]}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-bg">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((p.engagement / maxEng) * 100)}%` }} />
                </div>
                <span className="w-32 shrink-0 text-right text-xs text-muted">
                  {p.metricsAvailable ? `${p.engagement.toLocaleString()} · ${p.posts} post${p.posts === 1 ? "" : "s"}` : `${p.posts} post${p.posts === 1 ? "" : "s"} · n/a`}
                </span>
              </div>
            ))}
          </Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-ink">By country</h2>
              {s.perCountry.length === 0 ? <p className="text-xs text-muted">No country tagged.</p> : s.perCountry.map((c) => (
                <div key={c.country} className="flex justify-between text-sm" data-country-row={c.country}>
                  <span className="text-ink">{c.country}</span><span className="tabular-nums text-muted">{c.posts}</span>
                </div>
              ))}
            </Card>
            <Card className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-ink">Top posts</h2>
              {s.topPosts.map((p) => (
                <div key={p.id} className="flex items-baseline justify-between gap-3 text-sm" data-top-post={p.id}>
                  <span className="truncate text-ink">{p.caption}</span>
                  <span className="shrink-0 tabular-nums text-muted">{p.engagement.toLocaleString()}</span>
                </div>
              ))}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
