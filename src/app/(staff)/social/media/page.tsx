import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { EmptyState } from "@/components/ui/EmptyState";
import { MediaUploadForm } from "./MediaUploadForm";
import { DeleteMediaButton } from "./DeleteMediaButton";

type Asset = { id: string; public_url: string; kind: "image" | "video"; alt_text: string | null; size_bytes: number | null };

export default async function MediaLibraryPage() {
  const supabase = await createClient();
  const canManage = await hasPermission("social.posts.create");
  const { data } = await supabase
    .from("media_assets")
    .select("id, public_url, kind, alt_text, size_bytes")
    .order("created_at", { ascending: false });
  const assets = (data ?? []) as Asset[];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Media Library</h1>
        <p className="mt-1 text-sm text-muted">Images and videos you can reuse across posts.</p>
      </div>

      {canManage && <MediaUploadForm />}

      {assets.length === 0 ? (
        <EmptyState>No media yet. Upload an image or video to get started.</EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4" data-media-grid>
          {assets.map((a) => (
            <div key={a.id} className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-bg" data-media={a.id}>
              {a.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element -- Supabase public URL, not a next/image source
                <img src={a.public_url} alt={a.alt_text ?? ""} className="h-full w-full object-cover" />
              ) : (
                <video src={a.public_url} className="h-full w-full object-cover" muted preload="metadata" />
              )}
              <span className="absolute left-1.5 top-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium uppercase text-white">
                {a.kind}
              </span>
              {canManage && <DeleteMediaButton assetId={a.id} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
