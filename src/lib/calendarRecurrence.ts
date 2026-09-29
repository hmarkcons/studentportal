// Which days a calendar item falls on, how its repeat and its notification
// are said, and when a notification is due.
//
// Daily, weekly and monthly expansion is calendarDates.expandRecurrence, which
// is already tested for series that began years ago; this adds the two kinds
// migration 0295 allows — yearly, and every weekday — in the same jump-to-the-
// range way, so an old series still reaches the period on screen.
//
// Pure, so it is unit-tested under plain Node (scripts/calendar-recurrence-test.mjs).

import { eachDateInRange, expandRecurrence, parseYMD, toYMD, MONTH_LABELS, WEEKDAY_FULL_LABELS } from "./calendarDates.ts";
import { karachiClock, karachiEpoch, minutesOf, shiftDate, dayDelta } from "./calendarLayout.ts";

export const RECURRENCE_KINDS = ["none", "daily", "weekly", "monthly", "yearly", "weekdays"] as const;
export type Recurrence = (typeof RECURRENCE_KINDS)[number];

export function isRecurrence(value: string | null | undefined): value is Recurrence {
  return (RECURRENCE_KINDS as readonly string[]).includes(value ?? "");
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * The dates a repeating item falls on inside a range (inclusive), never before
 * the series starts or after its repeat-until date.
 *
 * Yearly keeps the month and day, so 29 February falls on the 28th in a year
 * without one and on the 29th again when it comes back. Every weekday is
 * Monday to Friday, whatever day the series began on.
 */
export function expandOccurrences(
  start: string,
  recurrence: string | null | undefined,
  recurrenceEnd: string | null | undefined,
  rangeStart: string,
  rangeEnd: string
): string[] {
  if (!recurrence || recurrence === "none" || !isRecurrence(recurrence)) return [];
  if (recurrence === "daily" || recurrence === "weekly" || recurrence === "monthly") {
    return expandRecurrence(start, recurrence, recurrenceEnd ?? null, rangeStart, rangeEnd);
  }

  const from = rangeStart > start ? rangeStart : start;
  const to = recurrenceEnd && recurrenceEnd < rangeEnd ? recurrenceEnd : rangeEnd;
  if (from > to) return [];

  if (recurrence === "weekdays") {
    // A range is a year at most, so walking it is cheap and cannot run away.
    const span = Math.min(dayDelta(from, to), 800);
    const dates: string[] = [];
    for (let i = 0; i <= span; i++) {
      const d = shiftDate(from, i);
      const weekday = parseYMD(d).getUTCDay();
      if (weekday !== 0 && weekday !== 6) dates.push(d);
    }
    return dates;
  }

  // yearly
  const anchor = parseYMD(start);
  const month = anchor.getUTCMonth();
  const day = anchor.getUTCDate();
  const dates: string[] = [];
  for (let y = parseYMD(from).getUTCFullYear(); y <= parseYMD(to).getUTCFullYear(); y++) {
    const d = toYMD(new Date(Date.UTC(y, month, Math.min(day, daysInMonth(y, month)))));
    if (d >= from && d <= to) dates.push(d);
  }
  return dates;
}

export type Occurrence = { date: string; spanEnd: string | null };

/**
 * Where an item appears inside a range: each occurrence of a repeating one,
 * or — for one that does not repeat — its start, carrying its end date when
 * it runs over several days, so the view can draw one bar across them rather
 * than a separate chip on every day.
 *
 * A multi-day item that began before the range is still returned (with its
 * real start) as long as it reaches into it.
 */
export function occurrencesInRange(
  dueDate: string,
  endDate: string | null | undefined,
  recurrence: string | null | undefined,
  recurrenceEnd: string | null | undefined,
  rangeStart: string,
  rangeEnd: string
): Occurrence[] {
  if (recurrence && recurrence !== "none") {
    return expandOccurrences(dueDate, recurrence, recurrenceEnd, rangeStart, rangeEnd).map((date) => ({ date, spanEnd: null }));
  }
  if (endDate && endDate > dueDate) {
    return eachDateInRange(dueDate, endDate, rangeStart, rangeEnd).length > 0 ? [{ date: dueDate, spanEnd: endDate }] : [];
  }
  return dueDate >= rangeStart && dueDate <= rangeEnd ? [{ date: dueDate, spanEnd: null }] : [];
}

/** "Daily", "Weekly on Tuesday", "Monthly on day 22", "Annually on September 22", "Every weekday (Monday to Friday)". */
export function recurrenceLabel(recurrence: string | null | undefined, start: string): string {
  const d = parseYMD(start);
  switch (recurrence) {
    case "daily":
      return "Daily";
    case "weekly":
      return `Weekly on ${WEEKDAY_FULL_LABELS[d.getUTCDay()]}`;
    case "monthly":
      return `Monthly on day ${d.getUTCDate()}`;
    case "yearly":
      return `Annually on ${MONTH_LABELS[d.getUTCMonth()]} ${d.getUTCDate()}`;
    case "weekdays":
      return "Every weekday (Monday to Friday)";
    default:
      return "Does not repeat";
  }
}

// ---------------------------------------------------------- notifications

/** The notifications the editor offers, in minutes before the start. */
export const NOTIFY_CHOICES: readonly { minutes: number | null; label: string }[] = [
  { minutes: null, label: "No notification" },
  { minutes: 0, label: "At the time of the event" },
  { minutes: 5, label: "5 minutes before" },
  { minutes: 10, label: "10 minutes before" },
  { minutes: 15, label: "15 minutes before" },
  { minutes: 30, label: "30 minutes before" },
  { minutes: 60, label: "1 hour before" },
  { minutes: 120, label: "2 hours before" },
  { minutes: 1440, label: "1 day before" },
  { minutes: 2880, label: "2 days before" },
  { minutes: 10080, label: "1 week before" },
];

/** How a notification is said: "30 minutes before", "1 day before", or "No notification". */
export function notifyLabel(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "No notification";
  const listed = NOTIFY_CHOICES.find((c) => c.minutes === minutes);
  if (listed) return listed.label;
  if (minutes % 10080 === 0) return `${minutes / 10080} weeks before`;
  if (minutes % 1440 === 0) return `${minutes / 1440} days before`;
  if (minutes % 60 === 0) return `${minutes / 60} hours before`;
  return `${minutes} minutes before`;
}

/**
 * When an item with no time of its own is treated as starting, for its
 * notification: nine in the morning, the start of the office's day.
 */
export const UNTIMED_NOTIFY_MINUTES = 9 * 60;

export type NotifySource = {
  /** Stable for the item, e.g. "personal:<uuid>". */
  key: string;
  title: string;
  dueDate: string;
  dueTime: string | null;
  allDay: boolean;
  recurrence: string | null;
  recurrenceEndDate: string | null;
  notifyMinutes: number;
};

export type DueNotification = {
  /** Unique per occurrence, time and lead time — a moved item notifies again. */
  key: string;
  title: string;
  date: string;
  /** Karachi minutes the occurrence starts at. */
  startMinutes: number;
  timed: boolean;
  startsAt: number;
  notifyAt: number;
  minutes: number;
};

/**
 * The notifications that fall due between now and `horizonMs` from now, for
 * items that have not started yet, soonest first.
 *
 * One whose moment has already passed while its item is still ahead is
 * included (its notifyAt is in the past): a laptop that slept through the
 * reminder should still say it on waking, before the thing begins.
 */
export function upcomingNotifications(sources: readonly NotifySource[], nowMs: number, horizonMs = 26 * 3_600_000): DueNotification[] {
  const today = karachiClock(nowMs).date;
  const out: DueNotification[] = [];
  for (const s of sources) {
    if (!Number.isInteger(s.notifyMinutes) || s.notifyMinutes < 0) continue;
    // Far enough ahead to find an occurrence whose lead time reaches back into
    // the window — a week-before notification for something a week away.
    const lastDay = karachiClock(nowMs + horizonMs + s.notifyMinutes * 60_000).date;
    const timeMinutes = s.allDay ? null : minutesOf(s.dueTime);
    const startMinutes = timeMinutes ?? UNTIMED_NOTIFY_MINUTES;
    const dates =
      s.recurrence && s.recurrence !== "none"
        ? expandOccurrences(s.dueDate, s.recurrence, s.recurrenceEndDate, today, lastDay)
        : s.dueDate >= today && s.dueDate <= lastDay
          ? [s.dueDate]
          : [];
    for (const date of dates) {
      const startsAt = karachiEpoch(date, startMinutes);
      const notifyAt = startsAt - s.notifyMinutes * 60_000;
      if (startsAt <= nowMs || notifyAt > nowMs + horizonMs) continue;
      out.push({
        key: `${s.key}:${date}:${startMinutes}:${s.notifyMinutes}`,
        title: s.title,
        date,
        startMinutes,
        timed: timeMinutes !== null,
        startsAt,
        notifyAt,
        minutes: s.notifyMinutes,
      });
    }
  }
  return out.sort((a, b) => a.notifyAt - b.notifyAt || a.key.localeCompare(b.key));
}
