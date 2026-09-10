import { createClient } from "@/lib/supabase/server";
import { formatDateOnly } from "@/lib/formatDate";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { karachiToday } from "@/lib/calendarDates";
import { isMissedPost } from "@/lib/marketing";
import { NewSocialPostForm } from "./NewSocialPostForm";
import { StatusAdvance } from "./StatusAdvance";

export default async function SocialCalendarPage() {
  const supabase = await createClient();
  const { data: posts } = await supabase
    .from("social_calendar_posts")
    .select("id, post_date, theme, platforms, status")
    .order("post_date", { ascending: true });

  const today = karachiToday();
  const all = posts ?? [];
  // A slot whose date has gone by without being posted is a missed post, which
  // is the one thing a content calendar exists to prevent — and it used to sit
  // in the same flat list, ordered oldest first, so the whole of the past was
  // above today's work and nothing marked it.
  const missed = all.filter((p) => isMissedPost(p.post_date, p.status, today));
  const upcoming = all.filter((p) => p.post_date >= today);
  const done = all.filter((p) => p.post_date < today && p.status === "posted").reverse();

  const section = (title: string, rows: typeof all, tone?: "danger") => (
    <div className="mb-6">
      <h3 className={`mb-2 text-xs font-medium uppercase tracking-wide ${tone === "danger" ? "text-danger" : "text-muted"}`}>
        {title} ({rows.length})
      </h3>
      <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
        {rows.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <div className="min-w-0">
              <p className="text-ink">{p.theme}</p>
              <p className="text-xs text-muted">
                {formatDateOnly(p.post_date)}
                {(p.platforms ?? []).length > 0 && ` · ${(p.platforms ?? []).join(", ")}`}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {tone === "danger" && <Badge tone="danger">Date passed</Badge>}
              <StatusAdvance id={p.id} status={p.status} />
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="px-4 py-6">
            <EmptyState>Nothing here.</EmptyState>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold text-ink">Social Media Content Calendar</h2>
      <Card className="mb-6">
        <NewSocialPostForm />
      </Card>

      {all.length === 0 ? (
        <div className="rounded-lg border border-border bg-card px-4 py-6">
          <EmptyState>No slots yet.</EmptyState>
        </div>
      ) : (
        <>
          {missed.length > 0 && section("Past their date and not posted", missed, "danger")}
          {section("Coming up", upcoming)}
          {done.length > 0 && section("Posted", done)}
        </>
      )}
    </div>
  );
}
