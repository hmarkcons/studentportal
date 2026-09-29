// The calendar's view arithmetic (src/lib/calendarLayout.ts): hour-grid
// positions, overlapping blocks side by side, what a drag or a resize turns
// into, the days each view covers and how a week row stacks its chips.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseView,
  parseDateParam,
  minutesOf,
  timeOf,
  displaySpan,
  blockBox,
  layoutOverlaps,
  moveTimed,
  resizeEnd,
  slotFor,
  minutesAt,
  dayDelta,
  shiftDate,
  periodDays,
  periodRange,
  shiftPeriod,
  periodTitle,
  addMonthsClamped,
  monthGridDays,
  weeksOf,
  layoutWeekRow,
  formatClock,
  formatTimeRange,
  hourLabel,
  durationLabel,
  karachiEpoch,
  karachiClock,
} from "../src/lib/calendarLayout.ts";

test("a view in the URL is one we know, or the fallback", () => {
  assert.equal(parseView("year"), "year");
  assert.equal(parseView("agenda"), "week");
  assert.equal(parseView(null, "month"), "month");
});

test("a date in the URL has to be a real one", () => {
  assert.equal(parseDateParam("2026-09-22"), "2026-09-22");
  assert.equal(parseDateParam("2026-02-30"), null);
  assert.equal(parseDateParam("22/09/2026"), null);
  assert.equal(parseDateParam(""), null);
});

test("times read and write as minutes from midnight", () => {
  assert.equal(minutesOf("18:30"), 1110);
  assert.equal(minutesOf("18:30:00"), 1110);
  assert.equal(minutesOf("7:05"), 425);
  assert.equal(minutesOf("25:00"), null);
  assert.equal(minutesOf(""), null);
  assert.equal(minutesOf(null), null);
  assert.equal(timeOf(1110), "18:30");
  assert.equal(timeOf(0), "00:00");
  // The end of the day is 23:59: a time column and a time input stop there.
  assert.equal(timeOf(1440), "23:59");
});

test("a block with no end, or an end before its start, is drawn an hour long", () => {
  assert.deepEqual(displaySpan("18:00", "19:30"), { start: 1080, end: 1170 });
  assert.deepEqual(displaySpan("18:00", null), { start: 1080, end: 1140 });
  assert.deepEqual(displaySpan("18:00", "17:00"), { start: 1080, end: 1140 });
  assert.deepEqual(displaySpan("23:30", null), { start: 1410, end: 1440 }, "never past midnight");
  assert.equal(displaySpan(null, "10:00"), null);
  assert.deepEqual(displaySpan("09:00", null, 30), { start: 540, end: 570 });
});

test("a block's box follows its times, with a floor so a short one stays clickable", () => {
  assert.deepEqual(blockBox(60, 120, 48), { top: 48, height: 48 });
  assert.deepEqual(blockBox(600, 605, 48), { top: 480, height: 18 });
});

test("overlapping blocks share the width; ones that only touch do not", () => {
  const placed = layoutOverlaps([
    { id: "a", start: 540, end: 600 },
    { id: "b", start: 570, end: 630 },
    { id: "c", start: 600, end: 660 },
    { id: "d", start: 720, end: 780 },
  ]);
  const by = Object.fromEntries(placed.map((p) => [p.id, p]));
  assert.equal(by.a.columns, 2);
  assert.equal(by.b.columns, 2);
  assert.equal(by.c.columns, 2, "c overlaps b, so it is in the same cluster");
  assert.equal(by.a.column, 0);
  assert.equal(by.b.column, 1);
  assert.equal(by.c.column, 0, "c reuses the column a has finished with");
  assert.deepEqual([by.d.column, by.d.columns], [0, 1], "d is on its own");
});

test("three at once make three columns", () => {
  const placed = layoutOverlaps([
    { id: "a", start: 600, end: 660 },
    { id: "b", start: 600, end: 660 },
    { id: "c", start: 615, end: 645 },
  ]);
  assert.deepEqual(placed.map((p) => p.columns), [3, 3, 3]);
  assert.deepEqual(new Set(placed.map((p) => p.column)), new Set([0, 1, 2]));
});

test("a minimum drawn length separates two short blocks whose boxes would touch", () => {
  const touching = [
    { id: "a", start: 600, end: 605 },
    { id: "b", start: 610, end: 615 },
  ];
  assert.deepEqual(layoutOverlaps(touching).map((p) => p.columns), [1, 1]);
  assert.deepEqual(layoutOverlaps(touching, 20).map((p) => p.columns), [2, 2]);
});

test("a dragged block keeps its length, snaps to the quarter hour and stays inside the day", () => {
  assert.deepEqual(moveTimed({ start: 1080, end: 1140 }, 37), { start: 1110, end: 1170 });
  assert.deepEqual(moveTimed({ start: 1080, end: 1140 }, -2000), { start: 0, end: 60 });
  assert.deepEqual(moveTimed({ start: 1080, end: 1140 }, 1000), { start: 1380, end: 1440 }, "stops at midnight rather than wrapping");
});

test("dragging the bottom edge sets the end, at least a quarter hour after the start", () => {
  assert.equal(resizeEnd(1080, 1172), 1170);
  assert.equal(resizeEnd(1080, 1000), 1095);
  assert.equal(resizeEnd(1080, 5000), 1440);
});

test("a click is the half hour it landed in, for an hour; a drag is what it covered", () => {
  assert.deepEqual(slotFor(1100, null), { start: 1080, end: 1140 });
  assert.deepEqual(slotFor(1100, 1105), { start: 1080, end: 1140 }, "a wobble is still a click");
  assert.deepEqual(slotFor(1085, 1170), { start: 1080, end: 1170 });
  assert.deepEqual(slotFor(1170, 1085), { start: 1080, end: 1170 }, "dragging upwards works too");
  assert.deepEqual(slotFor(1430, null), { start: 1410, end: 1440 }, "the last half hour is cut short at midnight");
});

test("a pointer's height down a column is minutes", () => {
  assert.equal(minutesAt(96, 48), 120);
  assert.equal(minutesAt(-5, 48), 0);
  assert.equal(minutesAt(99999, 48), 1440);
});

test("day arithmetic crosses months and years", () => {
  assert.equal(dayDelta("2026-09-28", "2026-10-02"), 4);
  assert.equal(dayDelta("2026-10-02", "2026-09-28"), -4);
  assert.equal(shiftDate("2026-12-31", 1), "2027-01-01");
});

test("each view covers the days it shows", () => {
  assert.deepEqual(periodDays("day", "2026-09-22"), ["2026-09-22"]);
  const week = periodDays("week", "2026-09-22");
  assert.deepEqual([week[0], week[6], week.length], ["2026-09-20", "2026-09-26", 7], "Sunday to Saturday");
  const month = periodDays("month", "2026-09-22");
  assert.deepEqual([month[0], month[41], month.length], ["2026-08-30", "2026-10-10", 42]);
  assert.equal(periodDays("year", "2026-09-22").length, 365);
  assert.equal(periodDays("year", "2028-03-01").length, 366);
  assert.deepEqual(periodRange("year", "2026-09-22"), { start: "2026-01-01", end: "2026-12-31" });
});

test("the arrows move by the view's own period, keeping the day where the month has it", () => {
  assert.equal(shiftPeriod("day", "2026-09-30", 1), "2026-10-01");
  assert.equal(shiftPeriod("week", "2026-09-22", -1), "2026-09-15");
  assert.equal(shiftPeriod("month", "2026-01-31", 1), "2026-02-28");
  assert.equal(shiftPeriod("month", "2026-01-15", -1), "2025-12-15");
  assert.equal(shiftPeriod("year", "2028-02-29", 1), "2029-02-28");
  assert.equal(addMonthsClamped("2026-03-31", -1), "2026-02-28");
});

test("the heading says the period", () => {
  assert.equal(periodTitle("day", "2026-09-22"), "September 22, 2026");
  assert.equal(periodTitle("week", "2026-09-22"), "September 2026");
  assert.equal(periodTitle("week", "2026-09-29"), "Sep – Oct 2026");
  assert.equal(periodTitle("week", "2026-12-29"), "Dec 2026 – Jan 2027");
  assert.equal(periodTitle("month", "2026-09-22"), "September 2026");
  assert.equal(periodTitle("year", "2026-09-22"), "2026");
});

test("a month's grid is six weeks from the Sunday before the 1st", () => {
  const days = monthGridDays(2026, 8);
  assert.equal(days.length, 42);
  assert.equal(days[0], "2026-08-30");
  assert.equal(weeksOf(days).length, 6);
  assert.ok(weeksOf(days).every((w) => w.length === 7));
});

const WEEK = ["2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26"];

test("a bar across the week sits above the single days under it", () => {
  const { placed, hidden } = layoutWeekRow(
    [
      { id: "tue", start: "2026-09-22", end: "2026-09-22" },
      { id: "span", start: "2026-09-21", end: "2026-09-24" },
    ],
    WEEK
  );
  const by = Object.fromEntries(placed.map((p) => [p.id, p]));
  assert.deepEqual([by.span.lane, by.span.startCol, by.span.endCol], [0, 1, 4]);
  assert.deepEqual([by.tue.lane, by.tue.startCol], [1, 2]);
  assert.deepEqual(hidden, [0, 0, 0, 0, 0, 0, 0]);
});

test("a span that began last week or goes on next week is clipped to this row, and says so", () => {
  const { placed } = layoutWeekRow([{ id: "long", start: "2026-09-10", end: "2026-10-02" }], WEEK);
  assert.deepEqual(placed[0], { id: "long", startCol: 0, endCol: 6, lane: 0, continuesBefore: true, continuesAfter: true });
  assert.deepEqual(layoutWeekRow([{ id: "gone", start: "2026-09-01", end: "2026-09-02" }], WEEK).placed, []);
});

test("a busy day keeps its last lane for +N more", () => {
  const items = ["a", "b", "c", "d", "e"].map((id) => ({ id, start: "2026-09-22", end: "2026-09-22" }));
  const { placed, hidden, lanes } = layoutWeekRow(items, WEEK, 4);
  assert.deepEqual(placed.map((p) => p.id), ["a", "b", "c"], "three shown, the fourth lane is the +2 more");
  assert.equal(hidden[2], 2);
  assert.equal(lanes, 3);
  // Exactly four fit without a "more".
  assert.equal(layoutWeekRow(items.slice(0, 4), WEEK, 4).placed.length, 4);
});

test("a bar is hidden whole when any day it crosses has no room for it", () => {
  const items = [
    { id: "span", start: "2026-09-21", end: "2026-09-22" },
    { id: "t1", start: "2026-09-22", end: "2026-09-22" },
    { id: "t2", start: "2026-09-22", end: "2026-09-22" },
  ];
  const { placed, hidden } = layoutWeekRow(items, WEEK, 2);
  // Tuesday holds three, so it shows one and "+2 more"; the span is in lane 0
  // and fits; t1 is lane 1 which Tuesday gives to "more".
  assert.deepEqual(placed.map((p) => p.id), ["span"]);
  assert.equal(hidden[2], 2);
  assert.equal(hidden[1], 0);
});

test("times are written the way Google writes them", () => {
  assert.equal(formatClock(1080), "6pm");
  assert.equal(formatClock(1110), "6:30pm");
  assert.equal(formatClock(0), "12am");
  assert.equal(formatClock(720), "12pm");
  assert.equal(formatTimeRange(1080, 1140), "6 – 7pm");
  assert.equal(formatTimeRange(660, 780), "11am – 1pm");
  assert.equal(formatTimeRange(1110, 1155), "6:30 – 7:15pm");
  assert.equal(formatTimeRange(1380, 1440), "11pm – 12am");
  assert.equal(hourLabel(13), "1 PM");
  assert.equal(hourLabel(12), "12 PM");
  assert.equal(hourLabel(0), "");
  assert.equal(durationLabel(30), "30 mins");
  assert.equal(durationLabel(60), "1 hr");
  assert.equal(durationLabel(90), "1.5 hrs");
});

test("Karachi is UTC+5 all year", () => {
  // 18:00 in Karachi on 22 Sep is 13:00 UTC.
  assert.equal(new Date(karachiEpoch("2026-09-22", 1080)).toISOString(), "2026-09-22T13:00:00.000Z");
  // 21:00 UTC is already 02:00 the next day there.
  assert.deepEqual(karachiClock(Date.parse("2026-09-22T21:00:00Z")), { date: "2026-09-23", minutes: 120 });
  assert.deepEqual(karachiClock(Date.parse("2026-01-10T04:30:00Z")), { date: "2026-01-10", minutes: 570 });
});
