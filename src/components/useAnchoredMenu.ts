"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Places an open dropdown on the screen itself, beside the button that opened
 * it, rather than inside whatever box the button sits in.
 *
 * A row's menu inside a table used to hang from its cell. Now that tables
 * scroll in a window of their own (TableFrame), a menu opened near the
 * window's bottom edge was cut off by it — "View" showing and the rest of the
 * menu hidden below. Fixed to the screen it cannot be clipped; it opens
 * upwards when there is no room below, keeps within the screen sideways, and
 * closes when anything scrolls, since it would otherwise stay put while its
 * row moved away.
 */
export function useAnchoredMenu<A extends HTMLElement = HTMLButtonElement>(open: boolean, onClose: () => void) {
  const anchor = useRef<A>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ position: "fixed", visibility: "hidden" });
  // The latest onClose, without re-placing the menu every time it changes.
  const close = useRef(onClose);
  useBrowserLayoutEffect(() => {
    close.current = onClose;
  });

  useBrowserLayoutEffect(() => {
    if (!open) {
      setStyle({ position: "fixed", visibility: "hidden" });
      return;
    }
    const a = anchor.current?.getBoundingClientRect();
    const m = menu.current;
    if (!a || !m) return;
    const gap = 4;
    const margin = 8;
    const below = window.innerHeight - a.bottom;
    const up = below < m.offsetHeight + gap + margin && a.top > below;
    const top = up ? Math.max(margin, a.top - m.offsetHeight - gap) : a.bottom + gap;
    const left = Math.max(margin, Math.min(a.right - m.offsetWidth, window.innerWidth - m.offsetWidth - margin));
    setStyle({ position: "fixed", top, left });

    // Only once the button has really moved: a scroll that finished just
    // before the click still delivers its event a frame later, and closing
    // on that shut the menu the moment it opened.
    const dismiss = () => {
      const now = anchor.current?.getBoundingClientRect();
      if (!now || Math.abs(now.top - a.top) > 2 || Math.abs(now.left - a.left) > 2) close.current();
    };
    window.addEventListener("resize", dismiss);
    // Capture, so a scroll inside a table's window counts as well as the page's.
    window.addEventListener("scroll", dismiss, true);
    return () => {
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [open]);

  return { anchor, menu, style };
}
