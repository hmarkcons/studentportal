"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** How long the pointer rests on a cell before its whole text is shown: long enough not to flicker as it crosses the table. */
const SHOW_AFTER_MS = 250;
const HIDE_AFTER_MS = 120;

/**
 * The whole of a cut-short value, shown beside it while the pointer rests on
 * it — or while it has keyboard focus — and gone when it leaves.
 *
 * A pointer that moves onto the preview keeps it open, so a long value can be
 * scrolled and copied from. It closes when anything scrolls, since it is
 * placed against where the cell was. Touch has no hover: there, a tap opens
 * the cell's own pop-up as before.
 *
 * Returns the handlers to spread on the cut-short element and the preview to
 * render beside it (into document.body, so no table clips it and it sits above
 * a table opened full screen).
 */
export function useHoverPreview(text: string | null, enabled: boolean) {
  const [at, setAt] = useState<DOMRect | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const show = (el: HTMLElement) => {
    clear();
    timer.current = setTimeout(() => setAt(el.getBoundingClientRect()), SHOW_AFTER_MS);
  };
  const hide = () => {
    clear();
    timer.current = setTimeout(() => setAt(null), HIDE_AFTER_MS);
  };

  useEffect(() => clear, []);
  useEffect(() => {
    if (!at) return;
    const close = () => setAt(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [at]);

  const bind = enabled
    ? {
        onPointerEnter: (e: React.PointerEvent<HTMLElement>) => {
          if (e.pointerType === "mouse") show(e.currentTarget);
        },
        onPointerLeave: hide,
        onFocus: (e: React.FocusEvent<HTMLElement>) => {
          if (e.currentTarget.matches(":focus-visible")) show(e.currentTarget);
        },
        onBlur: hide,
      }
    : {};

  let preview: React.ReactNode = null;
  if (at && text && typeof document !== "undefined") {
    const width = Math.min(448, window.innerWidth - 16);
    const left = Math.max(8, Math.min(at.left, window.innerWidth - width - 8));
    // Below the cell, unless that would run off the bottom of the screen.
    const below = window.innerHeight - at.bottom > 220;
    preview = createPortal(
      <div
        role="tooltip"
        data-hover-preview
        onPointerEnter={clear}
        onPointerLeave={hide}
        style={{
          position: "fixed",
          left,
          maxWidth: width,
          ...(below ? { top: at.bottom + 4 } : { bottom: window.innerHeight - at.top + 4 }),
        }}
        className="z-[70] max-h-[50vh] overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border bg-card px-3 py-2 text-sm text-ink shadow-lg"
      >
        {text}
      </div>,
      document.body
    );
  }

  const close = () => {
    clear();
    setAt(null);
  };
  return { bind, preview, close };
}
