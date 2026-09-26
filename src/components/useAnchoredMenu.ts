"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Places an open dropdown on the screen itself, beside the button that opened
 * it, rather than inside whatever box the button sits in.
 *
 * A row's menu inside a table used to hang from its cell. Now that tables
 * scroll in a window of their own (TableFrame), a menu opened near the
 * window's bottom edge was cut off by it — "View" showing and the rest of the
 * menu hidden below. Fixed to the screen it cannot be clipped; it opens
 * upwards when there is no room below, keeps within the screen sideways,
 * follows its button when anything scrolls, and closes once the button has
 * scrolled out of sight — or on Escape, handing the focus back to the button.
 *
 * The same went for every ⋮ menu: the leads and students lists' opened below
 * its button whatever was there, so the last row's menu opened off the bottom
 * of the screen, and closed the moment anything scrolled to reach it.
 *
 * `portal` renders the menu (and whatever catches clicks outside it) at the
 * top of the page, so no box it happens to sit in — a scrolling table, a
 * transformed panel — can clip it or change what "fixed" is fixed to.
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
    const place = () => {
      const button = anchor.current;
      const m = menu.current;
      if (!button || !m) return;
      const a = button.getBoundingClientRect();
      // Its button scrolled out of sight — past the screen's edge, or past the
      // edge of the table window it sits in: the menu has nothing to hang from.
      const box = button.closest("[data-table-frame]")?.getBoundingClientRect();
      const offScreen = a.bottom < 0 || a.top > window.innerHeight;
      const outOfBox = box ? a.bottom < box.top || a.top > box.bottom || a.right < box.left || a.left > box.right : false;
      if (offScreen || outOfBox) {
        close.current();
        return;
      }
      const gap = 4;
      const margin = 8;
      const below = window.innerHeight - a.bottom;
      const up = below < m.offsetHeight + gap + margin && a.top > below;
      const top = up ? Math.max(margin, a.top - m.offsetHeight - gap) : a.bottom + gap;
      const left = Math.max(margin, Math.min(a.right - m.offsetWidth, window.innerWidth - m.offsetWidth - margin));
      setStyle({ position: "fixed", top, left });
    };
    place();

    // It follows its button when something scrolls or resizes, rather than
    // closing: a table window grows as the page scrolls, which moves its rows
    // a frame after the scroll that caused it, and closing on that shut a
    // menu the moment it opened.
    window.addEventListener("resize", place);
    // Capture, so a scroll inside a table's window counts as well as the page's.
    window.addEventListener("scroll", place, true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close.current();
      anchor.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const portal = (node: React.ReactNode) => (typeof document === "undefined" ? null : createPortal(node, document.body));

  return { anchor, menu, style, portal };
}
