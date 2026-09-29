"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { Bold, Heading2, Link2, List, ListOrdered, MapPin, X } from "lucide-react";
import { saveDocumentGuide, saveCountryGuideNote, type GuideTarget } from "@/lib/actions/documentGuides";
import { applyGuideFormat, GUIDE_LIMITS, parseGuide, type GuideFormat } from "@/lib/documentGuide";
import { parseVideoUrl, watchUrl } from "@/lib/videoEmbed";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FileField } from "@/components/FileField";
import { ActionStatus } from "@/components/ActionStatus";
import { useButtonAction } from "@/components/useButtonAction";
import { DocumentGuideView } from "@/components/DocumentGuide";
import type { ResolvedGuide } from "@/lib/documentGuides";

/** A guide as the builder edits it. */
export type EditableGuide = {
  note: string | null;
  body: string | null;
  sampleName: string | null;
  sampleUrl: string | null;
  /** Where the stored video plays, as staff would paste it. */
  videoUrl: string | null;
};

export function guideIsWritten(g: EditableGuide | null | undefined): boolean {
  return Boolean(g && ((g.note ?? "").trim() || (g.body ?? "").trim() || g.sampleUrl || g.videoUrl));
}

const TOOLS: { format: GuideFormat; label: string; icon: typeof Bold }[] = [
  { format: "heading", label: "Heading", icon: Heading2 },
  { format: "bold", label: "Bold", icon: Bold },
  { format: "steps", label: "Numbered steps", icon: ListOrdered },
  { format: "bullets", label: "Bullet points", icon: List },
  { format: "link", label: "Link", icon: Link2 },
];

/**
 * Writes the guide a student reads for one document (0300): a short note under
 * its name, the full guide with steps and links, a correct sample, a video —
 * and, on a country's checklist, that country's own note beneath a shared
 * document. The preview beside it is drawn by the component the student's
 * page uses, so what is seen here is what they get.
 */
export function GuideEditor({
  target,
  name,
  guide,
  country,
  sharedReadOnly = false,
  onClose,
}: {
  target: GuideTarget;
  name: string;
  guide: EditableGuide;
  /** Shared document, country checklist: that country's note. */
  country: { destinationId: string; label: string; note: string | null } | null;
  /**
   * On a country's checklist, a shared document's guide is shown, not
   * edited: a change there would reach every country, from a page that reads
   * as one country's. It is written on All destinations.
   */
  sharedReadOnly?: boolean;
  onClose: () => void;
}) {
  const action = saveDocumentGuide.bind(null, target);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [note, setNote] = useState(guide.note ?? "");
  const [body, setBody] = useState(guide.body ?? "");
  const [video, setVideo] = useState(guide.videoUrl ?? "");
  const [removeSample, setRemoveSample] = useState(false);
  const [newSample, setNewSample] = useState<string | null>(null);
  const [countryNote, setCountryNote] = useState(country?.note ?? "");
  const noteSave = useButtonAction();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const videoEmbed = video.trim() ? parseVideoUrl(video) : null;
  const videoProblem = video.trim() && !videoEmbed ? "Not a YouTube or Vimeo address — it won't be saved." : null;

  const preview: ResolvedGuide = useMemo(
    () => ({
      note: note.trim() || null,
      blocks: parseGuide(body),
      sampleUrl: newSample ? "#" : removeSample ? null : guide.sampleUrl,
      sampleName: newSample ?? guide.sampleName,
      video: videoEmbed ? { ...videoEmbed, watchUrl: watchUrl(videoEmbed) } : null,
      countryNotes: country && countryNote.trim() ? [{ destinationId: country.destinationId, destinationName: country.label, note: countryNote.trim() }] : [],
    }),
    [note, body, newSample, removeSample, guide.sampleUrl, guide.sampleName, videoEmbed, country, countryNote]
  );

  function format(f: GuideFormat) {
    const el = bodyRef.current;
    if (!el) return;
    const r = applyGuideFormat(body, el.selectionStart, el.selectionEnd, f);
    setBody(r.text);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(r.start, r.end);
    });
  }

  return (
    <div className="mt-2 rounded-lg border border-primary/30 bg-bg p-4" data-guide-editor>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">Guide · {name}</p>
          <p className="text-xs text-muted">
            What the student reads to prepare this document — under its name on their Documents page, opened with
            &ldquo;How to prepare this&rdquo;, and beside the reason if it is sent back. Staff see it on the student&rsquo;s
            Documents tab.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close the guide" className="rounded p-1 text-muted hover:bg-card hover:text-ink">
          <X aria-hidden className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
        {sharedReadOnly ? (
          <p className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted" data-guide-shared-notice>
            This document is shared by every destination, so its guide is written once, on{" "}
            <a href="/setup/create-doc-checklist?destination=all" className="font-medium text-primary hover:underline">
              All destinations
            </a>
            . Add below what {country?.label ?? "this destination"} asks for differently.
          </p>
        ) : (
        <form action={formAction} className="flex min-w-0 flex-col gap-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-ink">
            Short note
            <span className="font-normal text-muted">One or two sentences, shown right under the name.</span>
            <textarea
              name="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={GUIDE_LIMITS.note}
              rows={2}
              placeholder="e.g. A colour scan of every page, including the blank ones."
              className="rounded-md border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-primary"
              data-guide-note-input
            />
            <span className="self-end font-normal text-muted">
              {note.length}/{GUIDE_LIMITS.note}
            </span>
          </label>

          <div className="flex flex-col gap-1 text-xs font-medium text-ink">
            <label htmlFor={`guide-body-${"templateId" in target ? target.templateId : target.profileKind}`}>Full guide</label>
            <span className="font-normal text-muted">Where to get it, what it must show, what gets it sent back.</span>
            <div className="flex flex-wrap items-center gap-1 rounded-t-md border border-b-0 border-border bg-card px-1.5 py-1" role="toolbar" aria-label="Format the guide">
              {TOOLS.map((t) => (
                <button
                  key={t.format}
                  type="button"
                  onClick={() => format(t.format)}
                  title={t.label}
                  aria-label={t.label}
                  className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-bg hover:text-ink"
                  data-guide-tool={t.format}
                >
                  <t.icon aria-hidden className="h-4 w-4" />
                </button>
              ))}
            </div>
            <textarea
              id={`guide-body-${"templateId" in target ? target.templateId : target.profileKind}`}
              ref={bodyRef}
              name="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={GUIDE_LIMITS.body}
              rows={10}
              placeholder={"## Where to get it\n1. Apply at your district police office\n2. Have it attested by **MOFA**\n- It must cover the last five years\n[Book an appointment](https://…)"}
              className="-mt-1 rounded-b-md border border-border bg-card px-3 py-2 font-mono text-[13px] leading-relaxed text-ink outline-none focus:border-primary"
              data-guide-body-input
            />
            <span className="font-normal text-muted">
              ## heading · 1. steps · - bullets · **bold** · [words](https://address) · {body.length}/{GUIDE_LIMITS.body}
            </span>
          </div>

          <div className="flex flex-col gap-1 text-xs font-medium text-ink">
            Sample
            <span className="font-normal text-muted">A correct one, so the student can see what is expected. Blur anything personal.</span>
            {guide.sampleUrl && !newSample && (
              <span className="flex flex-wrap items-center gap-3 font-normal">
                <a href={guide.sampleUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  {guide.sampleName ?? "Current sample"}
                </a>
                <label className="flex items-center gap-1 text-muted">
                  <input type="checkbox" name="remove_sample" checked={removeSample} onChange={(e) => setRemoveSample(e.target.checked)} />
                  Remove it
                </label>
              </span>
            )}
            <FileField
              name="sample"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              hint={guide.sampleUrl ? "Choose another to replace it · PDF or image" : "PDF or image"}
              noun="sample"
              onChange={(s) => setNewSample(s.file ? s.file.name : null)}
            />
          </div>

          <label className="flex flex-col gap-1 text-xs font-medium text-ink">
            Video
            <span className="font-normal text-muted">A YouTube or Vimeo link, shown inside the guide.</span>
            <Input name="video" value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://youtu.be/…" data-guide-video-input />
            {videoProblem && <span className="font-normal text-danger">{videoProblem}</span>}
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="primary" size="sm" pending={pending} disabled={Boolean(videoProblem)} data-guide-save>
              Save guide
            </Button>
            <ActionStatus state={state} pending={pending} label="Saved." />
            {state?.error && <span className="text-xs text-danger">{state.error}</span>}
          </div>
        </form>
        )}

          {country && (
            <div className="flex flex-col gap-1 border-t border-border pt-3 text-xs font-medium text-ink" data-guide-country>
              <span className="flex items-center gap-1.5">
                <MapPin aria-hidden className="h-3.5 w-3.5 shrink-0 text-info" />
                Note for {country.label} students
              </span>
              <span className="font-normal text-muted">
                Shown beneath the guide above to {country.label} students only — what this country asks for differently.
              </span>
              <textarea
                value={countryNote}
                onChange={(e) => setCountryNote(e.target.value)}
                maxLength={GUIDE_LIMITS.countryNote}
                rows={2}
                placeholder={`e.g. ${country.label}: it must carry the Hague Apostille.`}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm font-normal text-ink outline-none focus:border-primary"
                data-guide-country-input
              />
              <span className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  pending={noteSave.pending}
                  onClick={() => void noteSave.run(() => saveCountryGuideNote(target, country.destinationId, countryNote))}
                  status={{ state: noteSave.state, label: "Saved.", showError: true }}
                  data-guide-country-save
                >
                  Save {country.label} note
                </Button>
              </span>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-xs font-medium text-muted">What the student sees</p>
          <div className="rounded-xl border border-border bg-card p-4" data-guide-preview>
            <p className="text-sm font-medium text-ink">{name}</p>
            {preview.note && <p className="mt-0.5 text-[13px] leading-snug text-muted">{preview.note}</p>}
            {preview.blocks.length > 0 || preview.sampleUrl || preview.video || preview.countryNotes.length > 0 ? (
              <div className="mt-3 rounded-xl border border-primary/20 bg-primary/[0.03] px-4 py-3.5">
                <DocumentGuideView guide={preview} title={name} />
              </div>
            ) : (
              !preview.note && <p className="mt-2 text-xs text-muted">Nothing written yet — the student sees only the name.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
