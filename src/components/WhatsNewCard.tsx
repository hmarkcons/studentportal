"use client";

import { useState } from "react";
import { BellRing, CheckCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { NewsItem, postRead } from "@/components/NotificationBell";
import type { Audience, NotificationRow } from "@/lib/notificationText";

const SHOWN = 6;

/**
 * "What's new" on each portal's dashboard: what has happened to this person
 * lately — a message, a document approved, an application moved, a lead
 * assigned — newest first, the unread ones marked. Opening one marks it read;
 * so does "Mark all read". The same list as under the bell.
 */
export function WhatsNewCard({
  news: initial,
  unread: initialUnread,
  audience,
  now,
  className = "",
}: {
  news: NotificationRow[];
  unread: number;
  audience: Audience;
  /** When the list was read, for "5 min ago" — read once, on the server. */
  now: number;
  className?: string;
}) {
  const [news, setNews] = useState(initial);
  const [unread, setUnread] = useState(initialUnread);
  const [all, setAll] = useState(false);

  function markRead(ids: string[] | null) {
    const stamp = new Date().toISOString();
    const cleared = news.filter((n) => !n.read_at && (ids === null || ids.includes(n.id))).length;
    setNews((list) => list.map((n) => (!n.read_at && (ids === null || ids.includes(n.id)) ? { ...n, read_at: stamp } : n)));
    setUnread((u) => (ids === null ? 0 : Math.max(0, u - cleared)));
    postRead(ids);
  }

  const shown = all ? news : news.slice(0, SHOWN);

  return (
    // Card passes on only its class, so the card is marked, and placed, here.
    <div className={className} data-whats-new>
    <Card className="h-full">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <BellRing aria-hidden className="h-4 w-4 shrink-0 text-primary" />
          What&rsquo;s new
          {unread > 0 && (
            <span className="rounded-full bg-danger px-2 py-0.5 text-[11px] font-semibold text-white" data-whats-new-unread={unread}>
              {unread}
            </span>
          )}
        </h3>
        {unread > 0 && (
          <button type="button" onClick={() => markRead(null)} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            <CheckCheck aria-hidden className="h-3.5 w-3.5" />
            Mark all read
          </button>
        )}
      </div>
      {news.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">Nothing new yet. Messages, decisions and updates will show here as they happen.</p>
      ) : (
        <div className="-mx-1.5 flex flex-col">
          {shown.map((n) => (
            <NewsItem key={n.id} n={n} audience={audience} now={now} onOpen={(id) => markRead([id])} />
          ))}
        </div>
      )}
      {news.length > SHOWN && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-1 text-xs font-medium text-primary hover:underline">
          {all ? "Show fewer" : `Show ${news.length - SHOWN} more`}
        </button>
      )}
    </Card>
    </div>
  );
}
