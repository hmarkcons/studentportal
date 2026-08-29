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

export function eachDateInRange(startStr: string, endStr: string): string[] {
  const days: string[] = [];
  let cur = parseYMD(startStr);
  const endYMD = endStr;
  let guard = 0;
  while (toYMD(cur) <= endYMD && guard < 400) {
    days.push(toYMD(cur));
    cur = addDays(cur, 1);
    guard++;
  }
  return days;
}

export function expandRecurrence(
  startStr: string,
  recurrence: "none" | "daily" | "weekly" | "monthly",
  recurrenceEndStr: string | null,
  rangeStartStr: string,
  rangeEndStr: string
): string[] {
  if (recurrence === "none") return [];
  let cur = parseYMD(startStr);
  const anchorDay = cur.getUTCDate();
  const hardEndStr = recurrenceEndStr && recurrenceEndStr < rangeEndStr ? recurrenceEndStr : rangeEndStr;
  const dates: string[] = [];
  let guard = 0;
  while (toYMD(cur) <= hardEndStr && guard < 400) {
    const curStr = toYMD(cur);
    if (curStr >= rangeStartStr && curStr <= rangeEndStr) dates.push(curStr);
    if (recurrence === "daily") cur = addDays(cur, 1);
    else if (recurrence === "weekly") cur = addDays(cur, 7);
    else {
      // Clamp to the target month's actual last day instead of letting
      // Date.UTC roll an out-of-range day into the following month (e.g.
      // Jan 31 -> Feb 31 would silently normalize to Mar 3) — clamping
      // still restores the original anchor day (e.g. back to the 31st)
      // as soon as a long-enough month comes around, instead of the
      // series permanently drifting to a different day forever.
      const nextMonthFirst = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
      const daysInNextMonth = new Date(Date.UTC(nextMonthFirst.getUTCFullYear(), nextMonthFirst.getUTCMonth() + 1, 0)).getUTCDate();
      cur = new Date(Date.UTC(nextMonthFirst.getUTCFullYear(), nextMonthFirst.getUTCMonth(), Math.min(anchorDay, daysInNextMonth)));
    }
    guard++;
  }
  return dates;
}

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
