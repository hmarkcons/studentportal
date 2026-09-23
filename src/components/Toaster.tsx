"use client";

import { useSyncExternalStore } from "react";
import { currentToasts, dismissToast, subscribeToasts, type Toast } from "@/lib/toast";

const EMPTY: Toast[] = [];

/**
 * Where toasts appear: bottom centre on a phone, bottom right otherwise, above
 * everything. Mounted once in the root layout, so a toast raised just before a
 * navigation is still showing after it.
 *
 * Announced politely rather than as an alert: "Deleted." confirms what the
 * person asked for, and interrupting a screen reader for it would be rude.
 */
export function Toaster() {
  const toasts = useSyncExternalStore(subscribeToasts, currentToasts, () => EMPTY);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:items-end"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          data-toast={t.tone}
          className={`pointer-events-auto flex max-w-sm items-center gap-3 rounded-md border px-3 py-2 text-sm font-medium shadow-lg ${
            t.tone === "danger" ? "border-danger bg-danger-bg text-danger" : "border-success bg-success-bg text-success"
          }`}
        >
          <span>{t.message}</span>
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            aria-label="Dismiss"
            className="w-fit rounded px-1 text-xs opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
