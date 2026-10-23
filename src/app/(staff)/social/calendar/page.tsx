import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { SocialCalendar, type CalendarPost } from "./SocialCalendar";
import type { PostStatus, SocialPlatform } from "@/lib/social/types";

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
}

export default async function SocialCalendarPage() {
  const supabase = await createClient();
  const [canSchedule, canManage] = await Promise.all([
    hasPermission("social.posts.schedule"),
    hasPermission("social.posts.create"),
  ]);

  const [{ data: rows }, { data: campaigns }] = await Promise.all([
    supabase
      .from("social_posts")
      .select(
        "id, caption, status, scheduled_at, destination_country, intake, targets:social_post_targets(platform), campaign:social_campaigns(name), author:staff!social_posts_author_id_fkey(id, full_name)",
      )
      .not("scheduled_at", "is", null)
      .order("scheduled_at"),
    supabase.from("social_campaigns").select("id, name").order("name"),
  ]);

  const posts: CalendarPost[] = (rows ?? []).map((r) => {
    const author = one(r.author as { id?: string; full_name?: string } | { id?: string; full_name?: string }[] | null);
    const campaign = one(r.campaign as { name?: string } | { name?: string }[] | null);
    return {
      id: r.id as string,
      caption: (r.caption as string | null) ?? null,
      status: r.status as PostStatus,
      scheduledAt: r.scheduled_at as string,
      country: (r.destination_country as string | null) ?? null,
      intake: (r.intake as string | null) ?? null,
      platforms: [...new Set(((r.targets as { platform: SocialPlatform }[]) ?? []).map((t) => t.platform))],
      campaignName: campaign?.name ?? null,
      authorId: author?.id ?? null,
      authorName: author?.full_name ?? null,
    };
  });

  const authors = Array.from(new Map(posts.filter((p) => p.authorId).map((p) => [p.authorId!, p.authorName ?? "—"])).entries()).map(([id, name]) => ({ id, name }));
  const countries = [...new Set(posts.map((p) => p.country).filter((c): c is string => Boolean(c)))].sort();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">Content Calendar</h1>
        <p className="mt-1 text-sm text-muted">Scheduled posts, in Asia/Karachi time. Drag to reschedule.</p>
      </div>
      <SocialCalendar
        posts={posts}
        campaigns={(campaigns ?? []).map((c) => ({ id: c.id as string, name: c.name as string }))}
        authors={authors}
        countries={countries}
        canSchedule={canSchedule}
        canManage={canManage}
      />
    </div>
  );
}
