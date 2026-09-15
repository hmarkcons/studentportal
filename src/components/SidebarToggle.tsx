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
    // A bare « in muted grey at p-1 read as decoration and nobody found it.
    // The answer is the same arrow, large and in the brand green — a coloured
    // 24px glyph carries on its own, where a 12px grey one did not.
    return (
      <button
        type="button"
        onClick={() => set(true)}
        title="Hide the menu"
        aria-label="Hide the menu"
        className="hidden shrink-0 items-center justify-center rounded-md px-1.5 py-0.5 text-2xl leading-none text-primary transition-colors hover:bg-sidebar-active-bg md:inline-flex"
      >
        &laquo;
      </button>
    );
  }

  // Rendered in the header and hidden by CSS until the menu is away, so the
  // button appears the moment the page paints rather than after hydration.
  //
  // Matched to Hide: the same size and the same green, pointing the other way.
  // A prominent Hide with an unfindable Show would be worse than neither.
  return (
    <button
      type="button"
      data-sidebar-show
      suppressHydrationWarning
      onClick={() => set(false)}
      title="Show the menu"
      aria-label="Show the menu"
      aria-expanded={!hidden}
      className="hidden shrink-0 items-center justify-center rounded-md px-1.5 py-0.5 text-2xl leading-none text-primary transition-colors hover:bg-bg md:inline-flex"
    >
      &raquo;
    </button>
  );
}
