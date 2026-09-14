// Splitting a part-paid installment.
//
// A student pays 20,000 of a 50,000 installment. The installment is reduced to
// what was actually paid and closed; the 30,000 still owed becomes an
// installment of its own, due a week after the payment unless staff pick
// another date. Kept out of the action and the form so the default date, the
// validation and the sentence shown against the balance are decided once.

/** How long after a part payment the balance falls due, unless staff say otherwise. */
export const BALANCE_DUE_AFTER_DAYS = 7;

/**
 * The default due date for the balance: a week after the payment.
 *
 * Date-only arithmetic on the calendar, not on a timestamp — adding
 * 7 * 24 * 60 * 60 * 1000 to a Date lands on the wrong day either side of a
 * daylight-saving change, and a due date that moves by a day is a due date
 * somebody misses.
 */
export function balanceDueDate(paidDate: string, days = BALANCE_DUE_AFTER_DAYS): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((paidDate ?? "").trim());
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type SplitCheck = { ok: true; balance: number } | { ok: false; error: string };

/** Rounds to whole currency minor units without float drift. */
function money(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

/**
 * Whether this part payment can be split out, and what would be left owing.
 *
 * Checked here as well as in the database so the message a person reads is
 * written for them rather than being whatever the function raised.
 */
export function checkPartialSplit(amount: number, amountPaid: number, balanceDue: string | null): SplitCheck {
  const total = money(amount);
  const paid = money(amountPaid);

  if (!Number.isFinite(paid) || paid <= 0) {
    return { ok: false, error: "Enter how much was actually paid." };
  }
  if (paid >= total) {
    return { ok: false, error: "That is the whole installment — set it to paid instead of part-paid." };
  }
  if (!balanceDue) {
    return { ok: false, error: "Set a due date for the balance." };
  }
  return { ok: true, balance: money(total - paid) };
}

/**
 * Where a balance installment came from, for the line under it.
 *
 * The office asked for the split to be traceable: a four-installment agreement
 * with five installments against it should explain itself on the page rather
 * than needing someone to reconstruct it.
 */
export function carriedFromNote(
  carriedFrom: number | null | undefined,
  partPaid: number | null | undefined,
  paidDate: string | null | undefined,
  formatMoney: (n: number) => string,
  formatDate: (d: string) => string
): string | null {
  if (!carriedFrom) return null;
  const parts = [`Balance carried from installment ${carriedFrom}`];
  if (partPaid != null && Number(partPaid) > 0) {
    const when = paidDate ? ` on ${formatDate(paidDate)}` : "";
    parts.push(`part-paid ${formatMoney(Number(partPaid))}${when}`);
  }
  return `${parts.join(", ")}.`;
}
