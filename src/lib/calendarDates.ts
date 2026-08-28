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

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
