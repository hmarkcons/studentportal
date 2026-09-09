import { test } from "node:test";
import assert from "node:assert/strict";
import {
  expandRecurrence,
  eachDateInRange,
  karachiToday,
  getMonthGridDays,
  getWeekDays,
  toYMD,
  parseYMD,
} from "../src/lib/calendarDates.ts";

// A month view is 42 days; these are the ranges the calendar actually asks for.
const SEP = ["2026-08-30", "2026-10-10"];

test("a daily series that started years ago still shows in this month", () => {
  // The bug this replaces: the old version stepped one day at a time from the
  // start with a 400-iteration guard, so a daily reminder running for more than
  // 400 days never reached the month being viewed and vanished entirely — the
  // longer it had been running, the less likely it was to appear.
  const dates = expandRecurrence("2023-01-01", "daily", null, ...SEP);
  assert.equal(dates.length, 42, `expected the whole range, got ${dates.length}`);
  assert.equal(dates[0], "2026-08-30");
  assert.equal(dates.at(-1), "2026-10-10");
});

test("a weekly series that started years ago still shows, on the right weekday", () => {
  // 2023-01-02 was a Monday.
  const dates = expandRecurrence("2023-01-02", "weekly", null, ...SEP);
  assert.ok(dates.length >= 5, `expected about six Mondays, got ${dates.length}`);
  for (const d of dates) {
    assert.equal(parseYMD(d).getUTCDay(), 1, `${d} is not a Monday`);
  }
});

test("a weekly series lands on its own weekday, not on the day the range opens", () => {
  // Starts Wednesday; the range opens on a Sunday.
  const dates = expandRecurrence("2026-09-02", "weekly", null, ...SEP);
  for (const d of dates) assert.equal(parseYMD(d).getUTCDay(), 3, `${d} is not a Wednesday`);
  assert.ok(dates.includes("2026-09-02"));
  assert.ok(dates.includes("2026-09-09"));
});

test("nothing before the series starts", () => {
  const dates = expandRecurrence("2026-09-15", "daily", null, ...SEP);
  assert.equal(dates[0], "2026-09-15");
  assert.ok(!dates.some((d) => d < "2026-09-15"));
});

test("nothing after the series ends", () => {
  const dates = expandRecurrence("2026-09-01", "daily", "2026-09-05", ...SEP);
  assert.deepEqual(dates, ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"]);
});

test("a series whose end date precedes the range produces nothing", () => {
  assert.deepEqual(expandRecurrence("2024-01-01", "daily", "2024-02-01", ...SEP), []);
});

test("a series ending before it starts produces nothing rather than looping", () => {
  assert.deepEqual(expandRecurrence("2026-09-10", "weekly", "2026-09-01", ...SEP), []);
});

test("'none' recurrence produces nothing", () => {
  assert.deepEqual(expandRecurrence("2026-09-01", "none", null, ...SEP), []);
});

// Monthly: the anchor day clamps to short months and comes back afterwards,
// rather than the series drifting permanently to the 28th.
test("a monthly series on the 31st clamps to February and returns in March", () => {
  const jan = expandRecurrence("2026-01-31", "monthly", null, "2026-01-01", "2026-01-31");
  assert.deepEqual(jan, ["2026-01-31"]);
  const feb = expandRecurrence("2026-01-31", "monthly", null, "2026-02-01", "2026-02-28");
  assert.deepEqual(feb, ["2026-02-28"], "clamped to the last day of February");
  const mar = expandRecurrence("2026-01-31", "monthly", null, "2026-03-01", "2026-03-31");
  assert.deepEqual(mar, ["2026-03-31"], "back to the 31st, not stuck on the 28th");
});

test("a monthly series on the 31st hits 29 February in a leap year", () => {
  const feb = expandRecurrence("2024-01-31", "monthly", null, "2024-02-01", "2024-02-29");
  assert.deepEqual(feb, ["2024-02-29"]);
});

test("a monthly series years old still shows in this month", () => {
  const dates = expandRecurrence("2019-03-15", "monthly", null, ...SEP);
  assert.ok(dates.includes("2026-09-15"), `got ${dates.join(", ")}`);
});

test("a monthly series produces one date per month in the view, not several", () => {
  // A 42-day grid spans three calendar months, so at most three occurrences.
  const dates = expandRecurrence("2020-01-10", "monthly", null, ...SEP);
  assert.ok(dates.length <= 3, `got ${dates.length}: ${dates.join(", ")}`);
  assert.ok(dates.includes("2026-09-10"));
});

test("every returned date is inside the range asked for", () => {
  for (const rec of ["daily", "weekly", "monthly"]) {
    for (const d of expandRecurrence("2020-01-15", rec, null, ...SEP)) {
      assert.ok(d >= SEP[0] && d <= SEP[1], `${rec} produced ${d}, outside the range`);
    }
  }
});

test("dates come back in order, with no repeats", () => {
  for (const rec of ["daily", "weekly", "monthly"]) {
    const dates = expandRecurrence("2024-06-05", rec, null, ...SEP);
    assert.deepEqual(dates, [...dates].sort(), `${rec} is out of order`);
    assert.equal(new Set(dates).size, dates.length, `${rec} repeated a date`);
  }
});

// Multi-day spans.
test("a span longer than a year still fills the month being viewed", () => {
  // Same truncation as the recurrence walk: expanding the whole span first and
  // filtering afterwards ran out before it reached the range.
  const dates = eachDateInRange("2025-01-01", "2027-12-31", ...SEP);
  assert.equal(dates.length, 42);
  assert.equal(dates[0], "2026-08-30");
  assert.equal(dates.at(-1), "2026-10-10");
});

test("a span is clipped to the range at both ends", () => {
  const dates = eachDateInRange("2026-09-05", "2026-09-08", ...SEP);
  assert.deepEqual(dates, ["2026-09-05", "2026-09-06", "2026-09-07", "2026-09-08"]);
});

test("a span entirely outside the range produces nothing", () => {
  assert.deepEqual(eachDateInRange("2025-01-01", "2025-02-01", ...SEP), []);
});

test("a single-day span is one date", () => {
  assert.deepEqual(eachDateInRange("2026-09-07", "2026-09-07", ...SEP), ["2026-09-07"]);
});

test("eachDateInRange still works unclipped, for callers that want the whole span", () => {
  assert.deepEqual(eachDateInRange("2026-09-01", "2026-09-03"), ["2026-09-01", "2026-09-02", "2026-09-03"]);
});

// Today.
test("today is Karachi's day, not the server's", () => {
  // 2026-09-30 21:00 UTC is already 2026-10-01 in Karachi. The calendar used
  // toISOString(), so for the first five hours of each Karachi day it
  // highlighted yesterday and treated a task due today as not yet due.
  assert.equal(karachiToday(new Date("2026-09-30T21:00:00Z")), "2026-10-01");
  assert.equal(karachiToday(new Date("2026-09-30T18:00:00Z")), "2026-09-30");
});

test("today is a plain yyyy-mm-dd", () => {
  assert.match(karachiToday(), /^\d{4}-\d{2}-\d{2}$/);
});

// The grid itself.
test("a month grid is six weeks starting on a Sunday", () => {
  const days = getMonthGridDays(parseYMD("2026-09-15"));
  assert.equal(days.length, 42);
  assert.equal(days[0].getUTCDay(), 0);
  assert.ok(toYMD(days[0]) <= "2026-09-01", "the grid starts on or before the 1st");
  assert.ok(toYMD(days.at(-1)) >= "2026-09-30", "the grid ends on or after the last day");
});

test("a week grid is seven days starting on a Sunday", () => {
  const days = getWeekDays(parseYMD("2026-09-15"));
  assert.equal(days.length, 7);
  assert.equal(days[0].getUTCDay(), 0);
});
