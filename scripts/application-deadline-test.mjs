import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applicationDeadline,
  deadlineSource,
  daysUntil,
  deadlineUrgency,
  isUpcoming,
} from "../src/lib/applicationDeadline.ts";

// The whole bug in one test: the date staff type lives on the application, and
// both the reminder cron and the calendar were reading the programme's
// catalogue date instead. On production every dated application had a null
// catalogue date, so nothing was ever notified or shown.
test("the application's own deadline wins", () => {
  assert.equal(applicationDeadline("2026-09-14", "2026-12-01"), "2026-09-14");
  assert.equal(deadlineSource("2026-09-14", "2026-12-01"), "application");
});

test("the programme's catalogue date is the fallback, not the source of truth", () => {
  assert.equal(applicationDeadline(null, "2026-12-01"), "2026-12-01");
  assert.equal(deadlineSource(null, "2026-12-01"), "programme");
});

test("an application with neither has no deadline", () => {
  assert.equal(applicationDeadline(null, null), null);
  assert.equal(applicationDeadline("", "  "), null);
  assert.equal(deadlineSource(null, null), null);
});

test("a timestamp is reduced to its date", () => {
  // applications.deadline is a date column, but PostgREST hands back
  // "2026-09-14T19:00:00.000Z" for some clients, and the comparisons
  // downstream are all string compares against YYYY-MM-DD.
  assert.equal(applicationDeadline("2026-09-14T19:00:00.000Z", null), "2026-09-14");
});

// ------------------------------------------------------------- the counting
test("days until a deadline, and after it", () => {
  assert.equal(daysUntil("2026-09-10", "2026-09-10"), 0);
  assert.equal(daysUntil("2026-09-24", "2026-09-10"), 14);
  assert.equal(daysUntil("2026-09-09", "2026-09-10"), -1);
});

test("days are counted across a month and a year boundary", () => {
  assert.equal(daysUntil("2026-10-01", "2026-09-28"), 3);
  assert.equal(daysUntil("2027-01-02", "2026-12-30"), 3);
});

test("urgency is told in days, which is the question being asked", () => {
  assert.equal(deadlineUrgency("2026-09-10", "2026-09-10"), "due today");
  assert.equal(deadlineUrgency("2026-09-11", "2026-09-10"), "due tomorrow");
  assert.equal(deadlineUrgency("2026-09-15", "2026-09-10"), "due in 5 days");
  assert.equal(deadlineUrgency("2026-09-09", "2026-09-10"), "1 day overdue");
  assert.equal(deadlineUrgency("2026-09-01", "2026-09-10"), "9 days overdue");
});

test("the window includes today and the last day, and excludes the past", () => {
  assert.equal(isUpcoming("2026-09-10", "2026-09-10", 14), true, "today still needs doing");
  assert.equal(isUpcoming("2026-09-24", "2026-09-10", 14), true, "the last day of the window");
  assert.equal(isUpcoming("2026-09-25", "2026-09-10", 14), false, "past the window");
  assert.equal(isUpcoming("2026-09-09", "2026-09-10", 14), false, "already gone");
});
