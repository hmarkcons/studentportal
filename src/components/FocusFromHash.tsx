"use client";

import { useEffect } from "react";

/**
 * Brings the element the address names (#login-…) into view and lights it up
 * for a moment, so a student who picked one login on the Dashboard lands on
 * it rather than at the top of the list.
 *
 * Not :target, which a client-side navigation does not set: Next changes the
 * address with pushState, and the browser only matches :target on a real load
 * or a hash change. The element carries data-focused while lit, for its own
 * classes to answer to.
 */
export function FocusFromHash({ ms = 2600 }: { ms?: number }) {
  useEffect(() => {
    let timer: number | undefined;
    function focus() {
      const id = decodeURIComponent(window.location.hash.slice(1));
      const el = id ? document.getElementById(id) : null;
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.setAttribute("data-focused", "");
      window.clearTimeout(timer);
      timer = window.setTimeout(() => el.removeAttribute("data-focused"), ms);
    }
    focus();
    window.addEventListener("hashchange", focus);
    return () => {
      window.removeEventListener("hashchange", focus);
      window.clearTimeout(timer);
    };
  }, [ms]);
  return null;
}
