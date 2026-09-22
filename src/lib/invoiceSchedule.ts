// Where an invoice's added items sit in its payment schedule, and what the
// instalment amounts have to become to say so.
//
// The schedule is what the student is actually asked to pay, and every
// paid/outstanding figure in the system is derived from it (see
// computePaymentProgress). So when the items change, the schedule has to
// follow or the invoice starts telling two stories: a Total on the breakdown
// and a different sum on the instalments beneath it, with the Payments page
// reduced to warning the student that the two don't agree.
//
// Staff choose where each item goes — a particular instalment, or divided
// equally across the unpaid ones — and that choice is stored on the item
// (invoice_line_items.placement_*, migration 0257). So the distribution is
// RECOMPUTED from the items every time rather than nudged by deltas: adding,
// removing and re-pricing all go through one rule, and repeating a
// calculation cannot drift from the one before it.
//
// Two invariants, both unit-tested:
//
//   the parts sum to math.total     The invoice is paid in full exactly when
//                                   every instalment is. Anything left over
//                                   from rounding, or freed by removing an
//                                   item somebody already paid for, lands on
//                                   the first instalment still outstanding.
//
//   a settled instalment is never   It is a record of money that changed
//   written to                      hands. An item placed on one that has
//                                   since been paid stays where it is.
import { adminLoad, feeSideTotal, splitIntoInstallments, type InvoiceMath } from "./invoiceMath.ts";

export type ScheduleRow = {
  id: string;
  installment_no: number;
  amount: number | string | null;
  amount_paid?: number | string | null;
  status: string | null;
  extras_amount?: number | string | null;
};

/** An invoice_line_items row, as far as placement is concerned. */
export type PlacedItem = {
  id?: string;
  amount: number | string | null;
  /** The instalment staff put it on. */
  placement_installment_id?: string | null;
  /** True when staff chose to divide it across the unpaid instalments. */
  placement_spread?: boolean | null;
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
export function isSettled(row: ScheduleRow): boolean {
  return row.status === "paid" || num(row.amount_paid) > 0;
}

/** The instalments an item may be placed on: the ones still outstanding. */
export function placeableInstallments(rows: readonly ScheduleRow[]): ScheduleRow[] {
  return [...rows].sort((a, b) => a.installment_no - b.installment_no).filter((r) => !isSettled(r));
}

/**
 * What each outstanding instalment should carry in added items, including the
 * tax on them.
 *
 * An item placed on an instalment that has since been paid is not
 * redistributed — that money is already in that instalment's amount, and
 * moving it would rewrite a settled row. Everything else goes where staff put
 * it, or is divided equally across the outstanding instalments with the
 * rounding remainder on the last, the same convention splitIntoInstallments
 * uses for the fee itself.
 */
export function distributeExtras(
  rows: readonly ScheduleRow[],
  items: readonly PlacedItem[],
  math: InvoiceMath
): Map<string, number> {
  const open = placeableInstallments(rows);
  const settledIds = new Set(rows.filter(isSettled).map((r) => r.id));
  const openIds = new Set(open.map((r) => r.id));
  const target = new Map<string, number>(open.map((r) => [r.id, 0]));
  if (open.length === 0) return target;

  // Tax rides with the item it is charged on, so what lands on an instalment
  // is the item plus its tax.
  const withTax = (amount: number) => money(Math.max(0, amount) * (1 + math.taxRate / 100));

  let spreadPool = 0;
  for (const item of items) {
    const placedOn = item.placement_installment_id ?? null;
    // Already paid for, on a row that must not be touched.
    if (placedOn && settledIds.has(placedOn)) continue;
    const load = withTax(num(item.amount));
    // Spread when staff said so, when the instalment they chose has since been
    // deleted, and for items that predate the choice existing at all.
    if (item.placement_spread || !placedOn || !openIds.has(placedOn)) {
      spreadPool = money(spreadPool + load);
    } else {
      target.set(placedOn, money((target.get(placedOn) ?? 0) + load));
    }
  }

  if (spreadPool > 0) {
    const shares = splitIntoInstallments(spreadPool, open.length);
    open.forEach((r, i) => target.set(r.id, money((target.get(r.id) ?? 0) + shares[i])));
  }

  return target;
}

/**
 * What to write to the schedule so that it sums to `math.total` again.
 *
 * `rows` is the schedule as it stands, `items` the line items as they will be
 * once the change has gone through, and `math` the invoice's money with that
 * change already applied.
 */
export function planScheduleChange(
  rows: readonly ScheduleRow[],
  items: readonly PlacedItem[],
  math: InvoiceMath
): ScheduleChange {
  const sorted = [...rows].sort((a, b) => a.installment_no - b.installment_no);
  if (sorted.length === 0) return { ok: true, kind: "none", writes: [] };

  const open = sorted.filter((r) => !isSettled(r));
  const settledTotal = money(sorted.filter(isSettled).reduce((s, r) => s + num(r.amount), 0));
  const target = distributeExtras(sorted, items, math);

  const nothingPaid = open.length === sorted.length;
  let amounts: number[];

  if (nothingPaid) {
    // Rebuilt as the invoice would have been raised with these items on it:
    // equal shares of the fee and its tax, the administrative charge (with its
    // own tax) on the first, and each item where staff put it.
    const base = splitIntoInstallments(feeSideTotal(math), open.length);
    base[0] = money(base[0] + adminLoad(math));
    amounts = open.map((r, i) => money(base[i] + (target.get(r.id) ?? 0)));
  } else {
    // Settled instalments stand. Each outstanding one keeps whatever of it was
    // never about added items, and takes on its new share of them.
    amounts = open.map((r) => money(num(r.amount) - num(r.extras_amount) + (target.get(r.id) ?? 0)));
  }

  // Whatever is still unaccounted for goes on the first instalment still
  // outstanding. In practice this is a rounding cent, or the credit for an
  // item that was removed after the student had already paid for it — its
  // money sits in a settled instalment that cannot be rewritten, so what they
  // owe next comes down instead.
  const residual = money(math.total - settledTotal - amounts.reduce((s, a) => s + a, 0));
  if (open.length === 0) {
    if (Math.abs(residual) < 0.005) return { ok: true, kind: "none", writes: [] };
    return {
      ok: false,
      error:
        "Every instalment on this invoice has already been paid, so there is nothing left to carry the change. Raise a new invoice for the extra item instead.",
    };
  }
  amounts[0] = money(amounts[0] + residual);

  const short = open.findIndex((_, i) => amounts[i] <= 0);
  if (short !== -1) {
    return {
      ok: false,
      error: `This would leave instalment ${open[short].installment_no} with nothing left to pay. Adjust the unpaid instalments by hand instead.`,
    };
  }

  const writes: ScheduleWrite[] = [];
  open.forEach((r, i) => {
    const extras = money(target.get(r.id) ?? 0);
    if (Math.abs(amounts[i] - num(r.amount)) < 0.005 && Math.abs(extras - num(r.extras_amount)) < 0.005) return;
    writes.push({ id: r.id, amount: amounts[i], extras_amount: extras });
  });

  if (writes.length === 0) return { ok: true, kind: "none", writes: [] };
  return { ok: true, kind: nothingPaid ? "rebuild" : "shift", writes };
}
