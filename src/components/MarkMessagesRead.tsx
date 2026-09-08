"use client";

import { useEffect, useRef } from "react";
import { markMessagesRead } from "@/lib/actions/messages";

/**
 * Marks the thread read once, on opening the page that shows it.
 *
 * A client effect rather than a call during render: a server component must
 * not mutate while rendering, and doing this in the page body would also mean
 * re-marking on every revalidation.
 */
export function MarkMessagesRead({ studentId, side }: { studentId: string; side: "student" | "staff" }) {
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    // Nothing to show the reader if this fails — the badge simply stays until
    // the next visit, which is better than an error over a read receipt.
    void markMessagesRead(studentId, side);
  }, [studentId, side]);

  return null;
}
