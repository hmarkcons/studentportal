/**
 * Euro amounts said again in rupees.
 *
 * Every figure on a receipt is in euro because that is what the agreement is
 * denominated in, and every student paying one is paying in rupees. Printing
 * both is the difference between a receipt somebody can check against their
 * bank transfer and one they have to do arithmetic on.
 *
 * The rate is whatever the invoice was stamped with, never today's: a receipt
 * already in a student's hands must not restate itself because the office
 * corrected the rate in Setup.
 */

/** The rate to fall back on before one has ever been set. */
export const DEFAULT_PKR_PER_EUR = 335;

/**
 * Rupees for a euro amount, to the nearest rupee.
 *
 * Nobody quotes paisa, and a receipt with PKR 586,249.75 on it invites a
 * question about the 75 that has no interesting answer.
 */
export function pkrFromEur(eur: number, rate: number | null | undefined): number | null {
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return null;
  if (!Number.isFinite(eur)) return null;
  return Math.round(eur * rate);
}

/** "PKR 586,250" — grouped, because seven digits unseparated are unreadable. */
export function formatPkr(amount: number): string {
  return `PKR ${Math.round(amount).toLocaleString("en-US")}`;
}

/**
 * The rupee line for a euro figure, or null when there is no rate to use.
 *
 * Null rather than a guess: an invoice issued before the rate existed was
 * never quoted in rupees, and inventing one now would put a number on a
 * historical receipt that nobody ever agreed to.
 */
export function pkrLine(eur: number, rate: number | null | undefined): string | null {
  const pkr = pkrFromEur(eur, rate);
  return pkr === null ? null : formatPkr(pkr);
}

/** Said once at the foot of the receipt, so the arithmetic is checkable. */
export function pkrRateNote(rate: number | null | undefined): string | null {
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return null;
  // Trailing zeros trimmed: "335", not "335.00", unless the rate is fractional.
  const shown = Number.isInteger(rate) ? String(rate) : String(Number(rate.toFixed(2)));
  return `Rupee amounts shown at PKR ${shown} per €1, the rate on the date this was issued.`;
}
