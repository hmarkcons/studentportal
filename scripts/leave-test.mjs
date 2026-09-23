import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addMonths,
  leaveForMonth,
  leaveYear,
  paidDaysUsed,
  shortNotice,
  splitLeave,
  workingDates,
} from "../src/lib/leave.ts";

const MON_SAT = [1, 2, 3, 4, 5, 6];

// ---------------------------------------------------------------- the year

test("a leave year runs from the joining anniversary to the day before the next", () => {
  assert.deepEqual(leaveYear("2024-03-15", "2026-09-24"), { start: "2026-03-15", end: "2027-03-14" });
  assert.deepEqual(leaveYear("2024-03-15", "2026-03-14"), { start: "2025-03-15", end: "2026-03-14" });
  assert.deepEqual(leaveYear("2024-03-15", "2026-03-15"), { start: "2026-03-15", end: "2027-03-14" });
});

test("someone who joined on 29 February has their anniversary on the 28th in other years", () => {
  assert.deepEqual(leaveYear("2024-02-29", "2025-06-01"), { start: "2025-02-28", end: "2026-02-27" });
  assert.equal(leaveYear("2024-02-29", "2028-03-01").start, "2028-02-29");
});

test("before they join, their first year is the one that starts when they do", () => {
  assert.equal(leaveYear("2026-10-01", "2026-09-24").start, "2026-10-01");
});

test("adding a month clamps to the month's end", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-11-30", 3), "2027-02-28");
});

// ------------------------------------------------------------ working days

test("only their working days count, less holidays", () => {
  // Mon 12 Oct 2026 – Sun 18 Oct 2026, Monday–Saturday, a holiday on the Wednesday.
  const days = workingDates("2026-10-12", "2026-10-18", MON_SAT, new Set(["2026-10-14"]));
  assert.deepEqual(days, ["2026-10-12", "2026-10-13", "2026-10-15", "2026-10-16", "2026-10-17"]);
});

test("a range the wrong way round covers nothing", () => {
  assert.deepEqual(workingDates("2026-10-18", "2026-10-12", MON_SAT), []);
});

// ------------------------------------------------------------- paid or not

const five = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"];

test("planned leave within the allowance is all paid", () => {
  assert.deepEqual(splitLeave({ dates: five, kind: "planned", hasCertificate: false, remaining: 14 }), {
    paid: five,
    unpaid: [],
    reason: null,
  });
});

test("past the allowance, the earliest days are paid and the rest are not", () => {
  const split = splitLeave({ dates: five, kind: "planned", hasCertificate: false, remaining: 2 });
  assert.deepEqual(split.paid, ["2026-10-12", "2026-10-13"]);
  assert.equal(split.unpaid.length, 3);
  assert.equal(split.reason, "allowance");
});

test("sick or emergency leave without a certificate is unpaid throughout", () => {
  for (const kind of ["sick", "emergency"]) {
    const split = splitLeave({ dates: five, kind, hasCertificate: false, remaining: 14 });
    assert.deepEqual(split.paid, []);
    assert.equal(split.reason, "certificate");
  }
});

test("with a certificate, sick leave comes out of the allowance", () => {
  const split = splitLeave({ dates: five, kind: "sick", hasCertificate: true, remaining: 14 });
  assert.equal(split.paid.length, 5);
});

test("the allowance used counts paid days inside the leave year only", () => {
  const year = { start: "2026-03-15", end: "2027-03-14" };
  const used = paidDaysUsed(
    [{ paid_dates: ["2026-03-14", "2026-03-15", "2026-12-01"] }, { paid_dates: ["2027-03-15"] }],
    year
  );
  assert.equal(used, 2);
});

// ----------------------------------------------------------------- notice

test("planned leave needs a month's notice; sick and emergency leave does not", () => {
  assert.equal(shortNotice("planned", "2026-09-24", "2026-10-10"), true);
  assert.equal(shortNotice("planned", "2026-09-24", "2026-10-24"), false);
  assert.equal(shortNotice("sick", "2026-09-24", "2026-09-24"), false);
});

// ---------------------------------------------------------------- payroll

test("a month's leave is taken from the fixed dates, not recomputed", () => {
  const month = leaveForMonth(
    "2026-10",
    [{ paid_dates: ["2026-09-30", "2026-10-01"], unpaid_dates: ["2026-10-02"] }],
    ["2026-10-14", "2026-11-01"]
  );
  assert.deepEqual([...month.paidLeave], ["2026-10-01"]);
  assert.deepEqual([...month.unpaidLeave], ["2026-10-02"]);
  assert.deepEqual([...month.holidays], ["2026-10-14"]);
});
