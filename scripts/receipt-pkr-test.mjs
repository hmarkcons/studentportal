import test from "node:test";
import assert from "node:assert/strict";
import {
  pkrFromEur,
  formatPkr,
  pkrLine,
  pkrRateNote,
  DEFAULT_PKR_PER_EUR,
  parsePkrRate,
  rateLooksOff,
  latestInvoiceRate,
  pkrReceived,
  pkrRatesNote,
} from "../src/lib/receiptPkr.ts";
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

// ------------------------------------------- a rate per invoice and payment (0318)
test("a rate is read as typed, to two decimals, and a typo out of all reason is refused", () => {
  assert.equal(parsePkrRate("335"), 335);
  assert.equal(parsePkrRate(" 337.456 "), 337.46);
  assert.equal(parsePkrRate("1,335"), 1335, "a thousands comma is a typing habit, not a decimal point");
  assert.equal(parsePkrRate(""), null);
  assert.equal(parsePkrRate("0"), null);
  assert.equal(parsePkrRate("-335"), null);
  assert.equal(parsePkrRate("33500"), null, "more than 10,000 rupees to the euro is a slipped finger");
  assert.equal(parsePkrRate("abc"), null);
});

test("a rate far from the latest is flagged for a second look, not refused", () => {
  assert.equal(rateLooksOff(340, 335), false);
  assert.equal(rateLooksOff(3350, 335), true);
  assert.equal(rateLooksOff(33.5, 335), true);
  assert.equal(rateLooksOff(340, null), false);
});

const paid = (amountPaid, rate, paidDate, installmentNo) => ({ amountPaid, rate, paidDate, installmentNo });

test("what is still owed is said at the latest payment's rate, or the invoice's before any", () => {
  assert.equal(latestInvoiceRate(335, [paid(0, null, null, 1), paid(0, null, null, 2)]), 335);
  assert.equal(latestInvoiceRate(335, [paid(500, 340, "2026-10-01", 1), paid(0, null, null, 2)]), 340);
  assert.equal(
    latestInvoiceRate(335, [paid(500, 342, "2026-10-09", 2), paid(500, 340, "2026-10-01", 1)]),
    342,
    "by the date received, not the order listed"
  );
  assert.equal(latestInvoiceRate(335, [paid(500, null, "2026-09-01", 1)]), 335, "a payment from before 0318 counts at the invoice's rate");
  assert.equal(latestInvoiceRate(null, [paid(500, 340, "2026-10-01", 1)]), null, "a rupee invoice has no rate at all");
});

test("rupees received are each payment at its own rate", () => {
  // 500 at 340 and 250 at 345, against an invoice issued at 335.
  assert.equal(pkrReceived(335, [paid(500, 340, "2026-10-01", 1), paid(250, 345, "2026-10-08", 2), paid(0, null, null, 3)]), 170000 + 86250);
  assert.equal(pkrReceived(335, [paid(500, null, "2026-09-01", 1)]), 167500);
  assert.equal(pkrReceived(null, [paid(500, 340, "2026-10-01", 1)]), null);
});

test("the note names every rate the rupee figures were struck at", () => {
  assert.equal(pkrRatesNote(335, 335, [335]), pkrRateNote(335), "all at the invoice's rate: the one sentence, as before");
  assert.equal(pkrRatesNote(335, null, []), pkrRateNote(335));
  const mixed = pkrRatesNote(335, 345, [340, 345]);
  assert.match(mixed, /the total at PKR 335 per €1, the rate on the date this was issued/);
  assert.match(mixed, /each payment at the rate on the day it was received \(PKR 340, 345 per €1\)/);
  assert.match(mixed, /what is still due at PKR 345 per €1, the latest rate/);
  assert.match(pkrRatesNote(335, null, [340]), /the payment at PKR 340 per €1, the rate on the day it was received/);
  assert.equal(pkrRatesNote(null, 340, [340]), null);
});
