// How an invoice's instalment schedule absorbs a change to its total after
// the invoice has been raised — today, an item added or removed.
//
// The schedule is the thing the student is actually asked to pay, and every
// paid/outstanding figure in the system is derived from it (see
// computePaymentProgress). So when the total changes, the schedule has to
// follow or the invoice starts telling two stories: a Total on the breakdown
// and a different sum on the instalments beneath it, with the Payments page
// reduced to warning the student that the two don't agree.
//
// Two cases, decided here so the rule is unit-tested and the action only
// carries it out:
//
//   nothing paid yet   The plan is rebuilt from scratch, exactly as it would
//                      have been raised with the item on it: equal shares of
//                      the fee, with the admin charge and the added items on
//                      the first instalment (buildInstallmentPlan).
//
//   money already in   A settled instalment is a record of a payment that
//                      happened, so it is never touched. The difference lands
//                      on the first unpaid instalment — the next money in —
//                      and that instalment's extras_amount records that it is
//                      carrying an added item, so the schedule can still say
//                      why it is bigger. Removing an item comes off the first
//                      unpaid instalment that carries one.
//
// Either way the parts sum to the new total, or the change is refused with a
// reason a person can act on.
import { buildInstallmentPlan, extrasLoad, type InvoiceMath } from "./invoiceMath.ts";

export type ScheduleRow = {
  id: string;
  installment_no: number;
  amount: number | string | null;
  amount_paid?: number | string | null;
  status: string | null;
  extras_amount?: number | string | null;
};

/** One instalment's new figures, for apply_invoice_line_item_change. */
export type ScheduleWrite = { id: string; amount: number; extras_amount: number };

export type ScheduleChange =
  | { ok: true; kind: "none" | "rebuild" | "shift"; writes: ScheduleWrite[] }
  | { ok: false; error: string };

function money(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function num(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : v ?? 0;
  return Number.isFinite(n) ? n : 0;
}

/** A payment has been recorded against it, in full or in part. */
function settled(row: ScheduleRow): boolean {
  return row.status === "paid" || num(row.amount_paid) > 0;
}

/**
 * What to write to the schedule so that it sums to `math.total` again.
 *
 * `rows` is the schedule as it stands; `math` is the invoice's money with the
 * change already applied (the item added to or removed from `extras`).
 */
export function planScheduleChange(rows: readonly ScheduleRow[], math: InvoiceMath): ScheduleChange {
  const sorted = [...rows].sort((a, b) => a.installment_no - b.installment_no);
  if (sorted.length === 0) return { ok: true, kind: "none", writes: [] };

  const scheduleTotal = money(sorted.reduce((s, r) => s + num(r.amount), 0));
  const delta = money(math.total - scheduleTotal);

  if (!sorted.some(settled)) {
    // Nothing has been paid, so the plan can be what it would have been had
    // the invoice been raised like this — which is also what puts an item on
    // the first instalment, where the administrative charge already sits.
    const amounts = buildInstallmentPlan(math, sorted.length);
    const load = extrasLoad(math);
    return {
      ok: true,
      kind: "rebuild",
      writes: sorted.map((r, i) => ({ id: r.id, amount: amounts[i], extras_amount: i === 0 ? load : 0 })),
    };
  }

  if (Math.abs(delta) < 0.005) return { ok: true, kind: "none", writes: [] };

  const open = sorted.filter((r) => !settled(r));
  if (open.length === 0) {
    return {
      ok: false,
      error:
        "Every instalment on this invoice has already been paid, so there is nothing left to carry the change. Raise a new invoice for the extra item instead.",
    };
  }

  // Adding lands on the next money in. Removing comes off the first unpaid
  // instalment that is carrying an added item, since that is where the money
  // being removed was put; failing that, the next unpaid one.
  const target = delta > 0 ? open[0] : open.find((r) => num(r.extras_amount) > 0) ?? open[0];

  const amount = money(num(target.amount) + delta);
  if (amount <= 0) {
    return {
      ok: false,
      error: `Removing this item would leave instalment ${target.installment_no} with nothing left to pay. Adjust the unpaid instalments by hand instead.`,
    };
  }

  return {
    ok: true,
    kind: "shift",
    writes: [{ id: target.id, amount, extras_amount: money(Math.max(0, num(target.extras_amount) + delta)) }],
  };
}
