"use client";

import { useSyncExternalStore } from "react";
import { hmarkSignInLink } from "@/lib/portalLink";

const subscribe = () => () => {};

/**
 * HMARK's own sign-in page, for a login to this portal — a student's, a staff
 * member's, a university's. Never typed and never stored: it is this portal's
 * own address, read from the page it is on, so it cannot point anywhere wrong.
 * Drawn once the page is in the browser, where that address is known.
 */
export function HmarkSignInLink({ className = "text-primary hover:underline" }: { className?: string }) {
  const origin = useSyncExternalStore(subscribe, () => window.location.origin, () => null);
  if (!origin) return null;
  const href = hmarkSignInLink(origin);
  return (
    <a href={href} target="_blank" rel="noreferrer" data-hmark-sign-in className={`break-all ${className}`}>
      {href}
    </a>
  );
}
