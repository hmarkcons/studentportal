"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Never smaller than this, or the thumb on a very wide table is un-grabbable. */
const MIN_THUMB = 44;

/**
 * A wide table whose sideways scrollbar stays within reach.
 *
 * A table's horizontal scrollbar lives at the bottom of the table. On the
 * leads and registered-students lists that is two hundred rows down, so
 * moving sideways meant scrolling to the end of the page, scrolling across,
 * then scrolling back up to read the row you wanted.
 *
 * This pins a bar to the bottom of the window while any part of the table is
 * on screen. It shows only when it earns its place: when the table really is
 * wider than its box, and when the table's own scrollbar is below the fold.
 * Scroll far enough that the real one is visible, or filter the list down to
 * three rows, and this one gets out of the way rather than leaving two bars
 * doing the same job.
 *
 * The thumb is drawn rather than borrowed from a second native scroller. A
 * native one cannot be relied on to be visible when nobody is touching it —
 * macOS and most touchpad-only machines use overlay scrollbars that fade out,
 * and Chromium ignores ::-webkit-scrollbar sizing once scrollbar-width is set.
 * A bar you cannot see is exactly the problem this is here to fix, so it is
 * drawn: always visible, the same on every platform, and testable.
 */
export function StickyScrollArea({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);

  const [visible, setVisible] = useState(false);
  const [thumb, setThumb] = useState({ width: 0, left: 0 });
  const [dragging, setDragging] = useState(false);

  /**
   * Whether the bar is worth showing, and where its thumb sits.
   *
   * Run on both scrolls, on resize, and whenever the table's own size changes
   * — a filter narrowing the list changes the answer without either.
   */
  const measure = useCallback(() => {
    const el = scroller.current;
    const rail = track.current;
    if (!el) return;

    const maxScroll = el.scrollWidth - el.clientWidth;
    if (maxScroll <= 1) {
      setVisible(false);
      return;
    }

    // The table's own scrollbar sits on its bottom edge. If that edge is on
    // screen there is nothing to solve.
    const viewport = window.innerHeight || document.documentElement.clientHeight;
    setVisible(el.getBoundingClientRect().bottom > viewport);

    const railWidth = rail?.clientWidth ?? 0;
    if (railWidth === 0) return;
    const width = Math.max(MIN_THUMB, Math.round((el.clientWidth / el.scrollWidth) * railWidth));
    const left = Math.round((railWidth - width) * (el.scrollLeft / maxScroll));
    setThumb({ width, left });
  }, []);

  useEffect(() => {
    measure();
    const el = scroller.current;

    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    el?.addEventListener("scroll", measure, { passive: true });

    const observer = new ResizeObserver(measure);
    if (el) {
      observer.observe(el);
      if (el.firstElementChild) observer.observe(el.firstElementChild);
    }
    if (track.current) observer.observe(track.current);

    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      el?.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure]);

  /** Puts the thumb's centre at a point on the rail, and the table with it. */
  const scrollToPointer = useCallback((clientX: number) => {
    const el = scroller.current;
    const rail = track.current;
    if (!el || !rail) return;
    const rect = rail.getBoundingClientRect();
    const width = Math.max(MIN_THUMB, (el.clientWidth / el.scrollWidth) * rect.width);
    const usable = rect.width - width;
    if (usable <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left - width / 2) / usable));
    el.scrollLeft = ratio * (el.scrollWidth - el.clientWidth);
  }, []);

  // Dragging continues outside the bar, which is what a scrollbar does — let
  // go of the pointer and it stops, wherever the cursor happens to be.
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      e.preventDefault();
      scrollToPointer(e.clientX);
    };
    const stop = () => setDragging(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [dragging, scrollToPointer]);

  return (
    <div className={`relative ${className}`}>
      <div ref={scroller} className="overflow-x-auto">
        {children}
      </div>

      {/* Hidden with a class rather than unmounted: measuring the rail needs
          it in the layout, and unmounting would make the thumb jump the first
          time it reappeared. Hidden from assistive technology because it is a
          second handle on a container that is already reachable and already
          announced. */}
      <div
        aria-hidden="true"
        data-sticky-bar
        className={`sticky bottom-0 z-20 select-none border-t border-border bg-card/95 px-1 py-1 backdrop-blur-sm ${
          visible ? "" : "pointer-events-none invisible h-0 overflow-hidden border-t-0 p-0"
        }`}
      >
        <div
          ref={track}
          data-sticky-rail
          onPointerDown={(e) => {
            // Anywhere on the rail: jump there, then keep following the
            // pointer, so a click and a drag are the same gesture.
            e.preventDefault();
            scrollToPointer(e.clientX);
            setDragging(true);
          }}
          className="relative h-2.5 w-full cursor-pointer rounded-full bg-bg"
        >
          <div
            style={{ width: thumb.width, transform: `translateX(${thumb.left}px)` }}
            className={`absolute inset-y-0 left-0 rounded-full transition-colors ${
              dragging ? "bg-muted" : "bg-border hover:bg-muted"
            }`}
          />
        </div>
      </div>
    </div>
  );
}
