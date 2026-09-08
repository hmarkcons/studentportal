// A date of birth cannot be in the future, and nothing was stopping one.
//
// Four registered students are on file with a DOB a few days after their own
// record was created — Saboor Khan's is 2026-09-21. The pattern is not
// mistyping: the field is required, so whoever filled it in left the picker
// near today and submitted. None of the four DOB inputs set a max and none of
// the five write paths checked, and the value flows straight onto the
// generated agreement PDF, which is the copy the student signs.
//
// So "not in the future" is not a strong enough rule — two of those four are
// dated today, which a future check accepts. The bound is a minimum age
// instead. Ten years is far below any real applicant (HMARK's youngest are
// school leavers, 16 and up) while still catching every picker-left-near-today
// mistake, which is the only way this has actually gone wrong.

/** Nobody enrolling through a consultancy is younger than this. */
export const DOB_MIN_AGE_YEARS = 10;

export const DOB_MIN = "1900-01-01";

const karachiToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });

/**
 * The latest date that could be a real applicant's, as yyyy-mm-dd: today in
 * Asia/Karachi (the office's day, not the server's) less the minimum age.
 */
export function dobMax() {
  const [y, m, d] = karachiToday().split("-").map(Number);
  // Via Date rather than string arithmetic so a leap day yields a real date:
  // subtracting ten years from 29 February would otherwise produce
  // "2018-02-29", which browsers discard as an invalid max, silently leaving
  // the input unbounded.
  return new Date(Date.UTC(y - DOB_MIN_AGE_YEARS, m - 1, d)).toISOString().slice(0, 10);
}

/**
 * Bounds to spread onto a date-of-birth input, for immediate feedback in the
 * browser. The server check below is the one that decides.
 *
 * suppressHydrationWarning is deliberate: max is derived from today, so a form
 * rendered at 23:59 in Karachi and hydrated a minute later would disagree by
 * one day and take the whole tree down to a client re-render. The attribute is
 * allowed to differ; nothing depends on which of the two days won.
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
  if (raw > karachiToday()) return "The date of birth is in the future — check the year.";
  if (raw > dobMax()) return `That date of birth is too recent to be right — it would make them under ${DOB_MIN_AGE_YEARS}. Check the year.`;
  if (raw < DOB_MIN) return "That date of birth is too far in the past — check the year.";
  return null;
}
