"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { karachiClock } from "@/lib/calendarLayout";

// ------------------------------------------------------------------ clock

function subscribeMinute(onChange: () => void) {
  const id = window.setInterval(onChange, 20_000);
  return () => window.clearInterval(id);
}
const minuteNow = () => Math.floor(Date.now() / 60_000);
const noMinute = () => 0;

/**
 * Karachi's date and minute, ticking while the page is open, for the red
 * now-line. Null on the server and in the first paint, so the server's clock
 * and the browser's never disagree in the HTML.
 */
export function useKarachiClock(): { date: string; minutes: number } | null {
  const minute = useSyncExternalStore(subscribeMinute, minuteNow, noMinute);
  return useMemo(() => (minute === 0 ? null : karachiClock(minute * 60_000)), [minute]);
}

// ------------------------------------------------------------ hidden kinds

const KINDS_EVENT = "calendar:kinds";

function readStored(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function subscribeStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(KINDS_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(KINDS_EVENT, onChange);
  };
}

/**
 * The kinds ticked off in My calendars, remembered in this browser. It is a
 * preference of the person at this screen, not something to keep anywhere
 * else; with storage blocked every kind simply shows.
 */
export function useHiddenKinds(storageKey: string): [Set<string>, (kind: string, hidden: boolean) => void] {
  const raw = useSyncExternalStore(
    subscribeStorage,
    () => readStored(storageKey),
    () => ""
  );
  const hidden = useMemo(() => {
    try {
      const list = raw ? (JSON.parse(raw) as unknown) : [];
      return new Set(Array.isArray(list) ? list.filter((k): k is string => typeof k === "string") : []);
    } catch {
      return new Set<string>();
    }
  }, [raw]);

  const setHidden = useCallback(
    (kind: string, hide: boolean) => {
      const next = new Set(hidden);
      if (hide) next.add(kind);
      else next.delete(kind);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        // Storage refused (a private window): the change lasts until reload.
      }
      window.dispatchEvent(new Event(KINDS_EVENT));
    },
    [hidden, storageKey]
  );
  return [hidden, setHidden];
}

// ------------------------------------------------------ notification access

const PERMISSION_EVENT = "calendar:permission";

/** "unknown" on the server and in the first paint, before the browser has been asked. */
export type NotificationAccess = "unknown" | "unsupported" | "default" | "granted" | "denied";

function readPermission(): NotificationAccess {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as NotificationAccess;
}

function subscribePermission(onChange: () => void) {
  window.addEventListener(PERMISSION_EVENT, onChange);
  window.addEventListener("focus", onChange);
  return () => {
    window.removeEventListener(PERMISSION_EVENT, onChange);
    window.removeEventListener("focus", onChange);
  };
}

/** Whether this browser will show a system notification, and a way to ask — only ever from a click. */
export function useNotificationAccess(): [NotificationAccess, () => Promise<void>] {
  const access = useSyncExternalStore(subscribePermission, readPermission, () => "unknown" as NotificationAccess);
  const ask = useCallback(async () => {
    if (!("Notification" in window)) return;
    try {
      await Notification.requestPermission();
    } finally {
      window.dispatchEvent(new Event(PERMISSION_EVENT));
    }
  }, []);
  return [access, ask];
}

/** Said when the calendar changes something a notification depends on, so the notifier looks again. */
export function announceCalendarChange() {
  window.dispatchEvent(new Event("calendar:changed"));
}
