"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";

/**
 * A table cell that keeps to one line: what fits is shown, the rest is cut
 * short with an ellipsis, and a click on a cut-short value opens the whole of
 * it in a pop-up. A value that fits is plain text — there is nothing more to
 * show, so it does not pretend to be a button.
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
}: {
  text: string | null;
  /** The values `text` was made from, when they are a list joined some other way. */
  items?: string[];
  /** The column, for the pop-up's title. */
  label: string;
  /** Whose row it is — the lead or the student — for the pop-up's title. */
  rowName: string;
  widthClassName?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [cut, setCut] = useState(false);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

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

  return (
    <>
      <span
        ref={ref}
        role={cut ? "button" : undefined}
        tabIndex={cut ? 0 : undefined}
        onClick={cut ? () => setOpen(true) : undefined}
        onKeyDown={
          cut
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpen(true);
                }
              }
            : undefined
        }
        aria-label={cut ? `${label} for ${rowName}: ${text} — open to read in full` : undefined}
        title={cut ? "Click to see it all" : undefined}
        className={`block truncate ${widthClassName} ${cut ? "cursor-pointer text-ink decoration-dotted underline-offset-2 hover:text-primary hover:underline" : ""}`}
        data-long-text
        data-cut={cut || undefined}
      >
        {text}
      </span>
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
    </>
  );
}
