"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import { loadCalendarNotifications } from "@/lib/actions/calendarEvents";
import { formatClock, longDate } from "@/lib/calendarLayout";
import { notifyLabel, type DueNotification } from "@/lib/calendarRecurrence";

/** How often the list is read again, so an item added in another tab is not missed for long. */
const REFRESH_MS = 10 * 60_000;
const SEEN_PREFIX = "calendar-notified:";
/** More than this at once and the oldest go. */
const MAX_SHOWN = 3;

function whenText(n: DueNotification): string {
  const at = n.timed ? formatClock(n.startMinutes) : longDate(n.date);
  if (n.minutes === 0) return n.timed ? `Now · ${at}` : `Today · ${at}`;
  return `In ${notifyLabel(n.minutes).replace(" before", "")} · ${at}`;
}

/**
 * Says so when one of your own calendar items is due to be reminded of — at
 * the time you chose in its Notification, while any portal page is open.
 *
 * The daily email cannot do this: Vercel runs the crons once a day, and a
 * reminder "30 minutes before" has to be said at a particular minute. So the
 * staff layout keeps this mounted; it reads the next day's notifications, sets
 * a timer for each, and when one comes due shows a card in the corner — and a
 * system notification too, if the person turned those on from the calendar.
 * The browser is never asked for permission from here, only from that button.
 *
 * The card stays until it is closed. The app's toasts go after four seconds,
 * which suits "Saved." and not "your interview is in ten minutes".
 *
 * Each is said once, even with the portal open in several tabs: the first tab
 * to reach it marks it in localStorage and the others see the mark. One whose
 * moment passed while the laptop slept is still said on waking, as long as
 * the item has not begun.
 */
export function CalendarNotifier() {
  const [shown, setShown] = useState<DueNotification[]>([]);

  useEffect(() => {
    let timers: number[] = [];
    let cancelled = false;

    function fire(n: DueNotification) {
      const key = SEEN_PREFIX + n.key;
      try {
        if (window.localStorage.getItem(key)) return;
        window.localStorage.setItem(key, String(Date.now()));
      } catch {
        // Storage refused: better twice than never.
      }
      setShown((list) => [...list.filter((x) => x.key !== n.key), n].slice(-MAX_SHOWN));
      if ("Notification" in window && Notification.permission === "granted") {
        try {
          new Notification(n.title, { body: `${whenText(n)}\nHMARK calendar`, tag: n.key });
        } catch {
          // Some mobile browsers only notify from a service worker; the card has said it.
        }
      }
    }

    function forgetOld() {
      // Marks for notifications more than two days old have done their job.
      try {
        const cutoff = Date.now() - 2 * 86_400_000;
        for (let i = window.localStorage.length - 1; i >= 0; i--) {
          const k = window.localStorage.key(i);
          if (k?.startsWith(SEEN_PREFIX) && Number(window.localStorage.getItem(k)) < cutoff) window.localStorage.removeItem(k);
        }
      } catch {
        // Nothing to tidy.
      }
    }

    async function refresh() {
      let due: DueNotification[];
      try {
        due = await loadCalendarNotifications();
      } catch {
        return; // Offline or signed out: the next refresh tries again.
      }
      if (cancelled) return;
      timers.forEach((t) => window.clearTimeout(t));
      timers = [];
      const now = Date.now();
      for (const n of due) {
        if (n.startsAt <= now) continue;
        const wait = n.notifyAt - now;
        if (wait <= 0) fire(n);
        else timers.push(window.setTimeout(() => fire(n), wait));
      }
    }

    forgetOld();
    // Not while the page is still arriving. The first read is a server action,
    // which is a request of its own through the proxy's checks, and made on
    // mount it went out while the page it sits on was still streaming in — on
    // every full load of every staff page. Nothing it could say is due in the
    // next second, so it waits for the page to finish and the browser to be
    // idle.
    let firstRead: number | undefined;
    // Safari has no requestIdleCallback.
    const idle = window.requestIdleCallback ?? ((cb: () => void, _options?: IdleRequestOptions) => window.setTimeout(cb, 1500));
    const startReading = () => {
      firstRead = idle(() => void refresh(), { timeout: 5000 }) as number;
    };
    if (document.readyState === "complete") startReading();
    else window.addEventListener("load", startReading, { once: true });
    const interval = window.setInterval(() => void refresh(), REFRESH_MS);
    const onChange = () => void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("calendar:changed", onChange);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
      window.clearInterval(interval);
      window.removeEventListener("load", startReading);
      if (firstRead !== undefined) (window.cancelIdleCallback ?? window.clearTimeout)(firstRead);
      window.removeEventListener("calendar:changed", onChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (shown.length === 0) return null;
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-20 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:left-4 sm:items-start">
      {shown.map((n) => (
        <div
          key={n.key}
          role="status"
          data-calendar-notification
          className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-border bg-card p-3 text-sm text-ink shadow-xl"
        >
          <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <BellRing className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{n.title}</p>
            <p className="text-xs text-muted">{whenText(n)}</p>
            <Link
              href={`/calendar?view=day&date=${n.date}`}
              prefetch={false}
              onClick={() => setShown((list) => list.filter((x) => x.key !== n.key))}
              className="mt-1 inline-flex w-fit text-xs font-medium text-primary hover:underline"
            >
              Open in the calendar
            </Link>
          </div>
          <button
            type="button"
            onClick={() => setShown((list) => list.filter((x) => x.key !== n.key))}
            aria-label="Dismiss"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
