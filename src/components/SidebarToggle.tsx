"use client";

import { useState } from "react";

const KEY = "hmark-sidebar";

function isHidden(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute("data-sidebar") === "hidden";
}

/**
 * Puts the left-hand menu away, and brings it back.
 *
 * The menu is 16rem of every page and the wide tables underneath it — leads,
 * registered students, referrals, the scholarship directory — all scroll
 * sideways, so that width is worth being able to reclaim.
 *
 * The choice lives on the <html> element and in localStorage rather than in
 * React state. It has to survive navigation (every page is a fresh server
 * render) and it has to be applied before the first paint, or the page draws
 * with the menu and then shoves itself sideways. suppressHydrationWarning
 * because the server cannot know which way round it is.
 */
export function SidebarToggle({ variant }: { variant: "hide" | "show" }) {
  const [hidden, setHidden] = useState(isHidden);

  function set(next: boolean) {
    setHidden(next);
    try {
      if (next) {
        document.documentElement.setAttribute("data-sidebar", "hidden");
        localStorage.setItem(KEY, "hidden");
      } else {
        document.documentElement.removeAttribute("data-sidebar");
        localStorage.removeItem(KEY);
      }
    } catch {
      // A browser refusing storage still gets the toggle for this page.
    }
  }

  if (variant === "hide") {
    // A bare « in muted grey read as decoration, so nobody found it. Bordered,
    // labelled and at the same contrast as the menu items it sits above: it is
    // a control, and it should look like one.
    return (
      <button
        type="button"
        onClick={() => set(true)}
        title="Hide the menu"
        aria-label="Hide the menu"
        className="hidden shrink-0 items-center gap-1 rounded-md border border-sidebar-border bg-sidebar-active-bg px-2 py-1.5 text-xs font-semibold text-sidebar-ink transition-colors hover:border-sidebar-ink hover:bg-sidebar-border md:inline-flex"
      >
        <span aria-hidden className="text-sm leading-none">&laquo;</span>
        Hide
      </button>
    );
  }

  // Rendered in the header and hidden by CSS until the menu is away, so the
  // button appears the moment the page paints rather than after hydration.
  //
  // Labelled for the same reason as Hide: a lone ☰ in a header full of other
  // controls is where the menu goes to be lost.
  return (
    <button
      type="button"
      data-sidebar-show
      suppressHydrationWarning
      onClick={() => set(false)}
      title="Show the menu"
      aria-label="Show the menu"
      aria-expanded={!hidden}
      className="hidden shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-ink hover:bg-bg md:inline-flex"
    >
      <span aria-hidden className="text-sm leading-none">&#9776;</span>
      Menu
    </button>
  );
}
