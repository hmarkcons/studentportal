"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { useHoverPreview } from "@/components/ui/useHoverPreview";

/**
 * A table cell that keeps to one line: what fits is shown, the rest is cut
 * short with an ellipsis. Resting the pointer on a cut-short value shows the
 * whole of it beside the cell; a click opens it in a pop-up, to read at
 * leisure or copy. A value that fits is plain text — there is nothing more to
 * show, so it does not pretend to be a button.
 *
 * With `href` the value is a link — a lead's or a student's name — and a click
 * follows it; the whole name still shows on hover.
 *
 * Several values — the countries or courses an import has added beside one
 * another, joined by semicolons, or a list passed as `items` — are listed one
 * to a line in the pop-up.
 */
export function LongTextCell({
  text,
  items,
  label,
  rowName,
  widthClassName = "max-w-[12rem]",
  href,
  className = "",
}: {
  text: string | null;
  /** The values `text` was made from, when they are a list joined some other way. */
  items?: string[];
  /** The column, for the pop-up's title. */
  label: string;
  /** Whose row it is — the lead or the student — for the pop-up's title. */
  rowName: string;
  widthClassName?: string;
  /** Makes the value a link, followed on a click, instead of opening the pop-up. */
  href?: string;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [cut, setCut] = useState(false);
  const [open, setOpen] = useState(false);
  // The pop-up is built the first time it is asked for, not with the row: a
  // closed one still rendered an empty <dialog>, and eight to a row came to
  // two of the five kilobytes each leads row weighed.
  const [everOpened, setEverOpened] = useState(false);
  const [copied, setCopied] = useState(false);
  const hover = useHoverPreview(text, cut);

  // Measured rather than guessed from the length: whether it fits depends on
  // the letters and the font. The observer reports once on observing, and
  // again whenever the cell's width changes.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setCut(el.scrollWidth > el.clientWidth + 1));
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);

  if (!text) return <span className="text-muted">—</span>;
  const parts = items ?? text.split(/\s*;\s*/).filter(Boolean);

  function openFull() {
    hover.close();
    setEverOpened(true);
    setOpen(true);
  }

  if (href) {
    return (
      <>
        <Link
          ref={ref as React.Ref<HTMLAnchorElement>}
          href={href}
          prefetch={false}
          className={`block truncate ${widthClassName} font-medium text-ink hover:underline ${className}`}
          data-long-text
          data-cut={cut || undefined}
          {...hover.bind}
        >
          {text}
        </Link>
        {hover.preview}
      </>
    );
  }

  return (
    <>
      <span
        ref={ref as React.Ref<HTMLSpanElement>}
        role={cut ? "button" : undefined}
        tabIndex={cut ? 0 : undefined}
        onClick={cut ? openFull : undefined}
        onKeyDown={
          cut
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openFull();
                }
              }
            : undefined
        }
        aria-label={cut ? `${label} for ${rowName}: ${text} — open to read in full` : undefined}
        className={`block truncate ${widthClassName} ${cut ? "cursor-pointer text-ink decoration-dotted underline-offset-2 hover:text-primary hover:underline" : ""} ${className}`}
        data-long-text
        data-cut={cut || undefined}
        {...hover.bind}
      >
        {text}
      </span>
      {hover.preview}
      {everOpened && (
        <Modal open={open} onClose={() => setOpen(false)} title={`${label} — ${rowName}`}>
          <div data-long-dialog>
            {parts.length > 1 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-ink" data-long-full>
                {parts.map((p, i) => (
                  <li key={i} className="break-words">
                    {p}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="whitespace-pre-wrap break-words text-sm text-ink" data-long-full>
                {text}
              </p>
            )}
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard
                    .writeText(text)
                    .then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    })
                    .catch(() => {});
                }}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink hover:bg-bg"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
