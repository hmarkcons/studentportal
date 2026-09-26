"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

// useLayoutEffect warns during server rendering; the measuring only means
// anything in a browser anyway.
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * A table that scrolls like a spreadsheet.
 *
 * The long lists — leads, registered students, attendance, the audit log —
 * run to hundreds of rows, and a table's sideways scrollbar lives at its
 * bottom: moving across meant scrolling to the end of the page, across, and
 * back up to the row you wanted. So the table gets a window of its own that
 * fits the screen, as Excel's sheet does:
 *
 *   both scrollbars sit on the window's edges, always on screen: the window
 *   ends at the bottom of the screen, and as the page scrolls up it grows
 *   until it fills the screen, so its bottom scrollbar never leaves it;
 *   the heading row stays frozen at the top while the rows move under it;
 *   the column that says whose row it is stays frozen at the left — the first
 *   column, or the cells marked `data-frozen` (DataTable marks the one it is
 *   told to) — so a row is never read without its name.
 *
 * A short table is not boxed: the window only reaches its full height when
 * the table needs it. The page around it scrolls as before, and prints whole.
 *
 * `surface` is what the table sits on — the grey page or a white card — so the
 * frozen cells, which have to be opaque for the rows to slide under them,
 * match what the rest of the table shows through.
 */
export function TableFrame({
  children,
  label,
  className = "",
  surface = "page",
  freezeFirstColumn = true,
}: {
  children: React.ReactNode;
  /** What the table is, for a screen reader: the window is a focusable, scrollable region. */
  label: string;
  className?: string;
  surface?: "page" | "card";
  /** Freeze the first column. Off when the table marks its own frozen cells with data-frozen. */
  freezeFirstColumn?: boolean;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const reserve = useRef<HTMLDivElement>(null);

  // Where on the screen the window starts, so it can end at the bottom of
  // the screen. Measured again as the page scrolls: the window's top moves up,
  // and it grows with it until it fills the screen. A table that starts
  // further down than that is given a minimum height (globals.css) and comes
  // up to the bottom edge as the page scrolls to it.
  //
  // The page has to have room to scroll for that to happen, and a window that
  // stops at the bottom of the screen leaves it none — the page ends there
  // too. So the table reserves, around its window, the height the window will
  // grow to: a screen, or less if the table is shorter. The part not yet
  // filled lies below the bottom of the screen, and the window fills it as
  // the page scrolls.
  useBrowserLayoutEffect(() => {
    const el = frame.current;
    const room = reserve.current;
    if (!el || !room) return;
    let raf = 0;
    let lastTop = -1;
    let lastReserve = -1;
    const apply = () => {
      // Hidden (a closed tab or section) has no position to measure.
      if (!el.offsetParent) return;
      const top = Math.round(Math.max(0, el.getBoundingClientRect().top));
      if (top !== lastTop) {
        lastTop = top;
        el.style.setProperty("--frame-top", `${top}px`);
      }
      // The whole table's height, bars and border included, up to a screen.
      const whole = el.scrollHeight + (el.offsetHeight - el.clientHeight);
      const fill = Math.round(Math.min(whole, window.innerHeight - 16));
      if (fill !== lastReserve) {
        lastReserve = fill;
        room.style.setProperty("--frame-reserve", `${fill}px`);
      }
    };
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(apply);
    };
    // Straight away the first time, before the browser paints, so the window
    // does not open at a guessed height and then jump.
    apply();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    // What sits above the table can change height — a filter bar wrapping,
    // a banner, a section opening — and move where the table starts.
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    observer.observe(el);
    // Rows filtered, paged or added change the table's height inside a window
    // whose own size does not.
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, []);

  // Once the rows have moved under the frozen heading or column, a faint
  // edge shows where they go, as Excel's freeze line does.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onScroll = () => {
      el.toggleAttribute("data-scrolled-x", el.scrollLeft > 0);
      el.toggleAttribute("data-scrolled-y", el.scrollTop > 0);
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div ref={reserve} className="table-frame-reserve">
      <div
        ref={frame}
        role="region"
        aria-label={`${label} (scrolls within its window)`}
        tabIndex={0}
        data-table-frame
        data-surface={surface}
        data-freeze-first={freezeFirstColumn || undefined}
        className={`table-frame ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
