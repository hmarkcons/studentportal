"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlarmClock,
  Bell,
  Building,
  CalendarClock,
  CalendarDays,
  CalendarOff,
  CheckCheck,
  CircleCheck,
  CreditCard,
  FileSearch,
  FileText,
  FolderOpen,
  Gavel,
  Headset,
  IdCard,
  Info,
  MessageCircle,
  MessageSquare,
  Package,
  PenLine,
  PhoneCall,
  TriangleAlert,
  UserPlus,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { BellFeed, BellTodo } from "@/lib/notificationFeed";
import { excerpt, notificationHref, notificationTitle, notificationTone, whenAgo, type Audience, type NotificationRow, type NotificationTone } from "@/lib/notificationText";

/** The icon of each kind of to-do: the staff queue's kinds, the student's, the partner's. */
const TODO_ICON: Record<string, LucideIcon> = {
  deadline: AlarmClock,
  agreement: FileText,
  myagreement: PenLine,
  leave: CalendarOff,
  ticket: Headset,
  message: MessageSquare,
  followup: PhoneCall,
  task: CalendarClock,
  document: FileSearch,
  inventory: Package,
  instalment: CreditCard,
  documents: FolderOpen,
  payments: CreditCard,
  appointment: CalendarDays,
  passport: IdCard,
  profile: UserRound,
  decide: Gavel,
};

export const TONE_ICON: Record<NotificationTone, LucideIcon> = {
  message: MessageCircle,
  good: CircleCheck,
  attention: TriangleAlert,
  assigned: UserPlus,
  info: Info,
};

export const TONE_CLASS: Record<NotificationTone, string> = {
  message: "bg-info-bg text-info",
  good: "bg-success-bg text-success",
  attention: "bg-warning-bg text-warning",
  assigned: "bg-[var(--brand-soft)] text-[var(--brand-strong)]",
  info: "bg-bg text-muted",
};

/** Sends the read marks; the list shows them at once. */
export function postRead(ids: string[] | null) {
  void fetch("/api/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
    keepalive: true,
  }).catch(() => {});
}

/** One thing that happened: what, a line of it, when — bold and dotted until read. */
export function NewsItem({
  n,
  audience,
  now,
  onOpen,
}: {
  n: NotificationRow;
  audience: Audience;
  now: number;
  onOpen: (id: string) => void;
}) {
  const tone = notificationTone(n.kind);
  const Icon = TONE_ICON[tone];
  const unread = !n.read_at;
  const line = n.count > 1 ? null : excerpt(n.body);
  return (
    <Link
      prefetch={false}
      href={notificationHref(n, audience)}
      onClick={() => onOpen(n.id)}
      className={`group flex items-start gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-bg ${unread ? "" : "opacity-75"}`}
      data-notification={n.kind}
      data-unread={unread || undefined}
    >
      <span aria-hidden className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TONE_CLASS[tone]}`}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm leading-snug ${unread ? "font-semibold text-ink" : "text-ink"}`}>{notificationTitle(n)}</span>
        {line && <span className="mt-0.5 block truncate text-xs text-muted">{line}</span>}
        <span className="mt-0.5 block text-[11px] text-muted">{whenAgo(n.updated_at, now)}</span>
      </span>
      {unread && <span aria-label="Unread" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
    </Link>
  );
}

/** One thing to do: the icon of its kind, what, and how pressing. */
export function TodoItem({ t, onOpen }: { t: BellTodo; onOpen?: () => void }) {
  const Icon = TODO_ICON[t.icon] ?? (t.key.startsWith("office:") ? Building : Info);
  const className = `flex items-start gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-bg`;
  const inner = (
    <>
      <span
        aria-hidden
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${t.urgent ? "bg-warning-bg text-warning" : "bg-primary/10 text-primary"}`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm leading-snug ${t.urgent ? "font-medium text-warning" : "text-ink"}`}>{t.text}</span>
        {t.detail && <span className="mt-0.5 block truncate text-xs text-muted">{t.detail}</span>}
      </span>
    </>
  );
  // A document goes through /waiting/open, a route rather than a page.
  return t.plain ? (
    <a href={t.href} onClick={onOpen} className={className} data-todo={t.key}>
      {inner}
    </a>
  ) : (
    <Link prefetch={false} href={t.href} onClick={onOpen} className={className} data-todo={t.key}>
      {inner}
    </Link>
  );
}

/**
 * The bell in every portal's header: how many things are waiting on this
 * person and how many have happened since they last looked, and both lists
 * under it. Asked again every minute and a half while the page is in view,
 * when the window comes back into focus, and shortly after moving to another
 * page — so having just answered a message, the count has caught up.
 */
export function NotificationBell() {
  const [feed, setFeed] = useState<BellFeed | null>(null);
  const [now, setNow] = useState(0);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const box = useRef<HTMLDivElement>(null);
  const asked = useRef(0);

  const load = useCallback(async () => {
    asked.current = Date.now();
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      setFeed((await res.json()) as BellFeed);
      setNow(Date.now());
    } catch {
      // Offline for a moment: the next look will catch up.
    }
  }, []);

  // First look once the page has settled, then on a timer while in view.
  useEffect(() => {
    const first = setTimeout(load, 1200);
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 90_000);
    const onFocus = () => {
      if (Date.now() - asked.current > 20_000) void load();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  // Another page: what was just done there may have cleared something.
  const firstPath = useRef(pathname);
  useEffect(() => {
    if (firstPath.current === pathname) return;
    firstPath.current = pathname;
    const t = setTimeout(load, 2500);
    return () => clearTimeout(t);
  }, [pathname, load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function markRead(ids: string[] | null) {
    setFeed((f) => {
      if (!f) return f;
      const stamp = new Date().toISOString();
      const news = f.news.map((n) => (!n.read_at && (ids === null || ids.includes(n.id)) ? { ...n, read_at: stamp } : n));
      const cleared = f.news.filter((n) => !n.read_at && (ids === null || ids.includes(n.id))).length;
      return { ...f, news, unread: ids === null ? 0 : Math.max(0, f.unread - cleared) };
    });
    postRead(ids);
  }

  const unread = feed?.unread ?? 0;
  const todo = feed?.todoCount ?? 0;
  const count = unread + todo;
  const label = `Notifications: ${unread} new, ${todo} to do`;

  return (
    <div ref={box} className="relative" data-notification-bell>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open && Date.now() - asked.current > 15_000) void load();
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        title={label}
        className="relative rounded-md p-2 text-ink hover:bg-bg"
      >
        <Bell aria-hidden className={`h-5 w-5 ${unread > 0 ? "origin-top animate-[bell-ring_1.2s_ease-in-out_1]" : ""}`} />
        {count > 0 && (
          <span
            className={`absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-white ring-2 ring-card ${
              unread > 0 ? "bg-danger" : "bg-warning"
            }`}
            data-bell-count={count}
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full z-50 mt-2 flex max-h-[min(36rem,calc(100vh-6rem))] w-[min(25rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl"
          data-notification-panel
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-ink">Notifications</p>
            {unread > 0 && (
              <button type="button" onClick={() => markRead(null)} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline" data-mark-all-read>
                <CheckCheck aria-hidden className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
            {!feed && <p className="px-3 py-6 text-center text-sm text-muted">Loading…</p>}

            {feed && (
              <>
                <section aria-label="To do" data-bell-todo>
                  <p className="flex items-center justify-between px-2.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                    To do
                    {todo > 0 && <span className="rounded-full bg-warning-bg px-1.5 py-0.5 text-warning">{todo}</span>}
                  </p>
                  {feed.todos.length === 0 && feed.office.length === 0 && <p className="px-2.5 pb-2 text-xs text-muted">Nothing is waiting on you.</p>}
                  {feed.todos.map((t) => (
                    <TodoItem key={t.key} t={t} onOpen={() => setOpen(false)} />
                  ))}
                  {todo > feed.todos.length && (
                    <Link prefetch={false} href={feed.audience === "staff" ? "/waiting" : feed.home} onClick={() => setOpen(false)} className="block px-2.5 py-1 text-xs font-medium text-primary hover:underline">
                      and {todo - feed.todos.length} more
                    </Link>
                  )}
                  {feed.office.length > 0 && (
                    <>
                      <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Across the office</p>
                      {feed.office.map((t) => (
                        <TodoItem key={t.key} t={t} onOpen={() => setOpen(false)} />
                      ))}
                    </>
                  )}
                </section>

                <section aria-label="What's new" className="mt-1 border-t border-border pt-2" data-bell-news>
                  <p className="flex items-center justify-between px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                    What&rsquo;s new
                    {unread > 0 && <span className="rounded-full bg-danger px-1.5 py-0.5 text-white">{unread}</span>}
                  </p>
                  {feed.news.length === 0 && <p className="px-2.5 pb-2 text-xs text-muted">Nothing new yet.</p>}
                  {feed.news.map((n) => (
                    <NewsItem
                      key={n.id}
                      n={n}
                      audience={feed.audience}
                      now={now}
                      onOpen={(id) => {
                        markRead([id]);
                        setOpen(false);
                      }}
                    />
                  ))}
                </section>
              </>
            )}
          </div>

          {feed && (
            <Link
              prefetch={false}
              href={feed.home}
              onClick={() => setOpen(false)}
              className="border-t border-border px-4 py-2.5 text-center text-xs font-medium text-primary hover:bg-bg"
            >
              See everything on your dashboard
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
