// Days and months the way the office counts them: in Karachi.
//
// A timestamp from the database is UTC; the office's day and month turn over
// five hours earlier. Counted in UTC, a student registered at 2am Karachi on
// the 1st lands in the previous month's figures.

const KARACHI = "Asia/Karachi";

/** The Karachi calendar day of a timestamp, YYYY-MM-DD — or "" for nothing usable. */
export function karachiDay(timestamp: string | null | undefined): string {
  if (!timestamp) return "";
  // A bare date is already a calendar day; reading it as midnight UTC would
  // move nothing, but say so rather than rely on it.
  if (/^\d{4}-\d{2}-\d{2}$/.test(timestamp)) return timestamp;
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-CA", { timeZone: KARACHI });
}

/** YYYY-MM of a timestamp or day, in Karachi. */
export function karachiMonth(timestamp: string | null | undefined): string {
  return karachiDay(timestamp).slice(0, 7);
}

/** Whole days from `from` to `to` (both YYYY-MM-DD); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** `day` moved by `n` days, YYYY-MM-DD. */
export function addDays(day: string, n: number): string {
  const t = Date.parse(`${day}T00:00:00Z`);
  return new Date(t + n * 86_400_000).toISOString().slice(0, 10);
}

/** The month before a YYYY-MM. */
export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
