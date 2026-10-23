// Asia/Karachi (PKT) is UTC+5 with no daylight saving, so the conversions are a
// fixed offset. Posts are stored UTC; the calendar and composer work in Karachi
// wall-clock. Pure, so it's unit-tested.

const OFFSET_MS = 5 * 3600 * 1000;

export type KarachiParts = { y: number; m: number; d: number; hh: number; mm: number };

/** The Karachi wall-clock components of a UTC instant (m is 0-based). */
export function karachiParts(iso: string): KarachiParts {
  const d = new Date(new Date(iso).getTime() + OFFSET_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), hh: d.getUTCHours(), mm: d.getUTCMinutes() };
}

/** The Karachi calendar day of a UTC instant, as YYYY-MM-DD. */
export function karachiYmd(iso: string): string {
  const p = karachiParts(iso);
  return `${p.y}-${String(p.m + 1).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** A Karachi wall-clock (m is 0-based) back to a UTC ISO instant. */
export function karachiToUtcIso(y: number, m: number, d: number, hh: number, mm: number): string {
  return new Date(Date.UTC(y, m, d, hh, mm) - OFFSET_MS).toISOString();
}

/** A <input type="datetime-local"> value (Karachi wall-clock) to UTC ISO. */
export function karachiLocalToUtcIso(local: string): string | null {
  if (!local) return null;
  const [date, time] = local.split("T");
  if (!date || !time) return null;
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  if ([y, m, d, hh, mm].some(Number.isNaN)) return null;
  return karachiToUtcIso(y, m - 1, d, hh, mm);
}

/** Move a UTC instant to a different Karachi day (YYYY-MM-DD), keeping its time-of-day. */
export function moveToKarachiDay(iso: string, ymd: string): string {
  const p = karachiParts(iso);
  const [y, m, d] = ymd.split("-").map(Number);
  return karachiToUtcIso(y, m - 1, d, p.hh, p.mm);
}
