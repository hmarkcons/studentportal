// A contact number has to be long enough to dial.
//
// "121", "555", "8181", "1254" and "090078601" are all on file against
// registered students, and an emergency contact reads "4515". These reach the
// generated agreement PDF and are the only way the office can call a student,
// so a number nobody can ring is worse than a blank one — a blank at least
// shows up as missing on the profile checklist.
//
// Ten digits is the floor rather than a per-country format. A Pakistani mobile
// is eleven (03xx xxxxxxx) and a Karachi landline ten (021 xxxxxxx), and HMARK
// students give numbers from several countries, so pattern-matching one shape
// would reject real people. Counting digits catches everything actually seen
// without guessing at format. Spaces, dashes, brackets and a leading + are all
// allowed and ignored.

export const PHONE_MIN_DIGITS = 10;
export const PHONE_MAX_DIGITS = 15; // E.164's limit.

const digits = (v: string) => v.replace(/\D/g, "");

/**
 * Returns a message when the number cannot be right, or null. An empty value
 * is not an error here — whether the field is required is the form's business.
 * `label` names the field so an error on one of several numbers on the same
 * form says which one.
 */
export function phoneError(value: FormDataEntryValue | string | null | undefined, label = "contact number") {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  if (/[^\d\s+()\-.]/.test(raw)) return `That ${label} contains characters that aren't part of a phone number.`;
  const count = digits(raw).length;
  if (count < PHONE_MIN_DIGITS) {
    return `That ${label} is only ${count} digit${count === 1 ? "" : "s"} — enter the full number, including the area or network code.`;
  }
  if (count > PHONE_MAX_DIGITS) return `That ${label} is longer than any real phone number.`;
  return null;
}

/** True when the stored value is one nobody could dial. */
export function isImplausiblePhone(value: string | null | undefined) {
  return phoneError(value) !== null;
}

/**
 * Like phoneError, but silent when the value has not been touched.
 *
 * A validator's job is to stop bad data being entered, not to hold an existing
 * record hostage. Three real students already carry a number this rejects —
 * Saboor Khan's contact is nine digits, his emergency contact reads "4515",
 * and Shah Nawaz's home phone field holds an address — so a plain check would
 * lock staff out of saving anything on those records, including the date of
 * birth correction they were opening the form to make. The bad values are
 * surfaced inline on the profile form instead, and become unsaveable the
 * moment anyone edits the field itself.
 */
export function phoneChangeError(
  submitted: FormDataEntryValue | string | null | undefined,
  stored: string | null | undefined,
  label = "contact number"
) {
  const raw = typeof submitted === "string" ? submitted.trim() : "";
  if (raw === (stored ?? "").trim()) return null;
  return phoneError(raw, label);
}

/**
 * The `pattern` attribute equivalent of phoneError, kept beside it so the two
 * cannot drift: the browser must never refuse a number the server would take,
 * or accept one it would not.
 *
 * Built with a RegExp rather than written as a string literal because the
 * escapes matter — a `\d` that collapses to a literal `d` produces a pattern
 * that silently rejects every number, and pattern failures are invisible
 * except as a form that will not submit.
 */
const PHONE_PATTERN = new RegExp(`^\\+?(?:[\\s()\\-.]*\\d){${PHONE_MIN_DIGITS},${PHONE_MAX_DIGITS}}[\\s()\\-.]*$`);

/** Attributes for a phone input: a tel keypad on mobile, plus that pattern. */
export function phoneBounds() {
  return {
    type: "tel",
    inputMode: "tel",
    pattern: PHONE_PATTERN.source,
    title: `Enter the full number — at least ${PHONE_MIN_DIGITS} digits, including the area or network code.`,
  } as const;
}

/** Whether the browser's pattern would accept this value. For tests. */
export function matchesPhonePattern(value: string) {
  return PHONE_PATTERN.test(value);
}
