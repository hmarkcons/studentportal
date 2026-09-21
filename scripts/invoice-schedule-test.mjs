import test from "node:test";
import assert from "node:assert/strict";
import { computeInvoiceMath } from "../src/lib/invoiceMath.ts";
import { planScheduleChange } from "../src/lib/invoiceSchedule.ts";

// The invoice the production check raises: 1,800 fee, 300 admin, 5% tax, in
// three. Its plan is [930, 630, 630]; with a 100 item on it, [1035, 630, 630].
const BASE = { consultancyFee: 1800, adminCharge: 300, discountAmount: 0, taxRate: 5 };
const WITH_ITEM = computeInvoiceMath({ ...BASE, extras: 100 });
const WITHOUT = computeInvoiceMath(BASE);

const row = (no, amount, extra = {}) => ({
  id: `i${no}`,
  installment_no: no,
  amount,
  amount_paid: 0,
  status: "unpaid",
  extras_amount: 0,
  ...extra,
});
const sum = (rows, writes) =>
  Math.round(
    rows.reduce((s, r) => s + (writes.find((w) => w.id === r.id)?.amount ?? Number(r.amount)), 0) * 100
  ) / 100;

test("an invoice with no instalments has nothing to re-price", () => {
  assert.deepEqual(planScheduleChange([], WITH_ITEM), { ok: true, kind: "none", writes: [] });
});

test("nothing paid yet: the plan is rebuilt with the item on the first instalment", () => {
  const rows = [row(1, 930), row(2, 630), row(3, 630)];
  const plan = planScheduleChange(rows, WITH_ITEM);
  assert.equal(plan.ok, true);
  assert.equal(plan.kind, "rebuild");
  assert.deepEqual(plan.writes, [
    { id: "i1", amount: 1035, extras_amount: 105 },
    { id: "i2", amount: 630, extras_amount: 0 },
    { id: "i3", amount: 630, extras_amount: 0 },
  ]);
  assert.equal(sum(rows, plan.writes), WITH_ITEM.total);
});

test("nothing paid yet: removing the item rebuilds the plan back to what it was", () => {
  const rows = [row(1, 1035, { extras_amount: 105 }), row(2, 630), row(3, 630)];
  const plan = planScheduleChange(rows, WITHOUT);
  assert.equal(plan.kind, "rebuild");
  assert.deepEqual(plan.writes, [
    { id: "i1", amount: 930, extras_amount: 0 },
    { id: "i2", amount: 630, extras_amount: 0 },
    { id: "i3", amount: 630, extras_amount: 0 },
  ]);
});

test("rows are taken in instalment order however they arrive", () => {
  const rows = [row(3, 630), row(1, 930), row(2, 630)];
  const plan = planScheduleChange(rows, WITH_ITEM);
  assert.deepEqual(
    plan.writes.map((w) => [w.id, w.amount]),
    [["i1", 1035], ["i2", 630], ["i3", 630]]
  );
});

test("money already in: the paid instalment is untouched and the item lands on the next unpaid one", () => {
  const rows = [row(1, 930, { status: "paid", amount_paid: 930 }), row(2, 630), row(3, 630)];
  const plan = planScheduleChange(rows, WITH_ITEM);
  assert.equal(plan.ok, true);
  assert.equal(plan.kind, "shift");
  assert.deepEqual(plan.writes, [{ id: "i2", amount: 735, extras_amount: 105 }]);
  assert.equal(sum(rows, plan.writes), WITH_ITEM.total);
});

test("a part-paid instalment counts as settled and is skipped too", () => {
  const rows = [row(1, 930, { status: "paid", amount_paid: 930 }), row(2, 630, { status: "partial", amount_paid: 200 }), row(3, 630)];
  const plan = planScheduleChange(rows, WITH_ITEM);
  assert.deepEqual(plan.writes, [{ id: "i3", amount: 735, extras_amount: 105 }]);
});

test("removing an item comes off the unpaid instalment that carries it", () => {
  const rows = [row(1, 930, { status: "paid", amount_paid: 930 }), row(2, 735, { extras_amount: 105 }), row(3, 630)];
  const plan = planScheduleChange(rows, WITHOUT);
  assert.equal(plan.kind, "shift");
  assert.deepEqual(plan.writes, [{ id: "i2", amount: 630, extras_amount: 0 }]);
  assert.equal(sum(rows, plan.writes), WITHOUT.total);
});

test("removing an item that was paid for comes off the next unpaid instalment, and extras never go negative", () => {
  // The item went on instalment 1 and the student paid it. Taking the item
  // off now reduces what is still owed; the refund is effectively against the
  // next instalment.
  const rows = [row(1, 1035, { status: "paid", amount_paid: 1035, extras_amount: 105 }), row(2, 630), row(3, 630)];
  const plan = planScheduleChange(rows, WITHOUT);
  assert.deepEqual(plan.writes, [{ id: "i2", amount: 525, extras_amount: 0 }]);
  assert.equal(sum(rows, plan.writes), WITHOUT.total);
});

test("when the total is already right nothing is written", () => {
  const rows = [row(1, 930, { status: "paid", amount_paid: 930 }), row(2, 630), row(3, 630)];
  assert.deepEqual(planScheduleChange(rows, WITHOUT), { ok: true, kind: "none", writes: [] });
});

test("every instalment paid: the change is refused rather than invented", () => {
  const rows = [
    row(1, 930, { status: "paid", amount_paid: 930 }),
    row(2, 630, { status: "paid", amount_paid: 630 }),
    row(3, 630, { status: "paid", amount_paid: 630 }),
  ];
  const plan = planScheduleChange(rows, WITH_ITEM);
  assert.equal(plan.ok, false);
  assert.match(plan.error, /already been paid/);
  assert.match(plan.error, /new invoice/);
});

test("a removal that would leave an instalment with nothing to pay is refused, naming it", () => {
  // A 100 second instalment cannot absorb taking 130 off.
  const rows = [row(1, 930, { status: "paid", amount_paid: 930 }), row(2, 100)];
  const smaller = computeInvoiceMath({ consultancyFee: 600, adminCharge: 300, discountAmount: 0, taxRate: 0 });
  const plan = planScheduleChange(rows, smaller);
  assert.equal(plan.ok, false);
  assert.match(plan.error, /instalment 2/);
});

test("amounts that arrive as strings are read as numbers", () => {
  const rows = [row(1, "930.00", { status: "paid", amount_paid: "930.00" }), row(2, "630.00", { extras_amount: "0.00" }), row(3, "630.00")];
  const plan = planScheduleChange(rows, WITH_ITEM);
  assert.deepEqual(plan.writes, [{ id: "i2", amount: 735, extras_amount: 105 }]);
});
