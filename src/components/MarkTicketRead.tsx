"use client";

import { useEffect, useRef } from "react";
import { markTicketRead } from "@/lib/actions/support";

/**
 * Marks a ticket read once, on opening it.
 *
 * A client effect rather than a call during render: a server component must not
 * mutate while rendering, and doing it in the page body would re-mark on every
 * revalidation.
 */
export function MarkTicketRead({ ticketId, side }: { ticketId: string; side: "student" | "staff" }) {
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    // Nothing useful to show the reader if this fails — the flag simply stays
    // until their next visit, which beats an error over a read receipt.
    void markTicketRead(ticketId, side);
  }, [ticketId, side]);

  return null;
}
