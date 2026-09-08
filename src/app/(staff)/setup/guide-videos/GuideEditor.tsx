"use client";

import { useActionState, useState } from "react";
import { createGuideVideo, updateGuideVideo, deleteGuideVideo, moveGuideVideo } from "@/lib/actions/guideVideos";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

export type GuideVideoRow = {
  id: string;
  title: string;
  description: string | null;
  provider: string;
  video_id: string;
  sort_order: number;
  is_published: boolean;
};

const PLACEHOLDER = "https://youtu.be/… or https://vimeo.com/…";

// The stored provider and id are turned back into a link for the form, since
// that is what staff recognise. Only the id is ever persisted.
function linkFor(v: Pick<GuideVideoRow, "provider" | "video_id">) {
  return v.provider === "youtube" ? `https://www.youtube.com/watch?v=${v.video_id}` : `https://vimeo.com/${v.video_id}`;
}

function embedFor(v: Pick<GuideVideoRow, "provider" | "video_id">) {
  return v.provider === "youtube"
    ? `https://www.youtube-nocookie.com/embed/${v.video_id}`
    : `https://player.vimeo.com/video/${v.video_id}`;
}

export function GuideEditor({ videos }: { videos: GuideVideoRow[] }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        {videos.length === 0 && (
          <EmptyState>
            No tutorials yet. Students see nothing in the Guide section until you add one.
          </EmptyState>
        )}
        {videos.map((v, i) => (
          <VideoRowEditor key={v.id} video={v} isFirst={i === 0} isLast={i === videos.length - 1} />
        ))}
      </div>

      <div className="rounded-md border border-border p-4">
        <h3 className="mb-3 text-sm font-medium text-ink">Add a tutorial</h3>
        <NewVideoForm />
      </div>
    </div>
  );
}

function NewVideoForm() {
  const [state, formAction, pending] = useActionState(createGuideVideo, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Input name="title" placeholder="What the tutorial covers" required />
      <Input name="url" type="url" inputMode="url" placeholder={PLACEHOLDER} required />
      <Textarea name="description" placeholder="Optional — a line of context for the student" rows={2} />
      <label className="flex items-center gap-2 text-xs text-ink">
        <input type="checkbox" name="is_published" defaultChecked />
        Show this to students
      </label>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      {state?.success && <p className="text-xs text-success">Added.</p>}
      <Button type="submit" variant="primary" size="sm" pending={pending} className="self-start">
        Add tutorial
      </Button>
    </form>
  );
}

function VideoRowEditor({ video, isFirst, isLast }: { video: GuideVideoRow; isFirst: boolean; isLast: boolean }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const action = updateGuideVideo.bind(null, video.id);
  const [state, formAction, pending] = useActionState(action, undefined);

  async function run(fn: () => Promise<{ error?: string } | void>) {
    setBusy(true);
    setError(null);
    const result = await fn();
    if (result && "error" in result && result.error) setError(result.error);
    setBusy(false);
  }

  if (editing) {
    return (
      <form action={formAction} className="flex flex-col gap-2 rounded-md border border-border p-4">
        <Input name="title" defaultValue={video.title} required />
        <Input name="url" type="url" inputMode="url" defaultValue={linkFor(video)} placeholder={PLACEHOLDER} required />
        <Textarea name="description" defaultValue={video.description ?? ""} rows={2} />
        <label className="flex items-center gap-2 text-xs text-ink">
          <input type="checkbox" name="is_published" defaultChecked={video.is_published} />
          Show this to students
        </label>
        {state?.error && <p className="text-xs text-danger">{state.error}</p>}
        {state?.success && <p className="text-xs text-success">Saved.</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" size="sm" pending={pending}>
            Save
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
            {state?.success ? "Close" : "Cancel"}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="rounded-md border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
            {video.title}
            {!video.is_published && <Badge tone="neutral">Hidden from students</Badge>}
          </p>
          {video.description && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{video.description}</p>}
          <p className="mt-1 text-xs text-muted">
            {video.provider === "youtube" ? "YouTube" : "Vimeo"} · {video.video_id}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          <button
            type="button"
            disabled={isFirst || busy}
            onClick={() => run(() => moveGuideVideo(video.id, "up"))}
            className="rounded-md border border-border px-2 py-1 text-xs text-ink hover:bg-bg disabled:opacity-40"
            aria-label="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            disabled={isLast || busy}
            onClick={() => run(() => moveGuideVideo(video.id, "down"))}
            className="rounded-md border border-border px-2 py-1 text-xs text-ink hover:bg-bg disabled:opacity-40"
            aria-label="Move down"
          >
            ↓
          </button>
          <Button type="button" size="sm" onClick={() => setEditing(true)}>
            ✏️ Edit
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            pending={busy}
            onClick={() => {
              if (!confirm(`Remove "${video.title}" from the guide?`)) return;
              void run(() => deleteGuideVideo(video.id));
            }}
          >
            🗑️
          </Button>
        </div>
      </div>

      {/* Shown so staff can confirm they pasted the right video before students
          ever see it — a wrong-but-valid id is otherwise invisible here. */}
      <div className="mt-3 aspect-video max-w-md overflow-hidden rounded-md border border-border">
        <iframe
          src={embedFor(video)}
          className="h-full w-full"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={video.title}
        />
      </div>

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
