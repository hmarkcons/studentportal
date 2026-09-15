import test from "node:test";
import assert from "node:assert/strict";
import { pkrFromEur, formatPkr, pkrLine, pkrRateNote, DEFAULT_PKR_PER_EUR } from "../src/lib/receiptPkr.ts";
import {
  admissionCondition,
  installmentDuePlan,
  missingDueDates,
  dueLabel,
} from "../src/lib/installmentDueConditions.ts";

test("the rate the office asked for is the default", () => {
  assert.equal(DEFAULT_PKR_PER_EUR, 335);
});

test("euros become rupees at the invoice's own rate", () => {
  assert.equal(pkrFromEur(1750, 335), 586250);
  assert.equal(pkrFromEur(875, 335), 293125);
});

test("rupees are whole, because nobody quotes paisa", () => {
  assert.equal(pkrFromEur(1.5, 335), 503); // 502.5
  assert.equal(pkrFromEur(0.01, 335), 3);
});

test("an invoice with no rate prints no rupees rather than inventing them", () => {
  // Issued before the rate existed: the student was never quoted one.
  assert.equal(pkrFromEur(1750, null), null);
  assert.equal(pkrFromEur(1750, undefined), null);
  assert.equal(pkrFromEur(1750, 0), null);
  assert.equal(pkrFromEur(1750, -5), null);
  assert.equal(pkrLine(1750, null), null);
});

test("rupee figures are grouped", () => {
  assert.equal(formatPkr(586250), "PKR 586,250");
  assert.equal(formatPkr(500), "PKR 500");
  assert.equal(pkrLine(1750, 335), "PKR 586,250");
});

test("the rate is stated once, without pointless decimals", () => {
  assert.match(pkrRateNote(335), /PKR 335 per €1/);
  assert.match(pkrRateNote(337.5), /PKR 337\.5 per €1/);
  assert.equal(pkrRateNote(null), null);
});

// ------------------------------------------------------- due conditions
test("the track decides which university the student is told about", () => {
  assert.equal(admissionCondition("public"), "On admission approval from your first public university");
  assert.equal(admissionCondition("private"), "On admission approval from your first private university");
  // An unlabelled destination reads as public, which is the common case.
  assert.equal(admissionCondition(null), "On admission approval from your first public university");
});

test("a two-installment plan ends on the admission", () => {
  const plan = installmentDuePlan(2, "public", ["2026-10-01", "2026-12-01"]);
  assert.equal(plan[0].date, "2026-10-01");
  assert.equal(plan[0].condition, null);
  assert.equal(plan[1].date, null, "the second has no date, whatever was typed into that slot");
  assert.match(plan[1].condition, /first public university/);
  assert.equal(plan[1].dateRequired, false);
});

test("a three-installment plan needs a real date for the second", () => {
  const plan = installmentDuePlan(3, "private", ["2026-10-01", "2026-11-15", "2027-01-01"]);
  assert.equal(plan[0].date, "2026-10-01");
  assert.equal(plan[1].date, "2026-11-15");
  assert.equal(plan[1].dateRequired, true, "the office asked for this one to be mandatory");
  assert.equal(plan[2].date, null);
  assert.match(plan[2].condition, /first private university/);
});

test("a three-installment plan with no second date says which one is missing", () => {
  const plan = installmentDuePlan(3, "public", ["2026-10-01", null, "2027-01-01"]);
  assert.deepEqual(missingDueDates(plan), [2]);
});

test("a complete plan is missing nothing", () => {
  assert.deepEqual(missingDueDates(installmentDuePlan(3, "public", ["2026-10-01", "2026-11-15"])), []);
  assert.deepEqual(missingDueDates(installmentDuePlan(2, "public", ["2026-10-01"])), []);
});

test("a single payment is just a date", () => {
  const plan = installmentDuePlan(1, "public", ["2026-10-01"]);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].condition, null);
  assert.equal(plan[0].date, "2026-10-01");
});

test("a plan longer than three does not fall over", () => {
  const plan = installmentDuePlan(4, "public", ["a", "b", "c", "d"]);
  assert.equal(plan.length, 4);
  assert.equal(plan[3].date, null);
  assert.match(plan[3].condition, /admission approval/);
  assert.deepEqual(plan.slice(0, 3).map((p) => p.date), ["a", "b", "c"]);
});

test("the receipt prints the date when there is one and the condition when there is not", () => {
  const plan = installmentDuePlan(2, "public", ["2026-10-01"]);
  const fmt = (iso) => `[${iso}]`;
  assert.equal(dueLabel(plan[0], fmt), "[2026-10-01]");
  assert.equal(dueLabel(plan[1], fmt), "On admission approval from your first public university");
});
