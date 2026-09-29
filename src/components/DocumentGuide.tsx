"use client";

import { BookOpen, ChevronDown, ExternalLink, FileText, MapPin } from "lucide-react";
import type { GuideBlock, GuideInline } from "@/lib/documentGuide";
import type { ResolvedGuide } from "@/lib/documentGuides";

/**
 * A document's guide, drawn from the blocks src/lib/documentGuide.ts parsed —
 * elements built here, never HTML from the database, so a guide can only ever
 * be words, lists and links.
 */

function Inline({ parts }: { parts: GuideInline[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.kind === "bold" ? (
          <strong key={i} className="font-semibold text-ink">
            {p.text}
          </strong>
        ) : p.kind === "link" ? (
          <a key={i} href={p.href} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline-offset-2 hover:underline">
            {p.text}
          </a>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  );
}

export function GuideBlocks({ blocks }: { blocks: GuideBlock[] }) {
  return (
    <div className="flex flex-col gap-2.5 text-sm leading-relaxed text-ink/90" data-guide-blocks>
      {blocks.map((b, i) => {
        if (b.kind === "heading") {
          return (
            <p key={i} className="pt-1 text-sm font-semibold text-ink">
              <Inline parts={b.text} />
            </p>
          );
        }
        if (b.kind === "steps") {
          return (
            <ol key={i} className="flex list-decimal flex-col gap-1 pl-5 marker:font-semibold marker:text-primary">
              {b.items.map((item, j) => (
                <li key={j} className="pl-1">
                  <Inline parts={item} />
                </li>
              ))}
            </ol>
          );
        }
        if (b.kind === "bullets") {
          return (
            <ul key={i} className="flex list-disc flex-col gap-1 pl-5 marker:text-primary">
              {b.items.map((item, j) => (
                <li key={j} className="pl-1">
                  <Inline parts={item} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            {b.lines.map((line, j) => (
              <span key={j}>
                {j > 0 && <br />}
                <Inline parts={line} />
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

const IMAGE = /\.(jpe?g|png|webp|gif)$/i;

/** Everything past the note: the written guide, the sample, the video, and this student's country notes. */
export function DocumentGuideView({ guide, title }: { guide: ResolvedGuide; title: string }) {
  return (
    <div className="flex flex-col gap-4">
      {guide.blocks.length > 0 && <GuideBlocks blocks={guide.blocks} />}

      {guide.countryNotes.length > 0 && (
        <div className="flex flex-col gap-1.5" data-guide-country-notes>
          {guide.countryNotes.map((n) => (
            <p key={n.destinationId} className="flex items-start gap-2 rounded-lg border border-info/30 bg-info-bg px-3 py-2 text-xs text-info">
              <MapPin aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <span className="font-semibold">{n.destinationName}:</span> {n.note}
              </span>
            </p>
          ))}
        </div>
      )}

      {(guide.sampleUrl || guide.video) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
          {guide.sampleUrl && (
            <a
              href={guide.sampleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex w-fit flex-col gap-1.5 rounded-lg border border-border bg-card p-2 text-xs font-medium text-primary hover:border-primary"
              data-guide-sample
            >
              {IMAGE.test(guide.sampleName ?? "") && (
                // A correct example is worth seeing before choosing a file, not after opening another tab.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={guide.sampleUrl} alt={`A correct sample: ${title}`} className="max-h-40 w-auto rounded-md object-contain" loading="lazy" />
              )}
              <span className="inline-flex items-center gap-1.5">
                <FileText aria-hidden className="h-3.5 w-3.5 shrink-0" />
                See a correct sample
                <ExternalLink aria-hidden className="h-3 w-3 shrink-0 opacity-70" />
              </span>
            </a>
          )}
          {guide.video && (
            <div className="flex w-full max-w-md flex-col gap-1" data-guide-video>
              <div className="aspect-video w-full overflow-hidden rounded-lg border border-border bg-black">
                <iframe
                  src={guide.video.embedUrl}
                  title={`Video: how to prepare ${title}`}
                  className="h-full w-full"
                  loading="lazy"
                  allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                  allowFullScreen
                />
              </div>
              <a href={guide.video.watchUrl} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1 text-xs text-muted hover:text-primary">
                Watch on {guide.video.provider === "youtube" ? "YouTube" : "Vimeo"}
                <ExternalLink aria-hidden className="h-3 w-3 shrink-0" />
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Whether a guide has more than its note — something to open. */
export function guideHasMore(guide: ResolvedGuide | null | undefined): boolean {
  return Boolean(guide && (guide.blocks.length > 0 || guide.sampleUrl || guide.video || guide.countryNotes.length > 0));
}

/** "How to prepare this", which opens the guide beneath its document. */
export function DocumentGuideToggle({ open, onToggle, controls }: { open: boolean; onToggle: () => void; controls: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      className="inline-flex w-fit items-center gap-1 rounded-md text-xs font-medium text-primary hover:underline"
      data-guide-toggle
    >
      <BookOpen aria-hidden className="h-3.5 w-3.5 shrink-0" />
      How to prepare this
      <ChevronDown aria-hidden className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
  );
}

/** The opened guide, under its document's row. */
export function DocumentGuidePanel({ id, guide, title }: { id: string; guide: ResolvedGuide; title: string }) {
  return (
    <div id={id} className="rounded-xl border border-primary/20 bg-primary/[0.03] px-4 py-3.5" data-document-guide>
      <DocumentGuideView guide={guide} title={title} />
    </div>
  );
}
