// Reading an attendance record: when the shift was, how long it ran, and what
// to say about the ones that were never closed.
//
// Times are shown in Karachi. The page used to call toLocaleTimeString() with
// no locale and no timezone, so a server component rendered it in the server's
// zone — UTC on Vercel — and every arrival displayed five hours early: a 9:00am
// clock-in read "4:00:00 AM" on the attendance table.

export const OFFICE_TIMEZONE = "Asia/Karachi";

/** "9:04 AM", in the office's own time. */
export function punchTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: OFFICE_TIMEZONE,
  });
}

/** The office's own calendar date, which is what a work_date means. */
export function officeToday(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: OFFICE_TIMEZONE });
}

/** "2026-09" for the month a date-only string falls in. */
export function monthOf(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/** First and last day of a "YYYY-MM" month, inclusive, as date-only strings. */
export function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  // Day 0 of the next month is the last day of this one, so February and leap
  // years come out right without a table of month lengths.
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start, end: `${month}-${String(last).padStart(2, "0")}` };
}

export type ShiftRow = {
  clock_in: string | null;
  clock_out: string | null;
  clock_out_missing?: boolean | null;
};

/**
 * Minutes worked, or null when the shift cannot be measured.
 *
 * Null is the honest answer for a shift nobody clocked out of: the time they
 * left is not recorded anywhere, and counting it to "now" would grow the
 * figure every time the page was opened.
 */
export function shiftMinutes(row: ShiftRow): number | null {
  if (!row.clock_in || !row.clock_out) return null;
  const inAt = new Date(row.clock_in).getTime();
  const outAt = new Date(row.clock_out).getTime();
  if (Number.isNaN(inAt) || Number.isNaN(outAt) || outAt <= inAt) return null;
  return Math.round((outAt - inAt) / 60000);
}

/** "8h 15m", or "—" for a shift with no measurable length. */
export function formatDuration(minutes: number | null): string {
  if (minutes === null) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * What to show in the clock-out column.
 *
 * Three states, and they are not the same thing: still working, left without
 * clocking out (which is now recorded rather than left looking identical to
 * the first), and a normal close.
 */
export function clockOutLabel(row: ShiftRow): { text: string; tone: "normal" | "open" | "missing" } {
  if (row.clock_out) return { text: punchTime(row.clock_out), tone: "normal" };
  if (row.clock_out_missing) return { text: "Not clocked out", tone: "missing" };
  return { text: "Still clocked in", tone: "open" };
}

/** Total of the measurable shifts in a list, for a month footer. */
export function totalMinutes(rows: ShiftRow[]): number {
  return rows.reduce((sum, r) => sum + (shiftMinutes(r) ?? 0), 0);
}
