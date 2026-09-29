"use client";

import { useState } from "react";
import { Bell, BellOff, BellRing, ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { parseYMD } from "@/lib/calendarDates";
import { Button } from "@/components/ui/Button";
import { useNotificationAccess } from "../hooks";
import { eventColor } from "../eventColors";
import type { KindDef } from "../kinds";
import { MiniMonth } from "../views/MiniMonth";

/**
 * Asks for desktop notifications, but only when this is pressed — a browser
 * prompt on page load is refused by reflex and then cannot be asked again.
 * Reminders show inside the portal either way; this adds the system one.
 */
export function NotificationToggle() {
  const [access, ask] = useNotificationAccess();
  if (access === "unknown") return null;
  return (
    <div className="flex flex-col gap-1.5" data-notification-access={access}>
      {access === "default" && (
        <Button type="button" variant="outline" size="sm" onClick={() => void ask()}>
          <Bell aria-hidden className="h-3.5 w-3.5 shrink-0" />
          Turn on desktop notifications
        </Button>
      )}
      {access === "granted" && (
        <p className="flex items-center gap-2 text-xs font-medium text-success">
          <BellRing aria-hidden className="h-3.5 w-3.5 shrink-0" />
          Desktop notifications are on
        </p>
      )}
      {access === "denied" && (
        <p className="flex items-center gap-2 text-xs text-muted">
          <BellOff aria-hidden className="h-3.5 w-3.5 shrink-0" />
          Blocked in this browser&apos;s site settings
        </p>
      )}
      <p className="text-[11px] leading-snug text-muted">
        {access === "unsupported"
          ? "This browser cannot show desktop notifications. Reminders still appear in the portal while it is open."
          : "Reminders for your own items appear while the portal is open in a tab."}
      </p>
    </div>
  );
}

export function Sidebar({
  open,
  onClose,
  canCreate,
  onCreate,
  todayStr,
  selected,
  inView,
  marked,
  onPick,
  kinds,
  hidden,
  onToggleKind,
  counts,
  extra,
  showNotifications,
}: {
  open: boolean;
  onClose: () => void;
  canCreate: boolean;
  onCreate: () => void;
  todayStr: string;
  selected: string;
  inView: ReadonlySet<string>;
  marked: ReadonlySet<string>;
  onPick: (date: string) => void;
  kinds: readonly KindDef[];
  hidden: ReadonlySet<string>;
  onToggleKind: (kind: string, hidden: boolean) => void;
  counts: Record<string, number>;
  extra?: React.ReactNode;
  showNotifications: boolean;
}) {
  // The month the little calendar shows follows the calendar's own day, and
  // its arrows browse without moving the main view — as in Google.
  const sel = parseYMD(selected);
  const selKey = sel.getUTCFullYear() * 12 + sel.getUTCMonth();
  const [shown, setShown] = useState(selKey);
  const [seenKey, setSeenKey] = useState(selKey);
  if (selKey !== seenKey) {
    setSeenKey(selKey);
    setShown(selKey);
  }
  const [kindsOpen, setKindsOpen] = useState(true);

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={onClose} aria-hidden />}
      <aside
        data-calendar-sidebar
        className={`${
          open ? "fixed inset-y-0 left-0 z-40 flex w-72 shadow-2xl" : "hidden"
        } flex-col gap-6 overflow-y-auto border-r border-border bg-card p-4 lg:static lg:z-auto lg:flex lg:w-64 lg:shrink-0 lg:shadow-none`}
      >
        <div className="flex items-center justify-between gap-2">
          {canCreate ? (
            <button
              type="button"
              onClick={onCreate}
              data-calendar-create
              className="flex w-fit items-center gap-3 rounded-2xl bg-card py-3.5 pl-4 pr-6 text-sm font-semibold text-ink shadow-md ring-1 ring-border transition-shadow hover:shadow-lg"
            >
              <Plus aria-hidden className="h-6 w-6 shrink-0 text-primary" strokeWidth={2.5} />
              Create
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Hide the calendar sidebar"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-bg lg:hidden"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>

        <MiniMonth
          year={Math.floor(shown / 12)}
          month={shown % 12}
          todayStr={todayStr}
          selected={selected}
          inView={inView}
          marked={marked}
          onPick={onPick}
          onPrev={() => setShown((m) => m - 1)}
          onNext={() => setShown((m) => m + 1)}
        />

        {extra}

        <section data-my-calendars>
          <button
            type="button"
            onClick={() => setKindsOpen((v) => !v)}
            aria-expanded={kindsOpen}
            data-full-width
            className="flex w-full items-center justify-between rounded-md px-1 py-1 text-sm font-semibold text-ink hover:bg-bg"
          >
            My calendars
            {kindsOpen ? <ChevronUp aria-hidden className="h-4 w-4 shrink-0" /> : <ChevronDown aria-hidden className="h-4 w-4 shrink-0" />}
          </button>
          {kindsOpen && (
            <ul className="mt-1 flex flex-col">
              {kinds.map((k) => {
                const color = eventColor(k.color);
                const isHidden = hidden.has(k.key);
                return (
                  <li key={k.key}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-md px-1 py-1.5 text-sm text-ink hover:bg-bg">
                      <input
                        type="checkbox"
                        checked={!isHidden}
                        onChange={(e) => onToggleKind(k.key, !e.target.checked)}
                        data-kind-toggle={k.key}
                        className={`h-4 w-4 shrink-0 ${color.accent}`}
                      />
                      <span className="min-w-0 flex-1 truncate">{k.label}</span>
                      {counts[k.key] ? <span className="text-xs tabular-nums text-muted">{counts[k.key]}</span> : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {showNotifications && <NotificationToggle />}
      </aside>
    </>
  );
}
