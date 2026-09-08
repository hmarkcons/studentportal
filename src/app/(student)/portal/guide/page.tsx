import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

// Tutorials come from Setup > Guide tutorials. This page used to hold a
// hardcoded array whose single entry was a placeholder YouTube id — a rickroll
// titled "Welcome to your HMARK Student Portal", live in the portal.
//
// The src is composed from the stored provider and id rather than from any
// pasted URL, so nothing but a real video can be framed here.
function embedFor(v: { provider: string; video_id: string }) {
  return v.provider === "youtube"
    ? `https://www.youtube-nocookie.com/embed/${v.video_id}`
    : `https://player.vimeo.com/video/${v.video_id}`;
}

export default async function GuidePage() {
  const supabase = await createClient();

  const { data: videos } = await supabase
    .from("guide_videos")
    .select("id, title, description, provider, video_id")
    .eq("is_published", true)
    .order("sort_order", { ascending: true });

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-1 text-lg font-semibold text-ink">Guide</h2>
      <p className="mb-4 text-sm text-muted">Short walkthroughs of the things students ask about most.</p>

      {(videos ?? []).length === 0 ? (
        <Card>
          <EmptyState>
            No tutorials here yet. Your counsellor can walk you through anything in the meantime — use Messages or
            Support.
          </EmptyState>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {(videos ?? []).map((v) => (
            <Card key={v.id}>
              <p className="text-sm font-medium text-ink">{v.title}</p>
              {v.description && <p className="mb-3 mt-1 text-sm text-muted">{v.description}</p>}
              <div className={`aspect-video overflow-hidden rounded-md ${v.description ? "" : "mt-3"}`}>
                <iframe
                  src={embedFor(v)}
                  className="h-full w-full"
                  allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title={v.title}
                  loading="lazy"
                />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
