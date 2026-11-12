// Phase 6, second part: how engaged a lead is, when each person usually opens
// email, and when the sunset policy's steps fall due.
//
// No portal imports, so the unit tests load it under plain Node.

/** A score at or above this is a hot lead: something like a click and a website visit in the last few weeks. */
export const HOT_SCORE = 8;
/** At or above this, warm: they open, and now and then click. */
export const WARM_SCORE = 3;

export type EngagementLevel = "hot" | "warm" | "cold";

export function engagementLevel(score: number | null | undefined): EngagementLevel {
  const s = Number(score ?? 0);
  return s >= HOT_SCORE ? "hot" : s >= WARM_SCORE ? "warm" : "cold";
}

export const LEVEL_LABELS: Record<EngagementLevel, string> = { hot: "Hot", warm: "Warm", cold: "Cold" };

/** What a scored lead did, in words: "opened 3, clicked 2, visited the website, enquired". */
export function didWhat(r: { opened: number; clicked: number; visited: number; converted: number }): string {
  const parts: string[] = [];
  if (r.opened) parts.push(`opened ${r.opened}`);
  if (r.clicked) parts.push(`clicked ${r.clicked}`);
  if (r.visited) parts.push(r.visited === 1 ? "visited the website" : `visited the website ${r.visited} times`);
  if (r.converted) parts.push(r.converted === 1 ? "enquired" : `enquired ${r.converted} times`);
  return parts.join(", ");
}

const KARACHI_MS = 5 * 3_600_000;

/**
 * When to send to someone who usually opens at `hour` (Karachi): the next
 * time that hour begins, within the coming 24 hours — or now, if we are in
 * that hour already.
 */
export function nextBestHour(from: Date, hour: number): Date {
  const k = new Date(from.getTime() + KARACHI_MS);
  if (k.getUTCHours() === hour) return from;
  const target = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate(), hour, 0, 0) - KARACHI_MS);
  return target.getTime() > from.getTime() ? target : new Date(target.getTime() + 86_400_000);
}

/** The two-hour window most opens fall in, "20:00–22:00", from an hour-by-hour count; null with too few to tell. */
export function peakWindow(hours: { hour: number; opens: number }[], minOpens = 20): { from: number; to: number; share: number } | null {
  const by = new Map(hours.map((h) => [h.hour, h.opens]));
  const total = hours.reduce((s, h) => s + h.opens, 0);
  if (total < minOpens) return null;
  let best = { from: 0, n: -1 };
  for (let h = 0; h < 24; h++) {
    const n = (by.get(h) ?? 0) + (by.get((h + 1) % 24) ?? 0);
    if (n > best.n) best = { from: h, n };
  }
  return { from: best.from, to: (best.from + 2) % 24, share: best.n / total };
}

export const hourText = (h: number) => `${String(h).padStart(2, "0")}:00`;

/**
 * The sunset's second step — stopping emails to those still silent — falls
 * due once the re-engagement email has finished going and the grace period
 * has passed since.
 */
export function sunsetSuppressDue({ finishedAt, graceDays, now }: { finishedAt: string | null; graceDays: number; now: Date }): { due: boolean; on: Date | null } {
  if (!finishedAt) return { due: false, on: null };
  const on = new Date(Date.parse(finishedAt) + graceDays * 86_400_000);
  return { due: now.getTime() >= on.getTime(), on };
}
