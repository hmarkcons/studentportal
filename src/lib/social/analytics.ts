// Pure aggregation for the analytics dashboard, so it's unit-tested. Metrics are
// cached per target (social_post_targets.metrics) by the sync job; where a
// platform's API gives nothing, metrics is null and that target is counted as
// published but contributes no numbers ("not available").

import type { SocialPlatform } from "./types.ts";

export type AnalyticsTarget = { platform: SocialPlatform; metrics: Record<string, number> | null };
export type AnalyticsPost = { id: string; caption: string | null; country: string | null; targets: AnalyticsTarget[] };

export type PlatformSummary = { platform: SocialPlatform; posts: number; engagement: number; metricsAvailable: boolean };
export type Summary = {
  totalPosts: number;
  totalPublished: number;
  totalEngagement: number;
  perPlatform: PlatformSummary[];
  perCountry: { country: string; posts: number }[];
  topPosts: { id: string; caption: string; engagement: number }[];
};

const sumMetrics = (m: Record<string, number> | null): number =>
  m ? Object.values(m).reduce((a, v) => a + (typeof v === "number" ? v : 0), 0) : 0;

export function summarize(posts: AnalyticsPost[]): Summary {
  const perPlatform = new Map<SocialPlatform, { posts: number; engagement: number; metricsAvailable: boolean }>();
  const perCountry = new Map<string, number>();
  let totalEngagement = 0;
  let totalPublished = 0;
  const postEngagement: { id: string; caption: string; engagement: number }[] = [];

  for (const p of posts) {
    let postEng = 0;
    let publishedHere = false;
    for (const t of p.targets) {
      publishedHere = true;
      const eng = sumMetrics(t.metrics);
      postEng += eng;
      totalEngagement += eng;
      const row = perPlatform.get(t.platform) ?? { posts: 0, engagement: 0, metricsAvailable: false };
      row.posts += 1;
      row.engagement += eng;
      row.metricsAvailable = row.metricsAvailable || t.metrics !== null;
      perPlatform.set(t.platform, row);
    }
    if (publishedHere) {
      totalPublished += 1;
      if (p.country) perCountry.set(p.country, (perCountry.get(p.country) ?? 0) + 1);
      postEngagement.push({ id: p.id, caption: (p.caption ?? "").trim() || "No caption", engagement: postEng });
    }
  }

  return {
    totalPosts: posts.length,
    totalPublished,
    totalEngagement,
    perPlatform: [...perPlatform.entries()].map(([platform, v]) => ({ platform, ...v })).sort((a, b) => b.engagement - a.engagement || b.posts - a.posts),
    perCountry: [...perCountry.entries()].map(([country, posts]) => ({ country, posts })).sort((a, b) => b.posts - a.posts),
    topPosts: postEngagement.sort((a, b) => b.engagement - a.engagement).slice(0, 5),
  };
}
