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

// ------------------------------------------------- a rate per invoice and payment
//
// From 0318 the rate is given by whoever issues the invoice, and again by
// whoever records each payment, because the euro moves daily. An invoice keeps
// the rate it was issued at; each payment keeps the one it was received at.

/** The bounds a rate must fall in: a typo of a digit too many or too few is refused, not printed. */
export const PKR_RATE_MIN = 1;
export const PKR_RATE_MAX = 10000;

/** A rate as typed, to two decimals; null when it is not a usable rate. */
export function parsePkrRate(raw: unknown): number | null {
  const s = String(raw ?? "").trim().replace(/,/g, "");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < PKR_RATE_MIN || n > PKR_RATE_MAX) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Whether a rate is far enough from the latest one to be worth a second look —
 * 3350 for 335 — said beside the field, not refused: the euro can move.
 */
export function rateLooksOff(rate: number | null, latest: number | null | undefined): boolean {
  if (rate == null || latest == null || !(latest > 0)) return false;
  return Math.abs(rate - latest) / latest > 0.15;
}

export type PaidAtRate = { amountPaid: number; rate: number | null; paidDate: string | null; installmentNo: number };

/**
 * The rate the money still owed is said at: the one the latest payment was
 * received at, or the invoice's own before any payment. A payment recorded
 * before 0318 has no rate of its own and counts at the invoice's.
 */
export function latestInvoiceRate(issueRate: number | null, payments: PaidAtRate[]): number | null {
  if (issueRate == null) return null;
  const latest = [...payments]
    .filter((p) => p.amountPaid > 0)
    .sort((a, b) => (a.paidDate ?? "").localeCompare(b.paidDate ?? "") || a.installmentNo - b.installmentNo)
    .at(-1);
  return latest?.rate ?? issueRate;
}

/** Rupees received: each payment at the rate it was received at, or the invoice's. */
export function pkrReceived(issueRate: number | null, payments: PaidAtRate[]): number | null {
  if (issueRate == null) return null;
  return payments.reduce((sum, p) => sum + (p.amountPaid > 0 ? (pkrFromEur(p.amountPaid, p.rate ?? issueRate) ?? 0) : 0), 0);
}

const rateText = (rate: number) => (Number.isInteger(rate) ? String(rate) : String(Number(rate.toFixed(2))));

/**
 * The foot-of-receipt note saying which rates the rupee figures were struck
 * at. One sentence when everything is at the invoice's rate, as before.
 */
export function pkrRatesNote(issueRate: number | null, dueRate: number | null, paymentRates: (number | null)[]): string | null {
  if (issueRate == null || !(issueRate > 0)) return null;
  const paid = paymentRates.map((r) => r ?? issueRate);
  const due = dueRate ?? issueRate;
  if (paid.every((r) => r === issueRate) && due === issueRate) return pkrRateNote(issueRate);
  const parts = [`the total at PKR ${rateText(issueRate)} per €1, the rate on the date this was issued`];
  if (paid.length > 0) {
    const distinct = [...new Set(paid)];
    parts.push(
      distinct.length === 1
        ? `${paid.length === 1 ? "the payment" : "each payment"} at PKR ${rateText(distinct[0])} per €1, the rate on the day it was received`
        : `each payment at the rate on the day it was received (PKR ${distinct.map(rateText).join(", ")} per €1)`
    );
  }
  if (due !== issueRate) parts.push(`what is still due at PKR ${rateText(due)} per €1, the latest rate`);
  return `Rupee amounts shown: ${parts.join("; ")}.`;
}
