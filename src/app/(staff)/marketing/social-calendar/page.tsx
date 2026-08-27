import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { NewSocialPostForm } from "./NewSocialPostForm";
import { StatusAdvance } from "./StatusAdvance";

export default async function SocialCalendarPage() {
  const supabase = await createClient();
  const { data: posts } = await supabase
    .from("social_calendar_posts")
    .select("id, post_date, theme, platforms, status")
    .order("post_date", { ascending: true });

  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold text-ink">Social Media Content Calendar</h2>
      <Card className="mb-6">
        <NewSocialPostForm />
      </Card>
      <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
        {(posts ?? []).map((p) => (
          <div key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <div>
              <p className="text-ink">{p.theme}</p>
              <p className="text-xs text-muted">
                {new Date(p.post_date).toLocaleDateString()} · {(p.platforms ?? []).join(", ")}
              </p>
            </div>
            <StatusAdvance id={p.id} status={p.status} />
          </div>
        ))}
        {(!posts || posts.length === 0) && (
          <div className="px-4 py-6">
            <EmptyState>No slots yet.</EmptyState>
          </div>
        )}
      </div>
    </div>
  );
}
