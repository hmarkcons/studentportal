import test from "node:test";
import assert from "node:assert/strict";
import { computeInvoiceMath } from "../src/lib/invoiceMath.ts";
import { distributeExtras, placeableInstallments, planScheduleChange } from "../src/lib/invoiceSchedule.ts";

// The invoice the production check raises: 1,800 fee, 300 admin, 5% tax, in
// three. Its plan is [930, 630, 630]. A 100 item carries 5 tax with it, so
// 105 has to land somewhere and the total becomes 2,295.
//
// Pinned to the `services` tax rule on purpose. These tests are about where
// money lands in the schedule, not about what the tax is charged on, and
// pinning it keeps the arithmetic in the expectations small enough to read.
// The rule itself is covered in invoice-math-test.mjs, and the one test at the
// foot of this file proves the administrative fee's own tax rides with it.
const BASE = { consultancyFee: 1800, adminCharge: 300, discountAmount: 0, taxRate: 5, taxBase: "services" };
const WITHOUT = computeInvoiceMath(BASE);
const WITH_ITEM = computeInvoiceMath({ ...BASE, extras: 100 });

const row = (no, amount, extra = {}) => ({
  id: `i${no}`,
  installment_no: no,
  amount,
  amount_paid: 0,
  status: "unpaid",
  extras_amount: 0,
  ...extra,
});
const plain = () => [row(1, 930), row(2, 630), row(3, 630)];
const item = (amount, placement) => ({
  id: "li1",
  amount,
  placement_installment_id: placement === "spread" ? null : placement,
  placement_spread: placement === "spread",
});

/** What the schedule sums to once these writes are applied. */
const totalAfter = (rows, writes) =>
  Math.round(
    rows.reduce((s, r) => s + (writes.find((w) => w.id === r.id)?.amount ?? Number(r.amount)), 0) * 100
  ) / 100;

test("an invoice with no instalments has nothing to re-price", () => {
  assert.deepEqual(planScheduleChange([], [item(100, "i1")], WITH_ITEM), { ok: true, kind: "none", writes: [] });
});

test("only outstanding instalments can be chosen", () => {
  const rows = [row(1, 930, { status: "paid", amount_paid: 930 }), row(2, 630), row(3, 630, { status: "partial", amount_paid: 10 })];
  assert.deepEqual(placeableInstallments(rows).map((r) => r.installment_no), [2]);
});

test("nothing paid: an item goes on the instalment staff chose", () => {
  for (const [target, expected] of [
    ["i1", [1035, 630, 630]],
    ["i2", [930, 735, 630]],
    ["i3", [930, 630, 735]],
  ]) {
    const rows = plain();
    const plan = planScheduleChange(rows, [item(100, target)], WITH_ITEM);
    assert.equal(plan.ok, true);
    assert.equal(plan.kind, "rebuild");
    assert.deepEqual(
      rows.map((r) => plan.writes.find((w) => w.id === r.id)?.amount ?? Number(r.amount)),
      expected,
      `placed on ${target}`
    );
    assert.equal(totalAfter(rows, plan.writes), WITH_ITEM.total);
    // The instalment carrying it says how much of it is the item.
    assert.equal(plan.writes.find((w) => w.id === target).extras_amount, 105);
  }
});

test("nothing paid: divided equally puts the same share on every instalment", () => {
  const rows = plain();
  const plan = planScheduleChange(rows, [item(100, "spread")], WITH_ITEM);
  assert.deepEqual(
    rows.map((r) => plan.writes.find((w) => w.id === r.id)?.amount ?? Number(r.amount)),
    [965, 665, 665]
  );
  assert.equal(totalAfter(rows, plan.writes), WITH_ITEM.total);
  assert.deepEqual(plan.writes.map((w) => w.extras_amount), [35, 35, 35]);
});

test("a division that does not come out evenly still sums exactly, remainder last", () => {
  const math = computeInvoiceMath({ consultancyFee: 1000, adminCharge: 0, discountAmount: 0, taxRate: 0, extras: 100 });
  const rows = [row(1, 333.34), row(2, 333.33), row(3, 333.33)];
  const plan = planScheduleChange(rows, [item(100, "spread")], math);
  const shares = plan.writes.map((w) => w.extras_amount);
  assert.deepEqual(shares, [33.33, 33.33, 33.34]);
  assert.equal(totalAfter(rows, plan.writes), math.total);
});

test("money already in: the paid instalment is untouched and the item goes where staff chose", () => {
  const rows = [row(1, 930, { status: "paid", amount_paid: 930 }), row(2, 630), row(3, 630)];
  const plan = planScheduleChange(rows, [item(100, "i2")], WITH_ITEM);
  assert.equal(plan.kind, "shift");
  assert.deepEqual(plan.writes, [{ id: "i2", amount: 735, extras_amount: 105 }]);
  assert.equal(totalAfter(rows, plan.writes), WITH_ITEM.total);
});

test("money already in: dividing equally uses only the instalments still outstanding", () => {
  const rows = [row(1, 930, { status: "paid", amount_paid: 930 }), row(2, 630), row(3, 630)];
  const plan = planScheduleChange(rows, [item(100, "spread")], WITH_ITEM);
  assert.deepEqual(plan.writes, [
    { id: "i2", amount: 682.5, extras_amount: 52.5 },
    { id: "i3", amount: 682.5, extras_amount: 52.5 },
  ]);
  assert.equal(totalAfter(rows, plan.writes), WITH_ITEM.total);
});

test("a part-paid instalment counts as settled and is skipped", () => {
  const rows = [row(1, 930, { status: "paid", amount_paid: 930 }), row(2, 630, { status: "partial", amount_paid: 200 }), row(3, 630)];
  const plan = planScheduleChange(rows, [item(100, "spread")], WITH_ITEM);
  assert.deepEqual(plan.writes, [{ id: "i3", amount: 735, extras_amount: 105 }]);
});

test("removing the item puts the schedule back exactly as it was", () => {
  const rows = [row(1, 1035, { extras_amount: 105 }), row(2, 630), row(3, 630)];
  const plan = planScheduleChange(rows, [], WITHOUT);
  assert.deepEqual(plan.writes, [{ id: "i1", amount: 930, extras_amount: 0 }]);
  assert.equal(totalAfter(rows, plan.writes), WITHOUT.total);
});

test("removing an item the student already paid for credits the next instalment", () => {
  // The item went on instalment 1 and was paid. Its money cannot be taken back
  // out of a settled row, so what is still owed comes down instead.
  const rows = [row(1, 1035, { status: "paid", amount_paid: 1035, extras_amount: 105 }), row(2, 630), row(3, 630)];
  const plan = planScheduleChange(rows, [], WITHOUT);
  assert.deepEqual(plan.writes, [{ id: "i2", amount: 525, extras_amount: 0 }]);
  assert.equal(totalAfter(rows, plan.writes), WITHOUT.total);
});

test("an item on a settled instalment stays there when another is added elsewhere", () => {
  const rows = [row(1, 1035, { status: "paid", amount_paid: 1035, extras_amount: 105 }), row(2, 630), row(3, 630)];
  const both = computeInvoiceMath({ ...BASE, extras: 200 });
  const plan = planScheduleChange(
    rows,
    [{ id: "a", amount: 100, placement_installment_id: "i1" }, { id: "b", amount: 100, placement_installment_id: "i3" }],
    both
  );
  // Instalment 1 is not written to at all; the new item lands on 3.
  assert.deepEqual(plan.writes, [{ id: "i3", amount: 735, extras_amount: 105 }]);
  assert.equal(totalAfter(rows, plan.writes), both.total);
});

test("an item whose instalment was deleted falls back to being divided", () => {
  const rows = plain();
  const plan = planScheduleChange(rows, [item(100, "gone")], WITH_ITEM);
  assert.deepEqual(plan.writes.map((w) => w.extras_amount), [35, 35, 35]);
});

test("an item that predates the choice is divided rather than dropped", () => {
  const rows = plain();
  const plan = planScheduleChange(rows, [{ id: "old", amount: 100 }], WITH_ITEM);
  assert.equal(totalAfter(rows, plan.writes), WITH_ITEM.total);
  assert.deepEqual(plan.writes.map((w) => w.extras_amount), [35, 35, 35]);
});

test("when nothing would change, nothing is written", () => {
  const rows = [row(1, 1035, { extras_amount: 105 }), row(2, 630), row(3, 630)];
  assert.deepEqual(planScheduleChange(rows, [item(100, "i1")], WITH_ITEM), { ok: true, kind: "none", writes: [] });
});

test("every instalment paid: the change is refused rather than invented", () => {
  const rows = [1, 2, 3].map((n) => row(n, n === 1 ? 930 : 630, { status: "paid", amount_paid: n === 1 ? 930 : 630 }));
  const plan = planScheduleChange(rows, [item(100, "spread")], WITH_ITEM);
  assert.equal(plan.ok, false);
  assert.match(plan.error, /already been paid/);
  assert.match(plan.error, /new invoice/);
});

test("a change that would leave an instalment with nothing to pay is refused, naming it", () => {
  const rows = [row(1, 930, { status: "paid", amount_paid: 930 }), row(2, 100)];
  const smaller = computeInvoiceMath({ consultancyFee: 600, adminCharge: 300, discountAmount: 0, taxRate: 0 });
  const plan = planScheduleChange(rows, [], smaller);
  assert.equal(plan.ok, false);
  assert.match(plan.error, /instalment 2/);
});

test("amounts that arrive as strings are read as numbers", () => {
  const rows = [
    row(1, "930.00", { status: "paid", amount_paid: "930.00" }),
    row(2, "630.00", { extras_amount: "0.00" }),
    row(3, "630.00"),
  ];
  const plan = planScheduleChange(rows, [{ id: "li1", amount: "100.00", placement_installment_id: "i2" }], WITH_ITEM);
  assert.deepEqual(plan.writes, [{ id: "i2", amount: 735, extras_amount: 105 }]);
});

test("rows are taken in instalment order however they arrive", () => {
  const rows = [row(3, 630), row(1, 930), row(2, 630)];
  const plan = planScheduleChange(rows, [item(100, "spread")], WITH_ITEM);
  assert.deepEqual(plan.writes.map((w) => w.id), ["i1", "i2", "i3"]);
});

test("distributeExtras hands back nothing when every instalment is settled", () => {
  const rows = [row(1, 930, { status: "paid", amount_paid: 930 })];
  assert.equal(distributeExtras(rows, [item(100, "i1")], WITH_ITEM).size, 0);
});

test("under the current rule the administrative fee's own tax rides with it", () => {
  const math = computeInvoiceMath({ consultancyFee: 1800, adminCharge: 300, discountAmount: 0, taxRate: 5, extras: 100 });
  const rows = [row(1, 945), row(2, 630), row(3, 630)];
  const plan = planScheduleChange(rows, [item(100, "i1")], math);
  // 1890 fee side in three is 630 each; the first also carries 300 admin plus
  // its 15 of tax, and the 100 item plus its 5.
  assert.deepEqual(
    rows.map((r) => plan.writes.find((w) => w.id === r.id)?.amount ?? Number(r.amount)),
    [1050, 630, 630]
  );
  assert.equal(totalAfter(rows, plan.writes), math.total);
  assert.equal(math.total, 2310);
});

test("the parts sum to the total across a sweep of shapes", () => {
  for (const extras of [0, 0.01, 7, 33.33, 999.99]) {
    for (const count of [1, 2, 3, 7, 9]) {
      for (const taxRate of [0, 5]) {
        for (const taxBase of ["services", "total"]) {
        const math = computeInvoiceMath({ consultancyFee: 1000, adminCharge: 250, discountAmount: 0, taxRate, taxBase, extras });
        const base = computeInvoiceMath({ consultancyFee: 1000, adminCharge: 250, discountAmount: 0, taxRate, taxBase });
        const per = Math.round((base.total / count) * 100) / 100;
        const rows = Array.from({ length: count }, (_, i) => row(i + 1, per));
        for (const placement of ["spread", "i1", `i${count}`]) {
          const items = extras > 0 ? [item(extras, placement)] : [];
          const plan = planScheduleChange(rows, items, math);
          assert.equal(plan.ok, true, `${extras}/${count}/${taxRate}/${taxBase}/${placement}`);
          assert.equal(
            totalAfter(rows, plan.writes),
            math.total,
            `extras ${extras} over ${count} at ${taxRate}% on ${taxBase}, placed ${placement}`
          );
        }
        }
      }
    }
  }
});
