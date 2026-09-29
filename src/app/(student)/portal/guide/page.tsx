import { createClient } from "@/lib/supabase/server";
import { CirclePlay } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PortalPageHeader } from "@/components/studentPortal/PortalPageHeader";
import { PortalEmpty } from "@/components/studentPortal/PortalEmpty";

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
    <div className="flex w-full flex-col gap-6" data-portal-page>
      <PortalPageHeader
        icon={CirclePlay}
        title="Guide"
        description="Short walkthroughs of the things students ask about most."
        aside={
          (videos ?? []).length > 0 ? (
            <span className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted">
              {(videos ?? []).length} video{(videos ?? []).length === 1 ? "" : "s"}
            </span>
          ) : undefined
        }
      />

      {(videos ?? []).length === 0 ? (
        <Card>
          <PortalEmpty icon={CirclePlay} title="No tutorials here yet">
            Your counsellor can walk you through anything in the meantime — use Messages or Support.
          </PortalEmpty>
        </Card>
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2 2xl:grid-cols-3">
          {(videos ?? []).map((v, i) => (
            <Card key={v.id}>
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <span aria-hidden className="bg-hero flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white">
                  {i + 1}
                </span>
                {v.title}
              </p>
              {v.description && <p className="mb-3 mt-1 text-sm text-muted">{v.description}</p>}
              <div className={`aspect-video overflow-hidden rounded-xl ring-1 ring-border ${v.description ? "" : "mt-3"}`}>
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
