"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Anchor } from "../types";

/**
 * A card that opens beside what was clicked, as Google's do: below the point
 * when there is room, above it near the bottom of the screen, and never off
 * either side. Positioned with CSS alone (clamp and calc on the anchor), so it
 * never has to measure itself after it renders.
 *
 * Rendered into <body>: the student portal animates its cards into place,
 * and a fixed element inside a transformed one is positioned against that
 * element rather than the screen.
 *
 * Escape and a press anywhere outside close it; focus goes to its first field
 * or button on opening and back to where it was on closing.
 */
export function Popover({
  anchor,
  onClose,
  label,
  width = 380,
  children,
}: {
  anchor: Anchor;
  onClose: () => void;
  label: string;
  width?: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = ref.current?.querySelector<HTMLElement>("[data-autofocus]") ?? ref.current?.querySelector<HTMLElement>("input, select, textarea, button, a[href]");
    first?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
      }
    }
    function onDown(e: PointerEvent) {
      const target = e.target as Node | null;
      if (!ref.current || !target || ref.current.contains(target)) return;
      // A toast is not "somewhere else on the calendar".
      if (target instanceof Element && target.closest("[data-toast]")) return;
      closeRef.current();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown, true);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  const style: React.CSSProperties = {
    width: `min(${width}px, calc(100vw - 16px))`,
    left: `clamp(8px, ${Math.round(anchor.x - width / 2)}px, calc(100vw - min(${width}px, calc(100vw - 16px)) - 8px))`,
    ...(anchor.above
      ? { bottom: `calc(100vh - ${Math.round(anchor.y) - 8}px)`, maxHeight: `${Math.max(Math.round(anchor.y) - 16, 200)}px` }
      : { top: `${Math.round(anchor.y) + 8}px`, maxHeight: `max(200px, calc(100vh - ${Math.round(anchor.y) + 16}px))` }),
  };

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      data-calendar-popover
      data-full-width
      className="fixed z-50 overflow-y-auto rounded-2xl border border-border bg-card text-ink shadow-2xl shadow-black/20"
      style={style}
    >
      {children}
    </div>,
    document.body
  );
}

/** A round icon button for a popover's corner: Edit, Delete, Close. */
export function IconButton({
  label,
  onClick,
  children,
  tone = "default",
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "default" | "danger";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors disabled:opacity-40 ${
        tone === "danger" ? "hover:bg-danger-bg hover:text-danger" : "hover:bg-bg hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
