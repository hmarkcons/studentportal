// A date of birth cannot be in the future, and nothing was stopping one.
//
// A registered student is on file with a DOB of 2026-09-21 — a date that had
// not happened yet when it was typed. It reached the database because none of
// the four DOB inputs set a max and no action checked, and it then flows
// straight onto the generated agreement PDF, which is the copy the student
// signs.
//
// The upper bound is today rather than "at least 15 years ago": HMARK does
// enrol school leavers and an arbitrary minimum age would reject real people.
// The lower bound only rules out a year that cannot be a birth year at all.

export const DOB_MIN = "1900-01-01";

/** Today in Asia/Karachi, as yyyy-mm-dd — the office's day, not the server's. */
export function dobMax() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
}

/**
 * Bounds to spread onto a date-of-birth input, for immediate feedback in the
 * browser. The server check above is the one that decides.
 *
 * suppressHydrationWarning is deliberate: max is "today", so a form rendered
 * at 23:59 in Karachi and hydrated a minute later would disagree by one day
 * and take the whole tree down to a client re-render. The attribute is allowed
 * to differ; nothing depends on which of the two days won.
 */
export function dobBounds() {
  return { min: DOB_MIN, max: dobMax(), suppressHydrationWarning: true } as const;
}

/**
 * Returns a message when the submitted date of birth cannot be right, or null.
 * An empty value is not an error here — whether the field is required is the
 * form's business, not this function's.
 */
export function dateOfBirthError(value: FormDataEntryValue | string | null | undefined) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "Enter the date of birth as a valid date.";
  if (raw > dobMax()) return "The date of birth is in the future — check the year.";
  if (raw < DOB_MIN) return "That date of birth is too far in the past — check the year.";
  return null;
}
