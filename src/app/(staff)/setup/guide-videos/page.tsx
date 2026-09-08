import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { GuideEditor, type GuideVideoRow } from "./GuideEditor";

export default async function GuideVideosSetupPage() {
  const supabase = await createClient();

  // Unpublished entries are included and filtered on the portal side, so staff
  // can stage a tutorial and check the embed before students see it.
  const { data: videos } = await supabase
    .from("guide_videos")
    .select("id, title, description, provider, video_id, sort_order, is_published")
    .order("sort_order", { ascending: true })
    .returns<GuideVideoRow[]>();

  return (
    <div className="w-full max-w-3xl">
      <h2 className="mb-1 text-lg font-semibold text-ink">Guide tutorials</h2>
      <p className="mb-4 text-sm text-muted">
        Shown to every registered student on their Guide page, in this order. Paste a YouTube or Vimeo link — only the
        video id is stored, and the player is built from it.
      </p>
      <Card>
        <GuideEditor videos={videos ?? []} />
      </Card>
    </div>
  );
}
