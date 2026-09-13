// Which academic year the office is working on, and whether a guide has kept up.
//
// Italy's DSU calls for A.Y. 2026/2027 start appearing from June and run to
// September, so by May the year everyone is preparing for has already turned
// over. The office set May as the month it changes.
//
// The year is computed rather than stored, because a stored one is a thing
// somebody has to remember to change and nobody ever does. What IS stored is
// which year each guide's contents describe — so a guide still carrying last
// year's deadlines can be told apart from one that has been refreshed, instead
// of a stale deadline quietly sitting under this year's heading.

/** The month the new academic year begins, 1-indexed. May. */
export const ACADEMIC_YEAR_ROLLS_IN = 5;

/** "2026/2027" for any date from May 2026 to April 2027. */
export function currentAcademicYear(today: Date = new Date()): string {
  // The office's own clock, not the server's: a Vercel box in UTC would turn
  // the year over a few hours early, which on 1 May is a different answer.
  const karachi = today.toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
  const [year, month] = karachi.split("-").map(Number);
  const start = month >= ACADEMIC_YEAR_ROLLS_IN ? year : year - 1;
  return `${start}/${start + 1}`;
}

/** The year a label like "2026/2027" or "2026/27" starts in, or null. */
export function academicYearStart(label: string | null | undefined): number | null {
  const m = /(\d{4})\s*[/-]\s*\d{2,4}/.exec(String(label ?? ""));
  if (m) return Number(m[1]);
  // A bare "2026" is a year somebody typed without the second half.
  const bare = /^\s*(\d{4})\s*$/.exec(String(label ?? ""));
  return bare ? Number(bare[1]) : null;
}

export type GuideFreshness =
  | { state: "current" }
  | { state: "stale"; behindBy: number; expected: string }
  | { state: "ahead"; expected: string }
  | { state: "unknown" };

/**
 * Whether a guide still describes the year being worked on.
 *
 * "stale" is not an accusation that somebody forgot — the region may simply not
 * have published its call yet, which is why the body carries call_status
 * separately. This only says the contents are for an earlier year.
 */
export function guideFreshness(storedAcademicYear: string | null | undefined, today: Date = new Date()): GuideFreshness {
  const expected = currentAcademicYear(today);
  const stored = academicYearStart(storedAcademicYear);
  if (stored == null) return { state: "unknown" };
  const current = academicYearStart(expected)!;
  if (stored === current) return { state: "current" };
  // Ahead of the current year is not a problem: a call published early for the
  // next cycle is the office being on top of it, not behind.
  if (stored > current) return { state: "ahead", expected };
  return { state: "stale", behindBy: current - stored, expected };
}

/** "2026/2027" from a starting year. */
export function academicYearLabel(startYear: number): string {
  return `${startYear}/${startYear + 1}`;
}
