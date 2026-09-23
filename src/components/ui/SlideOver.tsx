"use client";

import { useId } from "react";

export function SlideOver({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** For a panel holding a whole document rather than a handful of fields. */
  wide?: boolean;
}) {
  const titleId = useId();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      {/* A dialog to assistive technology, named by its title — without this a
          screen reader was never told a panel had opened. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative flex h-full w-full flex-col bg-card shadow-xl ${wide ? "max-w-3xl" : "max-w-lg"}`}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 id={titleId} className="text-sm font-semibold text-ink">
            {title}
          </h3>
          <button onClick={onClose} className="text-lg text-muted hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>
  );
}
