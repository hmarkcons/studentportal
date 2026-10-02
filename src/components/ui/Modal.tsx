"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

/**
 * A pop-up in the middle of the screen, on the browser's own <dialog>: Escape
 * closes it, focus is held inside while it is open and returned after, and
 * the page behind cannot be clicked. A click on the backdrop closes it too.
 *
 * The contents are rendered only while it is open, so a table with a pop-up
 * on every row carries none of them until one is asked for.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // Escape, and the browser closing it for any other reason.
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`m-auto w-[min(40rem,calc(100vw-2rem))] max-h-[85vh] overflow-hidden rounded-lg border border-border bg-card p-0 text-ink shadow-xl backdrop:bg-black/50 ${className}`}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
            <h3 id={titleId} className="min-w-0 truncate text-sm font-semibold text-ink">
              {title}
            </h3>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-muted hover:bg-bg hover:text-ink">
              <X aria-hidden className="h-4 w-4" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}
