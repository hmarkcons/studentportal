export function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseYMD(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

export function startOfWeek(d: Date): Date {
  const day = d.getUTCDay();
  return addDays(d, -day);
}

export function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function getMonthGridDays(reference: Date): Date[] {
  const gridStart = startOfWeek(startOfMonth(reference));
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

export function getWeekDays(reference: Date): Date[] {
  const start = startOfWeek(reference);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

const DAY_MS = 86_400_000;

/** Whole days from one date-only string to another. Negative if b is earlier. */
function daysBetween(aStr: string, bStr: string): number {
  return Math.round((parseYMD(bStr).getTime() - parseYMD(aStr).getTime()) / DAY_MS);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * The dates a multi-day item covers WITHIN a range.
 *
 * Clipped to the range before expanding, not after. It used to walk from the
 * item's start day by day with a 400-iteration guard and filter afterwards, so
 * a span longer than 400 days — a year-long placement, an intake window —
 * stopped producing dates before it reached the month being viewed, and the
 * item silently disappeared from the calendar instead of filling it.
 */
export function eachDateInRange(startStr: string, endStr: string, rangeStartStr?: string, rangeEndStr?: string): string[] {
  const from = rangeStartStr && rangeStartStr > startStr ? rangeStartStr : startStr;
  const to = rangeEndStr && rangeEndStr < endStr ? rangeEndStr : endStr;
  if (from > to) return [];

  const span = daysBetween(from, to);
  // A range is at most 42 days, so this only ever runs long when a caller asks
  // for an unclipped span. Still bounded, but generously.
  const count = Math.min(span, 3660);
  return Array.from({ length: count + 1 }, (_, i) => toYMD(addDays(parseYMD(from), i)));
}

/**
 * Which dates a recurring item falls on inside a range.
 *
 * Computed by jumping to the range rather than stepping from the series start.
 * The old version walked one interval at a time from the first occurrence with
 * a 400-iteration guard, which meant a DAILY series that began more than 400
 * days ago never reached the month being viewed and vanished from the calendar
 * altogether — the longer a daily reminder had been running, the less likely it
 * was to show. Weekly hit the same wall after about seven and a half years.
 *
 * Monthly occurrences are a pure function of the month: the anchor day clamped
 * to that month's length. So the 31st of January becomes the 28th or 29th in
 * February and the 31st again in March, rather than drifting permanently to a
 * shorter day — and it can be evaluated for one month without walking through
 * all the months before it.
 */
export function expandRecurrence(
  startStr: string,
  recurrence: "none" | "daily" | "weekly" | "monthly",
  recurrenceEndStr: string | null,
  rangeStartStr: string,
  rangeEndStr: string
): string[] {
  if (recurrence === "none") return [];

  // Nothing before the series starts, and nothing after it ends.
  const from = rangeStartStr > startStr ? rangeStartStr : startStr;
  const to = recurrenceEndStr && recurrenceEndStr < rangeEndStr ? recurrenceEndStr : rangeEndStr;
  if (from > to || (recurrenceEndStr && recurrenceEndStr < startStr)) return [];

  if (recurrence === "daily" || recurrence === "weekly") {
    const step = recurrence === "daily" ? 1 : 7;
    const offset = daysBetween(startStr, from);
    // Round up to the next whole interval, so a weekly series starting on a
    // Monday lands on Mondays whatever day the range happens to open on.
    const firstIndex = Math.max(0, Math.ceil(offset / step));
    const dates: string[] = [];
    for (let i = firstIndex; ; i++) {
      const d = toYMD(addDays(parseYMD(startStr), i * step));
      if (d > to) break;
      if (d >= from) dates.push(d);
      // A range is 42 days at most, so this cannot run away.
      if (dates.length > 400) break;
    }
    return dates;
  }

  // Explicitly monthly, rather than everything-that-is-not-daily-or-weekly.
  // The database constrains this column to four values so nothing else can be
  // stored, but reading the branch as "monthly" when it is really "anything
  // else" is a trap for whoever adds a fifth.
  if (recurrence !== "monthly") return [];

  const anchorDay = parseYMD(startStr).getUTCDate();
  const start = parseYMD(startStr);
  const fromDate = parseYMD(from);
  const toDate = parseYMD(to);

  const firstMonth = start.getUTCFullYear() * 12 + start.getUTCMonth();
  // One month early, because the occurrence in the month the range opens in
  // may fall before rangeStart while the next one falls inside it.
  const scanFrom = Math.max(firstMonth, fromDate.getUTCFullYear() * 12 + fromDate.getUTCMonth() - 1);
  const scanTo = toDate.getUTCFullYear() * 12 + toDate.getUTCMonth();

  const dates: string[] = [];
  for (let m = scanFrom; m <= scanTo; m++) {
    const year = Math.floor(m / 12);
    const monthIndex = m % 12;
    const day = Math.min(anchorDay, daysInMonth(year, monthIndex));
    const d = toYMD(new Date(Date.UTC(year, monthIndex, day)));
    if (d >= from && d <= to && d >= startStr) dates.push(d);
  }
  return dates;
}

/**
 * Today, in Karachi. The office is there, and toISOString() gives UTC — so for
 * the first five hours of every Karachi day the calendar highlighted yesterday
 * and treated a task due today as not yet due.
 */
export function karachiToday(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
}

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAY_FULL_LABELS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];
export const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
