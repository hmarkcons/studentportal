// The day a student registered, as read from an imported spreadsheet.
//
// This is not a cosmetic field. It decides the order students take their
// places in the running order, and that order is baked into the Student ID
// the moment their intake is known (migration 0260). Nothing renumbers
// afterwards — the ID is on the agreement and the receipt by then — so a date
// read wrongly on import is wrong for the life of the record.
//
// Which is why an unreadable date is a REJECTED row rather than a row
// silently stamped with today. Importing a student under the wrong date looks
// like a success and cannot be undone; leaving them out is reported by name
// and takes one correction in the sheet.

/**
 * Today in the office's day, not the server's.
 *
 * Exported because the importer needs the same day this module validates
 * against: a blank cell means "the day of the import", and a server in UTC
 * deciding that for itself would disagree with Karachi for five hours out of
 * every twenty-four.
 */
export const karachiToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });

/** Before HMARK existed, so a date under this is a typed year, not a record. */
export const REGISTRATION_MIN = "2000-01-01";

/**
 * Bounds to spread onto a registration-date input.
 *
 * suppressHydrationWarning for the same reason dateOfBirth's does: max is
 * derived from today, and a form rendered either side of midnight in Karachi
 * would otherwise mismatch on hydration and force a client re-render.
 */
export function registrationDateBounds() {
  return { min: REGISTRATION_MIN, max: karachiToday(), suppressHydrationWarning: true } as const;
}

/**
 * Returns a message when the registration date cannot be right, or null.
 *
 * An empty value is not an error here — it means "the day it is imported",
 * which is what the column did before it existed. Whether blank is acceptable
 * is the caller's business.
 */
export function registrationDateError(value: string | null | undefined): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return "Write the registration date as YYYY-MM-DD (2026-01-31), or format the cell as a date in Excel.";
  }
  // Rejects 2026-02-31 and 2026-13-01, which the pattern above happily accepts.
  const [y, m, d] = raw.split("-").map(Number);
  const asDate = new Date(Date.UTC(y, m - 1, d));
  if (asDate.getUTCFullYear() !== y || asDate.getUTCMonth() !== m - 1 || asDate.getUTCDate() !== d) {
    return "That is not a real date — check the day and month.";
  }
  if (raw > karachiToday()) return "The registration date is in the future — check the year.";
  if (raw < REGISTRATION_MIN) return `That registration date is before ${REGISTRATION_MIN} — check the year.`;
  return null;
}

/**
 * The timestamp to store for a registration day, as ISO.
 *
 * Midday in Karachi rather than midnight anywhere. registered_at is a
 * timestamptz and the students list derives the Month column from it by
 * rendering in whatever zone the server runs in (UTC on Vercel) — so a
 * midnight-Karachi timestamp on the 1st of a month renders as the last day of
 * the previous one, and the student is filed under the wrong month for good.
 * Midday is far enough from both edges that Karachi and UTC always agree on
 * the day.
 */
export function registrationTimestamp(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 7, 0, 0)).toISOString();
}

/**
 * Orders prepared import rows so the earliest registration is inserted first.
 *
 * The place in the running order is taken row by row as the batch inserts, so
 * insertion order IS the order students are numbered in. Sorting here is what
 * makes "in sequence according to the date of registration" true of a
 * spreadsheet somebody typed in whatever order they had the files to hand.
 *
 * Ties keep the order they were written in the sheet, which is the only other
 * signal available and is usually the order they were processed.
 */
export function byRegistrationDate<T>(rows: T[], dateOf: (row: T) => string): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const byDay = dateOf(a.row).localeCompare(dateOf(b.row));
      return byDay !== 0 ? byDay : a.index - b.index;
    })
    .map((entry) => entry.row);
}
