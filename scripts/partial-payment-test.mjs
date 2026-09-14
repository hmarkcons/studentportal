import test from "node:test";
import assert from "node:assert/strict";
import {
  BALANCE_DUE_AFTER_DAYS,
  balanceDueDate,
  checkPartialSplit,
  carriedFromNote,
} from "../src/lib/partialPayment.ts";

test("the balance falls due a week after the payment", () => {
  assert.equal(BALANCE_DUE_AFTER_DAYS, 7);
  assert.equal(balanceDueDate("2026-10-01"), "2026-10-08");
});

test("a week later crosses a month, and a year, correctly", () => {
  assert.equal(balanceDueDate("2026-10-28"), "2026-11-04");
  assert.equal(balanceDueDate("2026-12-28"), "2027-01-04");
  // 2028 is a leap year.
  assert.equal(balanceDueDate("2028-02-26"), "2028-03-04");
  assert.equal(balanceDueDate("2027-02-26"), "2027-03-05");
});

test("a week later is not knocked off by a daylight-saving change", () => {
  // Pakistan does not observe DST, but the server's clock may; date-only
  // arithmetic has to be immune either way. Both of these are across the
  // dates Europe and the US change their clocks.
  assert.equal(balanceDueDate("2026-03-26"), "2026-04-02");
  assert.equal(balanceDueDate("2026-10-22"), "2026-10-29");
});

test("a missing or malformed payment date yields no default", () => {
  for (const bad of ["", "   ", "01/10/2026", "2026-10", "not a date", null, undefined]) {
    assert.equal(balanceDueDate(bad), "", String(bad));
  }
});

test("a part payment leaves the rest owing", () => {
  const r = checkPartialSplit(50000, 20000, "2026-10-08");
  assert.deepEqual(r, { ok: true, balance: 30000 });
});

test("fractions do not drift", () => {
  const r = checkPartialSplit(1000.1, 333.37, "2026-10-08");
  assert.equal(r.ok, true);
  assert.equal(r.balance, 666.73);
});

test("nothing paid is not a part payment", () => {
  for (const paid of [0, -1, NaN]) {
    const r = checkPartialSplit(50000, paid, "2026-10-08");
    assert.equal(r.ok, false, String(paid));
    assert.match(r.error, /how much was actually paid/);
  }
});

test("paying the whole installment is not a part payment", () => {
  for (const paid of [50000, 60000]) {
    const r = checkPartialSplit(50000, paid, "2026-10-08");
    assert.equal(r.ok, false, String(paid));
    assert.match(r.error, /set it to paid instead/);
  }
});

test("a balance with no due date is refused, because nothing would chase it", () => {
  const r = checkPartialSplit(50000, 20000, null);
  assert.equal(r.ok, false);
  assert.match(r.error, /due date for the balance/);
});

test("a rounding-sized remainder still counts as a part payment", () => {
  // One paisa short of the whole thing is still not the whole thing.
  const r = checkPartialSplit(50000, 49999.99, "2026-10-08");
  assert.equal(r.ok, true);
  assert.equal(r.balance, 0.01);
});

test("the balance says where it came from", () => {
  const note = carriedFromNote(2, 20000, "2026-10-01", (n) => `PKR ${n.toLocaleString("en-PK")}`, (d) => d);
  assert.equal(note, "Balance carried from installment 2, part-paid PKR 20,000 on 2026-10-01.");
});

test("an ordinary installment carries no such line", () => {
  assert.equal(carriedFromNote(null, null, null, String, String), null);
  assert.equal(carriedFromNote(undefined, 100, "2026-10-01", String, String), null);
});

test("a balance with no recorded part payment still says where it came from", () => {
  assert.equal(carriedFromNote(3, 0, null, String, String), "Balance carried from installment 3.");
  assert.equal(carriedFromNote(3, null, "2026-10-01", String, String), "Balance carried from installment 3.");
});
