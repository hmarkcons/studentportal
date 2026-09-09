import { test } from "node:test";
import assert from "node:assert/strict";
import {
  punchTime,
  officeToday,
  monthOf,
  monthBounds,
  shiftMinutes,
  formatDuration,
  clockOutLabel,
  totalMinutes,
} from "../src/lib/attendance.ts";

// ---------------------------------------------------------------- times
test("a punch is shown in the office's own time, not the server's", () => {
  // 04:00Z is 9:00am in Karachi. The page used to call toLocaleTimeString()
  // with no timezone, so on Vercel (UTC) this arrival displayed as 4:00 AM and
  // the whole attendance table read five hours early.
  assert.equal(punchTime("2026-09-09T04:00:00Z"), "9:00 AM");
  assert.equal(punchTime("2026-09-09T13:30:00Z"), "6:30 PM");
});

test("a missing or unparseable punch shows a dash, not 'Invalid Date'", () => {
  assert.equal(punchTime(null), "—");
  assert.equal(punchTime(undefined), "—");
  assert.equal(punchTime("not a time"), "—");
});

test("the office's date is Karachi's, so a pre-dawn punch is not filed yesterday", () => {
  // 22:00Z on the 9th is already 03:00 on the 10th in Karachi. The action used
  // to take the date from toISOString(), which would have filed this shift
  // against the 9th.
  assert.equal(officeToday(new Date("2026-09-09T22:00:00Z")), "2026-09-10");
  assert.equal(officeToday(new Date("2026-09-09T04:00:00Z")), "2026-09-09");
});

// --------------------------------------------------------------- months
test("a month runs from the first to the actual last day", () => {
  assert.deepEqual(monthBounds("2026-09"), { start: "2026-09-01", end: "2026-09-30" });
  assert.deepEqual(monthBounds("2026-01"), { start: "2026-01-01", end: "2026-01-31" });
  // February, and a leap year, without a table of month lengths.
  assert.deepEqual(monthBounds("2026-02"), { start: "2026-02-01", end: "2026-02-28" });
  assert.deepEqual(monthBounds("2028-02"), { start: "2028-02-01", end: "2028-02-29" });
});

test("December does not roll into the wrong year", () => {
  assert.deepEqual(monthBounds("2026-12"), { start: "2026-12-01", end: "2026-12-31" });
});

test("monthOf reads the month off a work_date", () => {
  assert.equal(monthOf("2026-09-09"), "2026-09");
});

// -------------------------------------------------------------- lengths
test("a closed shift is measured in minutes", () => {
  assert.equal(shiftMinutes({ clock_in: "2026-09-09T04:00:00Z", clock_out: "2026-09-09T13:15:00Z" }), 555);
  assert.equal(formatDuration(555), "9h 15m");
});

test("an open shift has no length rather than a growing one", () => {
  // Counting to "now" would make the figure larger every time the page was
  // opened, which is not a measurement.
  assert.equal(shiftMinutes({ clock_in: "2026-09-09T04:00:00Z", clock_out: null }), null);
  assert.equal(formatDuration(null), "—");
});

test("a clock-out before its clock-in is not a negative shift", () => {
  assert.equal(shiftMinutes({ clock_in: "2026-09-09T13:00:00Z", clock_out: "2026-09-09T04:00:00Z" }), null);
});

test("whole hours and sub-hour shifts read naturally", () => {
  assert.equal(formatDuration(480), "8h");
  assert.equal(formatDuration(45), "45m");
  assert.equal(formatDuration(0), "0m");
});

// -------------------------------------------------------------- states
test("the three clock-out states are told apart", () => {
  // Still working, gave up on, and closed normally used to look identical: all
  // three printed a dash.
  assert.deepEqual(clockOutLabel({ clock_in: "2026-09-09T04:00:00Z", clock_out: null }), {
    text: "Still clocked in",
    tone: "open",
  });
  assert.deepEqual(clockOutLabel({ clock_in: "2026-09-09T04:00:00Z", clock_out: null, clock_out_missing: true }), {
    text: "Not clocked out",
    tone: "missing",
  });
  assert.deepEqual(clockOutLabel({ clock_in: "2026-09-09T04:00:00Z", clock_out: "2026-09-09T13:00:00Z" }), {
    text: "6:00 PM",
    tone: "normal",
  });
});

test("a month's total counts only the shifts that can be measured", () => {
  const rows = [
    { clock_in: "2026-09-09T04:00:00Z", clock_out: "2026-09-09T12:00:00Z" }, // 8h
    { clock_in: "2026-09-10T04:00:00Z", clock_out: null, clock_out_missing: true }, // unknown
    { clock_in: "2026-09-11T04:30:00Z", clock_out: "2026-09-11T12:00:00Z" }, // 7h30
  ];
  assert.equal(totalMinutes(rows), 480 + 450);
  assert.equal(formatDuration(totalMinutes(rows)), "15h 30m");
});
