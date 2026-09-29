// The arithmetic behind the calendar's views: where a block sits on the hour
// grid, how overlapping blocks share a column, what a drag or a resize turns
// into, which days a period covers and how a week row stacks its chips.
//
// Pure and free of React, so it is unit-tested under plain Node
// (scripts/calendar-layout-test.mjs) — which is also why the import below
// carries its .ts extension and no "@/" alias.
//
// Times are minutes from midnight in Karachi, the office's day. The office
// keeps no daylight saving, so a wall-clock time there is always UTC+5.

import { addDays, getMonthGridDays, getWeekDays, parseYMD, toYMD, MONTH_LABELS, WEEKDAY_FULL_LABELS } from "./calendarDates.ts";

export type CalendarView = "day" | "week" | "month" | "year";
export const CALENDAR_VIEWS: readonly CalendarView[] = ["day", "week", "month", "year"];

export const DAY_MINUTES = 1440;

/** A view named in a URL, or the fallback when it names none we know. */
export function parseView(raw: string | null | undefined, fallback: CalendarView = "week"): CalendarView {
  return (CALENDAR_VIEWS as readonly string[]).includes(raw ?? "") ? (raw as CalendarView) : fallback;
}

/** A YYYY-MM-DD that is a real date, or null. "2026-02-30" is not one. */
export function parseDateParam(raw: string | null | undefined): string | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = parseYMD(raw);
  return Number.isNaN(d.getTime()) || toYMD(d) !== raw ? null : raw;
}

// ------------------------------------------------------------------ times

/** "18:30" or "18:30:00" as minutes from midnight; null for anything else. */
export function minutesOf(time: string | null | undefined): number | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

/**
 * Minutes as "HH:MM". Midnight at the end of the day is written 23:59: a
 * `time` column and an <input type="time"> both stop there.
 */
export function timeOf(minutes: number): string {
  const m = Math.max(0, Math.min(DAY_MINUTES - 1, Math.round(minutes)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** To the nearest step. */
export function snap(minutes: number, step = 15): number {
  return Math.round(minutes / step) * step;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * The span a timed item covers on the grid. No end, or an end that is not
 * after the start, draws as the default length — an hour, as Google does —
 * so a block never collapses to nothing.
 */
export function displaySpan(
  time: string | null | undefined,
  endTime: string | null | undefined,
  defaultMinutes = 60
): { start: number; end: number } | null {
  const start = minutesOf(time);
  if (start === null) return null;
  const given = minutesOf(endTime);
  const end = given !== null && given > start ? given : start + defaultMinutes;
  return { start, end: Math.min(end, DAY_MINUTES) };
}

/** Top and height of a block, in pixels, for an hour that is `hourHeight` tall. */
export function blockBox(start: number, end: number, hourHeight: number, minHeight = 18): { top: number; height: number } {
  const top = (start / 60) * hourHeight;
  const height = Math.max(((end - start) / 60) * hourHeight, minHeight);
  return { top, height };
}

// ---------------------------------------------------------- overlapping

export type TimedItem = { id: string; start: number; end: number };
export type PlacedItem = TimedItem & { column: number; columns: number };

/**
 * Side by side, the way Google lays out a busy afternoon.
 *
 * Items that overlap — directly or through a chain of others — form a
 * cluster; each takes the leftmost column free at its start, and every item
 * in the cluster is drawn 1/columns wide so none hides another. Items are
 * treated as at least `minDuration` long, so two short blocks whose drawn
 * boxes would touch are separated even though their times do not overlap.
 */
export function layoutOverlaps(items: readonly TimedItem[], minDuration = 0): PlacedItem[] {
  const sorted = [...items]
    .map((item, index) => ({ item, index, end: Math.max(item.end, item.start + minDuration) }))
    .sort((a, b) => a.item.start - b.item.start || b.end - a.end || a.index - b.index);

  const placed: PlacedItem[] = [];
  let cluster: PlacedItem[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -Infinity;

  const closeCluster = () => {
    for (const p of cluster) p.columns = columnEnds.length;
    cluster = [];
    columnEnds = [];
  };

  for (const { item, end } of sorted) {
    if (item.start >= clusterEnd) {
      closeCluster();
      clusterEnd = -Infinity;
    }
    let column = columnEnds.findIndex((e) => e <= item.start);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(end);
    } else {
      columnEnds[column] = end;
    }
    const p: PlacedItem = { ...item, column, columns: 1 };
    cluster.push(p);
    placed.push(p);
    clusterEnd = Math.max(clusterEnd, end);
  }
  closeCluster();
  return placed;
}

// -------------------------------------------------------- drag and resize

/** Whole days from one date to another; negative when `to` is earlier. */
export function dayDelta(from: string, to: string): number {
  return Math.round((parseYMD(to).getTime() - parseYMD(from).getTime()) / 86_400_000);
}

export function shiftDate(date: string, days: number): string {
  return toYMD(addDays(parseYMD(date), days));
}

/**
 * Where a dragged block lands: `minuteDelta` later (snapped) on `toDate`,
 * the same length as before, and never off either end of the day — a block
 * dragged past midnight stops at the bottom of the grid rather than wrapping
 * onto the next day with its end before its start.
 */
export function moveTimed(
  span: { start: number; end: number },
  minuteDelta: number,
  step = 15
): { start: number; end: number } {
  const duration = Math.min(Math.max(span.end - span.start, step), DAY_MINUTES);
  const start = clamp(snap(span.start + minuteDelta, step), 0, DAY_MINUTES - duration);
  return { start, end: start + duration };
}

/** The new end when the bottom edge is dragged: snapped, at least one step long, not past midnight. */
export function resizeEnd(start: number, pointerMinutes: number, step = 15): number {
  return clamp(snap(pointerMinutes, step), start + step, DAY_MINUTES);
}

/**
 * The slot a click or a drag across empty grid asks for. A click is the
 * half hour it landed in, an hour long; a drag is the stretch it covered, to
 * the quarter hour, whichever way it went.
 */
export function slotFor(anchorMinutes: number, currentMinutes: number | null, step = 15): { start: number; end: number } {
  if (currentMinutes === null || Math.abs(currentMinutes - anchorMinutes) < step) {
    const start = clamp(Math.floor(anchorMinutes / 30) * 30, 0, DAY_MINUTES - 30);
    return { start, end: Math.min(start + 60, DAY_MINUTES) };
  }
  const lo = Math.min(anchorMinutes, currentMinutes);
  const hi = Math.max(anchorMinutes, currentMinutes);
  const start = clamp(Math.floor(lo / step) * step, 0, DAY_MINUTES - step);
  const end = clamp(Math.ceil(hi / step) * step, start + step, DAY_MINUTES);
  return { start, end };
}

/** Minutes from the top of a day column, for a pointer `offsetY` pixels down it. */
export function minutesAt(offsetY: number, hourHeight: number): number {
  return clamp((offsetY / hourHeight) * 60, 0, DAY_MINUTES);
}

// ---------------------------------------------------------------- periods

/** Every day a view shows, in order. A month is its six-week grid. */
export function periodDays(view: CalendarView, ref: string): string[] {
  const d = parseYMD(ref);
  if (view === "day") return [ref];
  if (view === "week") return getWeekDays(d).map(toYMD);
  if (view === "month") return getMonthGridDays(d).map(toYMD);
  const year = d.getUTCFullYear();
  const first = `${year}-01-01`;
  const count = dayDelta(first, `${year}-12-31`) + 1;
  return Array.from({ length: count }, (_, i) => shiftDate(first, i));
}

/** The first and last day a view shows — what the page has to load. */
export function periodRange(view: CalendarView, ref: string): { start: string; end: string } {
  const days = periodDays(view, ref);
  return { start: days[0], end: days[days.length - 1] };
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** `months` months on, keeping the day of the month where it exists (31 Jan + 1 = 28/29 Feb). */
export function addMonthsClamped(ref: string, months: number): string {
  const d = parseYMD(ref);
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const monthIndex = ((total % 12) + 12) % 12;
  const day = Math.min(d.getUTCDate(), daysInMonth(year, monthIndex));
  return toYMD(new Date(Date.UTC(year, monthIndex, day)));
}

/** The date the previous or next period opens on, for the arrows. */
export function shiftPeriod(view: CalendarView, ref: string, direction: 1 | -1): string {
  if (view === "day") return shiftDate(ref, direction);
  if (view === "week") return shiftDate(ref, 7 * direction);
  if (view === "month") return addMonthsClamped(ref, direction);
  return addMonthsClamped(ref, 12 * direction);
}

const SHORT_MONTH = MONTH_LABELS.map((m) => m.slice(0, 3));

/**
 * The heading over the grid: "September 22, 2026", "September 2026",
 * "Sep – Oct 2026" for a week across two months, "Dec 2026 – Jan 2027"
 * across two years, "2026".
 */
export function periodTitle(view: CalendarView, ref: string): string {
  const d = parseYMD(ref);
  if (view === "year") return String(d.getUTCFullYear());
  if (view === "month") return `${MONTH_LABELS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  if (view === "day") return `${MONTH_LABELS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  const days = getWeekDays(d);
  const a = days[0];
  const b = days[6];
  if (a.getUTCMonth() === b.getUTCMonth()) return `${MONTH_LABELS[a.getUTCMonth()]} ${a.getUTCFullYear()}`;
  if (a.getUTCFullYear() === b.getUTCFullYear()) {
    return `${SHORT_MONTH[a.getUTCMonth()]} – ${SHORT_MONTH[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
  }
  return `${SHORT_MONTH[a.getUTCMonth()]} ${a.getUTCFullYear()} – ${SHORT_MONTH[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
}

/** "Tuesday, September 22" — the date line in a popover. */
export function longDate(date: string, withYear = false): string {
  const d = parseYMD(date);
  const base = `${WEEKDAY_FULL_LABELS[d.getUTCDay()]}, ${MONTH_LABELS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return withYear ? `${base}, ${d.getUTCFullYear()}` : base;
}

/** "Sep 22" or "Sep 22, 2027". */
export function shortDate(date: string, withYear = false): string {
  const d = parseYMD(date);
  return `${SHORT_MONTH[d.getUTCMonth()]} ${d.getUTCDate()}${withYear ? `, ${d.getUTCFullYear()}` : ""}`;
}

/** The 42 days of one month's grid, for the mini calendars and the year view. */
export function monthGridDays(year: number, monthIndex: number): string[] {
  return getMonthGridDays(new Date(Date.UTC(year, monthIndex, 1))).map(toYMD);
}

/** Days in rows of seven. */
export function weeksOf(days: readonly string[]): string[][] {
  const rows: string[][] = [];
  for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));
  return rows;
}

// -------------------------------------------------------------- week rows

export type SpanItem = { id: string; start: string; end: string };
export type PlacedSpan = {
  id: string;
  startCol: number;
  endCol: number;
  lane: number;
  /** It began before this row, or goes on after it — drawn without a rounded end. */
  continuesBefore: boolean;
  continuesAfter: boolean;
};

/**
 * Chips and bars stacked into lanes across one week row, for the month grid
 * and the all-day row.
 *
 * Longer spans go first, so a bar across the week sits above the single days
 * under it; ties keep the order they came in, which the caller sorts by time.
 * Each item takes the lowest lane free across every day it covers.
 *
 * A day shows at most `maxLanes` lanes. A day with more than that gives its
 * last lane to "+N more", so an item is shown only when its lane fits on
 * every day it crosses, and `hidden[col]` counts what each day holds back.
 */
export function layoutWeekRow(
  items: readonly SpanItem[],
  rowDays: readonly string[],
  maxLanes = Infinity
): { placed: PlacedSpan[]; hidden: number[]; lanes: number } {
  const first = rowDays[0];
  const last = rowDays[rowDays.length - 1];
  const cols = rowDays.length;

  const inRow = items
    .map((item, index) => {
      const end = item.end < item.start ? item.start : item.end;
      if (end < first || item.start > last) return null;
      const startCol = item.start < first ? 0 : rowDays.indexOf(item.start);
      const endCol = end > last ? cols - 1 : rowDays.indexOf(end);
      if (startCol < 0 || endCol < 0) return null;
      return { item, index, startCol, endCol, continuesBefore: item.start < first, continuesAfter: end > last };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.endCol - b.startCol - (a.endCol - a.startCol) || a.startCol - b.startCol || a.index - b.index);

  const occupied: boolean[][] = [];
  const withLanes = inRow.map((x) => {
    let lane = 0;
    for (; ; lane++) {
      const row = (occupied[lane] ??= Array(cols).fill(false));
      let free = true;
      for (let c = x.startCol; c <= x.endCol; c++) if (row[c]) free = false;
      if (free) {
        for (let c = x.startCol; c <= x.endCol; c++) row[c] = true;
        break;
      }
    }
    return { ...x, lane };
  });

  const total = Array(cols).fill(0) as number[];
  for (const x of withLanes) for (let c = x.startCol; c <= x.endCol; c++) total[c] += 1;
  const limit = total.map((t) => (t <= maxLanes ? maxLanes : maxLanes - 1));

  const hidden = Array(cols).fill(0) as number[];
  const placed: PlacedSpan[] = [];
  let lanes = 0;
  for (const x of withLanes) {
    let visible = true;
    for (let c = x.startCol; c <= x.endCol; c++) if (x.lane >= limit[c]) visible = false;
    if (!visible) {
      for (let c = x.startCol; c <= x.endCol; c++) hidden[c] += 1;
      continue;
    }
    lanes = Math.max(lanes, x.lane + 1);
    placed.push({
      id: x.item.id,
      startCol: x.startCol,
      endCol: x.endCol,
      lane: x.lane,
      continuesBefore: x.continuesBefore,
      continuesAfter: x.continuesAfter,
    });
  }
  return { placed, hidden, lanes };
}

// ------------------------------------------------------------ formatting

/** "6pm", "6:30pm", "12am" — the way Google writes a time on a chip. */
export function formatClock(minutes: number): string {
  const m = ((Math.round(minutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const h = Math.floor(m / 60);
  const min = m % 60;
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return min === 0 ? `${h12}${suffix}` : `${h12}:${String(min).padStart(2, "0")}${suffix}`;
}

/** "6:00pm" — a time in a list to choose from, where every entry lines up. */
export function formatClockLong(minutes: number): string {
  const m = ((Math.round(minutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const h = Math.floor(m / 60);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m % 60).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}

/** "6 – 7pm", "11am – 1pm", "6:30 – 7:15pm". An end at midnight reads "12am". */
export function formatTimeRange(start: number, end: number): string {
  const sameHalf = start < 720 === end < 720 && end < DAY_MINUTES;
  const a = formatClock(start);
  const b = formatClock(end);
  return sameHalf ? `${a.replace(/[ap]m$/, "")} – ${b}` : `${a} – ${b}`;
}

/** The hour labels down the grid's gutter: "1 AM" … "11 PM". Midnight has none, as in Google. */
export function hourLabel(hour: number): string {
  if (hour === 0) return "";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${hour < 12 ? "AM" : "PM"}`;
}

/** Duration for a list of end times: "30 mins", "1 hr", "1.5 hrs". */
export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} mins`;
  const hours = minutes / 60;
  const text = Number.isInteger(hours) ? String(hours) : hours.toFixed(2).replace(/0$/, "");
  return `${text} ${hours === 1 ? "hr" : "hrs"}`;
}

// ---------------------------------------------------------------- Karachi

/** Pakistan keeps UTC+5 all year. */
export const KARACHI_OFFSET_MINUTES = 300;

/** The instant a Karachi wall-clock time refers to. */
export function karachiEpoch(date: string, minutes: number): number {
  return parseYMD(date).getTime() + (minutes - KARACHI_OFFSET_MINUTES) * 60_000;
}

/** Karachi's date and time of day at an instant. */
export function karachiClock(epochMs: number): { date: string; minutes: number } {
  const shifted = new Date(epochMs + KARACHI_OFFSET_MINUTES * 60_000);
  return {
    date: shifted.toISOString().slice(0, 10),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}
