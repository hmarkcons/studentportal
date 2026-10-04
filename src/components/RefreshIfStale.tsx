"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps a list honest after an edit made without reading it again.
 *
 * The leads list's inline edits — status, counsellor, remark, follow-up —
 * answer as soon as the database has the change, and the cell shows it. They
 * used to ask the server for the whole page back with the answer, and a page
 * of 250 leads took nearly two seconds to send, every time anyone changed a
 * status.
 *
 * What that left is the browser's own copy of the page. Going Back to the
 * list shows the copy it holds, which was made before the edit, with the
 * cells' memory of it gone. So every render of a list is told apart by a key
 * the server makes for it; an edit anywhere marks every render already shown
 * as out of date, and a render that comes back on screen marked so is read
 * again. A fresh render has a new key and is left alone.
 */
const seen = new Set<string>();
const stale = new Set<string>();

/** Call after a change that a list already on screen, or held for Back, does not show. */
export function markListsStale() {
  for (const key of seen) stale.add(key);
}

export function RefreshIfStale({ renderKey }: { renderKey: string }) {
  const router = useRouter();
  useEffect(() => {
    seen.add(renderKey);
    if (stale.has(renderKey)) {
      stale.delete(renderKey);
      seen.delete(renderKey);
      router.refresh();
    }
  }, [renderKey, router]);
  return null;
}
