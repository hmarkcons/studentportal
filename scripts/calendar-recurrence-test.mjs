// Repeats, labels and notification timing (src/lib/calendarRecurrence.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  expandOccurrences,
  occurrencesInRange,
  recurrenceLabel,
  notifyLabel,
  NOTIFY_CHOICES,
  upcomingNotifications,
  RECURRENCE_KINDS,
} from "../src/lib/calendarRecurrence.ts";
import { CALENDAR_RECURRENCES } from "../src/lib/calendarEventFields.ts";
import { parseYMD } from "../src/lib/calendarDates.ts";
import { karachiEpoch } from "../src/lib/calendarLayout.ts";

const SEP = ["2026-08-30", "2026-10-10"];

test("the calendar and the form agree on the kinds of repeat", () => {
  assert.deepEqual([...RECURRENCE_KINDS], [...CALENDAR_RECURRENCES]);
});

test("daily, weekly and monthly still expand as they did", () => {
  assert.equal(expandOccurrences("2023-01-01", "daily", null, ...SEP).length, 42);
  const weekly = expandOccurrences("2026-09-02", "weekly", null, ...SEP);
  assert.ok(weekly.every((d) => parseYMD(d).getUTCDay() === 3));
  assert.deepEqual(expandOccurrences("2026-01-31", "monthly", null, ...SEP), ["2026-08-31", "2026-09-30"]);
});

test("every weekday is Monday to Friday, whatever day it began on", () => {
  // Began on a Saturday.
  const dates = expandOccurrences("2026-09-19", "weekdays", null, "2026-09-19", "2026-09-27");
  assert.deepEqual(dates, ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25"]);
});

test("every weekday stops at its repeat-until date and never starts early", () => {
  assert.deepEqual(expandOccurrences("2026-09-23", "weekdays", "2026-09-24", ...SEP), ["2026-09-23", "2026-09-24"]);
});

test("a weekday series that began years ago still fills this month", () => {
  const dates = expandOccurrences("2020-01-01", "weekdays", null, ...SEP);
  assert.equal(dates.length, 30);
});

test("yearly keeps the month and day, years later", () => {
  assert.deepEqual(expandOccurrences("2019-09-22", "yearly", null, ...SEP), ["2026-09-22"]);
  assert.deepEqual(expandOccurrences("2019-09-22", "yearly", null, "2026-01-01", "2028-12-31"), ["2026-09-22", "2027-09-22", "2028-09-22"]);
});

test("a birthday on 29 February falls on the 28th in other years, and the 29th again in a leap year", () => {
  assert.deepEqual(expandOccurrences("2024-02-29", "yearly", null, "2025-01-01", "2028-12-31"), ["2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
});

test("yearly respects its start and its end", () => {
  assert.deepEqual(expandOccurrences("2027-03-01", "yearly", null, "2026-01-01", "2026-12-31"), []);
  assert.deepEqual(expandOccurrences("2020-03-01", "yearly", "2025-12-31", "2026-01-01", "2026-12-31"), []);
});

test("nothing, and nothing unknown, expands", () => {
  assert.deepEqual(expandOccurrences("2026-09-22", "none", null, ...SEP), []);
  assert.deepEqual(expandOccurrences("2026-09-22", "fortnightly", null, ...SEP), []);
  assert.deepEqual(expandOccurrences("2026-09-22", null, null, ...SEP), []);
});

test("a multi-day item is one occurrence carrying its end, even when it began before the range", () => {
  assert.deepEqual(occurrencesInRange("2026-08-25", "2026-09-02", "none", null, ...SEP), [{ date: "2026-08-25", spanEnd: "2026-09-02" }]);
  assert.deepEqual(occurrencesInRange("2026-08-01", "2026-08-10", "none", null, ...SEP), []);
  assert.deepEqual(occurrencesInRange("2026-09-22", null, "none", null, ...SEP), [{ date: "2026-09-22", spanEnd: null }]);
  assert.deepEqual(occurrencesInRange("2026-09-22", "2026-09-22", "none", null, ...SEP), [{ date: "2026-09-22", spanEnd: null }]);
  assert.deepEqual(occurrencesInRange("2026-11-01", null, "none", null, ...SEP), []);
});

test("a repeating item's occurrences are single days", () => {
  const o = occurrencesInRange("2026-09-21", "2026-09-22", "weekly", null, ...SEP);
  assert.ok(o.length >= 3);
  assert.ok(o.every((x) => x.spanEnd === null));
});

test("each repeat is said in words", () => {
  assert.equal(recurrenceLabel("none", "2026-09-22"), "Does not repeat");
  assert.equal(recurrenceLabel("daily", "2026-09-22"), "Daily");
  assert.equal(recurrenceLabel("weekly", "2026-09-22"), "Weekly on Tuesday");
  assert.equal(recurrenceLabel("monthly", "2026-09-22"), "Monthly on day 22");
  assert.equal(recurrenceLabel("yearly", "2026-09-22"), "Annually on September 22");
  assert.equal(recurrenceLabel("weekdays", "2026-09-22"), "Every weekday (Monday to Friday)");
});

test("each notification is said in words", () => {
  assert.equal(notifyLabel(null), "No notification");
  assert.equal(notifyLabel(0), "At the time of the event");
  assert.equal(notifyLabel(30), "30 minutes before");
  assert.equal(notifyLabel(60), "1 hour before");
  assert.equal(notifyLabel(1440), "1 day before");
  assert.equal(notifyLabel(4320), "3 days before");
  assert.ok(NOTIFY_CHOICES.every((c) => c.minutes === null || (c.minutes >= 0 && c.minutes <= 40320)));
});

const base = {
  key: "personal:1",
  title: "Call the embassy",
  dueDate: "2026-09-22",
  dueTime: "18:00",
  allDay: false,
  recurrence: "none",
  recurrenceEndDate: null,
  notifyMinutes: 30,
};

test("a notification falls due its lead time before the start, in Karachi time", () => {
  const now = karachiEpoch("2026-09-22", 9 * 60);
  const [n] = upcomingNotifications([base], now);
  assert.equal(new Date(n.startsAt).toISOString(), "2026-09-22T13:00:00.000Z");
  assert.equal(new Date(n.notifyAt).toISOString(), "2026-09-22T12:30:00.000Z");
  assert.equal(n.timed, true);
  assert.match(n.key, /^personal:1:2026-09-22:1080:30$/);
});

test("one already started is not notified, one missed while asleep still is", () => {
  const after = karachiEpoch("2026-09-22", 18 * 60 + 5);
  assert.deepEqual(upcomingNotifications([base], after), []);
  const between = karachiEpoch("2026-09-22", 17 * 60 + 45);
  const [n] = upcomingNotifications([base], between);
  assert.ok(n.notifyAt < between, "its moment has passed, and it is still returned");
});

test("beyond the horizon is left for a later look", () => {
  const now = karachiEpoch("2026-09-20", 9 * 60);
  assert.deepEqual(upcomingNotifications([base], now), []);
  const weekBefore = { ...base, notifyMinutes: 10080, dueDate: "2026-09-27" };
  assert.equal(upcomingNotifications([weekBefore], now).length, 1, "a week-before one for next week is due now");
});

test("an item with no time is treated as starting at nine in the morning", () => {
  const now = karachiEpoch("2026-09-21", 12 * 60);
  const [n] = upcomingNotifications([{ ...base, dueTime: null, allDay: true, notifyMinutes: 1440 }], now);
  assert.equal(n.startMinutes, 540);
  assert.equal(n.timed, false);
  assert.equal(new Date(n.notifyAt).toISOString(), "2026-09-21T04:00:00.000Z");
});

test("a repeating item notifies for its next occurrence", () => {
  const now = karachiEpoch("2026-10-06", 8 * 60);
  const daily = { ...base, dueDate: "2026-01-01", dueTime: "09:00", recurrence: "weekdays", notifyMinutes: 10 };
  const due = upcomingNotifications([daily], now);
  assert.equal(due[0].date, "2026-10-06");
  assert.equal(new Date(due[0].notifyAt).toISOString(), "2026-10-06T03:50:00.000Z");
});

test("a bad lead time is ignored rather than scheduled", () => {
  const now = karachiEpoch("2026-09-22", 9 * 60);
  assert.deepEqual(upcomingNotifications([{ ...base, notifyMinutes: -1 }], now), []);
});
