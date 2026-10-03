// The date an agreement carries (0310): chosen by staff, printed on it.
//
// Student and staff agreements each keep the wording they always printed —
// "03-October-2026" on a student's, "3 October 2026" on a staff member's —
// and both now take it from agreement_date, a calendar day with no time and
// so no time zone to slip a day across.
//
// Pure, so scripts/agreement-date-test.mjs reads it under plain Node.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The range the database accepts (agreements_agreement_date_sane): wide, but not a mistyped year. */
export const AGREEMENT_DATE_MIN = "2000-01-01";
export const AGREEMENT_DATE_MAX = "2100-12-31";

/** Today in Karachi, as YYYY-MM-DD — what an agreement is dated unless staff choose another day. */
export function agreementToday(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
}

function parts(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return { y, m, d };
}

/**
 * The date a form posted, checked: a real calendar day within the range.
 * Blank is `fallback` — today when generating, the date it already has when
 * editing.
 */
export function readAgreementDate(raw: unknown, fallback: string): { date: string } | { error: string } {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return { date: fallback };
  if (!parts(value)) return { error: "Choose the agreement date from the calendar." };
  if (value < AGREEMENT_DATE_MIN || value > AGREEMENT_DATE_MAX) {
    return { error: "That agreement date is out of range — check the year." };
  }
  return { date: value };
}

/** "03-October-2026": as a student's agreement has always printed it. */
export function studentAgreementDateText(iso: string): string {
  const p = parts(iso);
  if (!p) return iso;
  return `${String(p.d).padStart(2, "0")}-${MONTHS[p.m - 1]}-${p.y}`;
}

/** "3 October 2026": as a staff agreement has always printed it. */
export function staffAgreementDateText(iso: string): string {
  const p = parts(iso);
  if (!p) return iso;
  return `${p.d} ${MONTHS[p.m - 1]} ${p.y}`;
}

/** "3 Oct 2026": for a list. */
export function agreementDateShort(iso: string): string {
  const p = parts(iso);
  if (!p) return iso;
  return `${p.d} ${MONTHS[p.m - 1].slice(0, 3)} ${p.y}`;
}
