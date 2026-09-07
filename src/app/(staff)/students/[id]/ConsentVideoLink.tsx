"use client";

import { useState } from "react";

/**
 * Plays the consent video a student recorded when e-signing. Collapsed by
 * default: this is footage of a person, and it should not autoplay to whoever
 * happens to open the student's page — it is opened deliberately when someone
 * needs to check that a signature is attributable.
 */
export function ConsentVideoLink({ url, version }: { url: string; version: number | null }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center gap-1.5 rounded-md border border-primary px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
      >
        {open ? "Hide consent video" : "▶ Consent video"}
      </button>

      {open && (
        <div className="mt-2 w-full basis-full">
          <video src={url} controls playsInline preload="metadata" className="w-full max-w-md rounded-md bg-black" />
          <p className="mt-1 text-xs text-muted">
            Consent recording for agreement v{version ?? "—"}.{" "}
            <a href={url} target="_blank" rel="noreferrer" className="text-primary underline">
              Open in a new tab
            </a>{" "}
            to download or scrub through it.
          </p>
        </div>
      )}
    </>
  );
}
