"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A wide table whose sideways scrollbar stays within reach.
 *
 * A table's horizontal scrollbar lives at the bottom of the table. On the
 * leads and registered-students lists that is two hundred rows down, so
 * moving sideways meant scrolling to the end of the page, scrolling across,
 * then scrolling back up to read the row you wanted.
 *
 * This keeps a second scrollbar pinned to the bottom of the window while any
 * part of the table is on screen, and the two are kept in step. It appears
 * only when it earns its place: when the table is actually wider than its
 * box, and when the table's own scrollbar is below the fold. Scroll far
 * enough down that the real one is visible and this one gets out of the way,
 * rather than leaving two bars doing the same job.
 */
export function StickyScrollArea({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const proxy = useRef<HTMLDivElement>(null);
  // Set while one element is being scrolled from the other, so the two do not
  // chase each other.
  const syncing = useRef(false);

  const [contentWidth, setContentWidth] = useState(0);
  const [visible, setVisible] = useState(false);

  /**
   * Whether the pinned bar is worth showing, and how wide its content is.
   *
   * Run on scroll, on resize, and whenever the table's own size changes —
   * filtering a list to three rows should take the bar away, because the real
   * one is on screen by then.
   */
  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;

    const overflowing = el.scrollWidth - el.clientWidth > 1;
    setContentWidth(el.scrollWidth);

    if (!overflowing) {
      setVisible(false);
      return;
    }
    // The real scrollbar sits on the bottom edge of the scroller. If that edge
    // is already on screen there is nothing to solve.
    const bottom = el.getBoundingClientRect().bottom;
    const viewport = window.innerHeight || document.documentElement.clientHeight;
    setVisible(bottom > viewport);
  }, []);

  useEffect(() => {
    measure();

    const el = scroller.current;
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);

    // Rows appearing, a filter narrowing the table, a column of inline editors
    // opening — all change the answer without a scroll or a resize.
    const observer = new ResizeObserver(measure);
    if (el) {
      observer.observe(el);
      if (el.firstElementChild) observer.observe(el.firstElementChild);
    }

    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, [measure]);

  // Keep the pinned bar's position in step with the table when the table is
  // scrolled by any other means — a trackpad swipe, a keyboard, a wide cell
  // being focused.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => {
      if (syncing.current) return;
      const bar = proxy.current;
      if (!bar) return;
      syncing.current = true;
      bar.scrollLeft = el.scrollLeft;
      // Released on the next frame rather than immediately: the assignment
      // above fires the other element's scroll event asynchronously.
      requestAnimationFrame(() => {
        syncing.current = false;
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  function onProxyScroll() {
    if (syncing.current) return;
    const el = scroller.current;
    const bar = proxy.current;
    if (!el || !bar) return;
    syncing.current = true;
    el.scrollLeft = bar.scrollLeft;
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  }

  return (
    <div className={`relative ${className}`}>
      <div ref={scroller} className="overflow-x-auto">
        {children}
      </div>

      {/* Rendered always and hidden with a class rather than unmounted: the
          proxy has to keep its scrollLeft while it is out of the way, or the
          table jumps back to the left the moment it reappears. */}
      <div
        ref={proxy}
        onScroll={onProxyScroll}
        // Hidden from assistive technology on purpose. It is a second handle
        // on a scroll container that is already reachable and already
        // announced; giving it role="scrollbar" would promise aria-valuenow
        // and a controlled element it cannot honestly provide, and would have
        // a screen reader announce the same region twice.
        aria-hidden="true"
        className={`sticky bottom-0 z-20 overflow-x-auto overflow-y-hidden border-t border-border bg-card/95 backdrop-blur-sm sticky-hscroll ${
          visible ? "" : "pointer-events-none invisible h-0 border-t-0"
        }`}
      >
        <div style={{ width: contentWidth, height: 1 }} />
      </div>
    </div>
  );
}
