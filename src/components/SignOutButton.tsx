"use client";

import { useState } from "react";
import { VARIANT_CLASSES, SIZE_CLASSES, type ButtonVariant, type ButtonSize } from "./ui/Button";

// Deliberately a plain fetch() to a Route Handler, not a Server Action —
// signOut used to be one, but it lives on the shared AppShell rendered by
// every staff/portal page, so its action reference was bundled together
// with whatever action THAT page's own form used. A confirmed Next.js/
// Turbopack bug can then resolve a page's own submit to the wrong bundled
// action id, which for this pairing meant a form submission unexpectedly
// running signOut instead — signing the user out and bouncing them to
// /login. Moving sign-out off the Server Actions mechanism entirely removes
// it from that shared bundle, so it can no longer be the wrong target of a
// misresolved page action.
export function SignOutButton({
  className,
  variant,
  size,
  children,
}: {
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: React.ReactNode;
}) {
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);
    await fetch("/api/sign-out", { method: "POST" });
    // Full reload rather than a client-side route change, so no stale
    // client-cached state survives into the logged-out view.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  }

  const styledClassName = variant
    ? `inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size ?? "md"]} ${className ?? ""}`
    : className;

  return (
    <button type="button" onClick={handleSignOut} disabled={pending} className={styledClassName}>
      {pending ? "…" : children}
    </button>
  );
}
