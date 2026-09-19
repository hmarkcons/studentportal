import { test } from "node:test";
import assert from "node:assert/strict";
import { computeInvoiceStatus } from "../src/lib/invoiceStatus.ts";
import { shouldSendOverdueReminder, REMINDER_INTERVAL_HOURS } from "../src/lib/overdueReminder.ts";

// The two rules the daily overdue cron runs on: which invoices count as
// overdue, and how often the student may be chased about one. Between them
// they decide whether a real person gets an email about money they owe, and
// neither had anything pinning it down.

const inst = (status, due_date) => ({ status, due_date });
const days = (n) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);

// --------------------------------------------------------------- overdue?
test("an unpaid instalment past its due date is overdue", () => {
  assert.equal(computeInvoiceStatus([inst("unpaid", days(-1))]), "overdue");
});

test("one due today is not overdue yet", () => {
  // The student has until the end of the day; chasing them on the morning of
  // the due date is the kind of thing they ring the office about.
  assert.equal(computeInvoiceStatus([inst("unpaid", days(0))]), "pending");
});

test("one due tomorrow is not overdue", () => {
  assert.equal(computeInvoiceStatus([inst("unpaid", days(1))]), "pending");
});

test("every instalment paid means paid, and nothing is chased", () => {
  assert.equal(computeInvoiceStatus([inst("paid", days(-30)), inst("paid", days(-1))]), "paid");
});

test("a part-paid instalment past its date is still overdue", () => {
  // Money arrived, but not all of it. 'partial' is not 'paid'.
  assert.equal(computeInvoiceStatus([inst("partial", days(-3))]), "overdue");
});

test("one overdue instalment among paid ones is enough", () => {
  assert.equal(
    computeInvoiceStatus([inst("paid", days(-60)), inst("unpaid", days(-2)), inst("unpaid", days(30))]),
    "overdue"
  );
});

test("the instalment that waits on an admission is never overdue", () => {
  // The last instalment of a two- or three-payment plan deliberately has no
  // due date — it falls due on the admission coming through
  // (installmentDueConditions). A student must never be chased for it.
  assert.equal(computeInvoiceStatus([inst("paid", days(-30)), inst("unpaid", null)]), "pending");
});

test("an invoice with no instalments is pending, not paid", () => {
  // "every" is true of an empty list, so without the length guard an invoice
  // whose schedule failed to write would read as fully paid.
  assert.equal(computeInvoiceStatus([]), "pending");
});

// --------------------------------------------------------------- throttle
const hoursAgo = (h) => new Date(Date.now() - h * 36e5);

test("a student who has never been chased is chased", () => {
  assert.equal(shouldSendOverdueReminder(null), true);
  assert.equal(shouldSendOverdueReminder(undefined), true);
});

test("not twice in the same day", () => {
  assert.equal(shouldSendOverdueReminder(hoursAgo(1).toISOString()), false);
  assert.equal(shouldSendOverdueReminder(hoursAgo(23.9).toISOString()), false);
});

test("but again once the interval has passed", () => {
  assert.equal(shouldSendOverdueReminder(hoursAgo(REMINDER_INTERVAL_HOURS).toISOString()), true);
  assert.equal(shouldSendOverdueReminder(hoursAgo(72).toISOString()), true);
});

test("the clock is injectable, so this does not drift with the test run", () => {
  const last = new Date("2026-09-01T08:00:00Z");
  assert.equal(shouldSendOverdueReminder(last, new Date("2026-09-01T20:00:00Z")), false);
  assert.equal(shouldSendOverdueReminder(last, new Date("2026-09-02T08:00:00Z")), true);
});

test("a Date is accepted as well as a string", () => {
  // PostgREST hands back an ISO string; node-postgres hands back a Date.
  assert.equal(shouldSendOverdueReminder(hoursAgo(2)), false);
  assert.equal(shouldSendOverdueReminder(hoursAgo(48)), true);
});

test("an unreadable stamp chases rather than goes silent", () => {
  // Wrong in the direction of one extra email, not in the direction of an
  // invoice nobody ever chases again.
  assert.equal(shouldSendOverdueReminder("not a date"), true);
});
