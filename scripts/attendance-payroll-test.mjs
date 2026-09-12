import { test } from "node:test";
import assert from "node:assert/strict";
import {
  effectiveSchedule,
  timeToMinutes,
  instantToOfficeMinutes,
  lateMinutes,
  overtimeMinutes,
  datesInMonth,
  weekdayOf,
  summariseMonth,
  payrollAdjustment,
} from "../src/lib/attendancePayroll.ts";

const POLICY = {
  work_start_time: "09:00:00",
  work_end_time: "18:00:00",
  work_days: [1, 2, 3, 4, 5, 6],
  grace_minutes: 15,
  overtime_rate_per_hour: 200,
  late_deduction: 100,
  absent_deduction: 1000,
};

// 04:00Z is 09:00 in Karachi; 13:00Z is 18:00.
const at = (date, utcHour, utcMin = 0) =>
  `${date}T${String(utcHour).padStart(2, "0")}:${String(utcMin).padStart(2, "0")}:00Z`;

// ------------------------------------------------------------- the schedule
test("a staff member's own hours win, and the policy fills the gaps", () => {
  // Hours differ per person — that is why they live on the staff record.
  const own = effectiveSchedule({ work_start_time: "11:00:00", work_end_time: "20:00:00" }, POLICY);
  assert.equal(own.start, "11:00:00");
  assert.equal(own.end, "20:00:00");
  assert.deepEqual(own.days, POLICY.work_days, "days fall back when not overridden");

  const fallback = effectiveSchedule(null, POLICY);
  assert.equal(fallback.start, "09:00:00");
  assert.equal(fallback.configured, true);
});

test("nothing is held against anybody until the hours are set", () => {
  const blank = effectiveSchedule(null, { ...POLICY, work_start_time: null, work_end_time: null });
  assert.equal(blank.configured, false);
  assert.equal(lateMinutes(at("2026-09-14", 6), blank), 0, "no start time, no lateness");
});

// ---------------------------------------------------------------- lateness
test("the grace period is a boundary, not a discount", () => {
  const s = effectiveSchedule(null, POLICY);
  // 09:10 against a 09:00 start with 15 minutes' grace: not late.
  assert.equal(lateMinutes(at("2026-09-14", 4, 10), s), 0);
  // 09:20 is five minutes late, not twenty.
  assert.equal(lateMinutes(at("2026-09-14", 4, 20), s), 5);
});

test("arriving early is not negative lateness", () => {
  const s = effectiveSchedule(null, POLICY);
  assert.equal(lateMinutes(at("2026-09-14", 3, 30), s), 0);
});

test("lateness is measured on the office clock, not the server's", () => {
  // 04:00Z is 09:00 in Karachi — on time. Read as UTC it would be 4am and the
  // person would look five hours early every single day.
  assert.equal(instantToOfficeMinutes(at("2026-09-14", 4)), 9 * 60);
});

// ---------------------------------------------------------------- overtime
test("overtime is time past the end of the shift", () => {
  const s = effectiveSchedule(null, POLICY);
  // Left at 19:30 against an 18:00 end.
  assert.equal(overtimeMinutes({ clock_in: at("2026-09-14", 4), clock_out: at("2026-09-14", 14, 30) }, s), 90);
});

test("...past that person's end, not past eight hours", () => {
  // A late shift, 11:00–20:00. Leaving at 20:00 is not two hours of overtime
  // just because it is past six.
  const s = effectiveSchedule({ work_start_time: "11:00:00", work_end_time: "20:00:00" }, POLICY);
  assert.equal(overtimeMinutes({ clock_in: at("2026-09-14", 6), clock_out: at("2026-09-14", 15) }, s), 0);
});

test("a shift nobody clocked out of earns no overtime", () => {
  // The time they left is not recorded anywhere; counting to now or to the
  // end of the shift would be inventing it.
  const s = effectiveSchedule(null, POLICY);
  assert.equal(overtimeMinutes({ clock_in: at("2026-09-14", 4), clock_out: null }, s), 0);
});

// ------------------------------------------------------------------ months
test("a month lists its own days, February included", () => {
  assert.equal(datesInMonth("2026-09").length, 30);
  assert.equal(datesInMonth("2026-02").length, 28);
  assert.equal(datesInMonth("2028-02").length, 29);
  assert.equal(datesInMonth("2026-12").at(-1), "2026-12-31");
});

test("weekdays are counted the same way the policy names them", () => {
  // 2026-09-13 is a Sunday.
  assert.equal(weekdayOf("2026-09-13"), 0);
  assert.equal(weekdayOf("2026-09-14"), 1);
});

// ----------------------------------------------------------------- summary
test("a month adds up the hours, the lateness and the overtime", () => {
  const s = effectiveSchedule(null, POLICY);
  const summary = summariseMonth({
    month: "2026-09",
    today: "2026-09-16",
    schedule: s,
    records: [
      // On time, left on time: 9 hours, no overtime, not late.
      { work_date: "2026-09-14", clock_in: at("2026-09-14", 4), clock_out: at("2026-09-14", 13) },
      // Twenty minutes late, an hour of overtime.
      { work_date: "2026-09-15", clock_in: at("2026-09-15", 4, 35), clock_out: at("2026-09-15", 14) },
    ],
  });
  assert.equal(summary.workedMinutes, 540 + 565);
  assert.equal(summary.overtimeMinutes, 60);
  assert.equal(summary.lateArrivals, 1);
  assert.equal(summary.lateMinutes, 20);
  assert.equal(summary.daysPresent, 2);
});

test("a working day with no record at all is an absence", () => {
  // 14th and 15th present, 16th is today. The 1st to the 13th are the
  // working days before them.
  const summary = summariseMonth({
    month: "2026-09",
    today: "2026-09-16",
    schedule: effectiveSchedule(null, POLICY),
    records: [{ work_date: "2026-09-14", clock_in: at("2026-09-14", 4), clock_out: at("2026-09-14", 13) }],
  });
  // Mon-Sat in 2026-09 before the 16th: 1,2,3,4,5,7,8,9,10,11,12,14,15 = 13
  // days, minus the one present = 12.
  assert.equal(summary.absentDays, 12);
});

test("today is never an absence, and neither is tomorrow", () => {
  const summary = summariseMonth({
    month: "2026-09",
    today: "2026-09-02",
    schedule: effectiveSchedule(null, POLICY),
    records: [{ work_date: "2026-09-01", clock_in: at("2026-09-01", 4), clock_out: at("2026-09-01", 13) }],
  });
  // Only the 1st has passed, and it was worked.
  assert.equal(summary.absentDays, 0);
});

test("a day off is not an absence", () => {
  // Sundays only for this person.
  const sundayOff = effectiveSchedule({ work_days: [0] }, POLICY);
  const summary = summariseMonth({ month: "2026-09", today: "2026-09-16", schedule: sundayOff, records: [] });
  // Sundays before the 16th: the 6th and the 13th.
  assert.equal(summary.absentDays, 2);
});

test("with no hours set, nobody is marked absent", () => {
  const blank = effectiveSchedule(null, { ...POLICY, work_start_time: null, work_end_time: null });
  const summary = summariseMonth({ month: "2026-09", today: "2026-09-30", schedule: blank, records: [] });
  assert.equal(summary.absentDays, 0);
});

test("a shift nobody closed is counted as such rather than as hours", () => {
  const summary = summariseMonth({
    month: "2026-09",
    today: "2026-09-16",
    schedule: effectiveSchedule(null, POLICY),
    records: [{ work_date: "2026-09-14", clock_in: at("2026-09-14", 4), clock_out: null }],
  });
  assert.equal(summary.workedMinutes, 0);
  assert.equal(summary.unclosedShifts, 1);
  assert.equal(summary.daysPresent, 1, "they were here, even if the hours cannot be counted");
});

// ------------------------------------------------------------------- money
test("the month's attendance becomes one figure", () => {
  const adj = payrollAdjustment(
    { workedMinutes: 0, overtimeMinutes: 90, lateArrivals: 2, lateMinutes: 40, absentDays: 1, unclosedShifts: 0, daysPresent: 20 },
    POLICY
  );
  assert.equal(adj.overtimePay, 300, "1.5 hours at 200");
  assert.equal(adj.lateDeduction, 200);
  assert.equal(adj.absentDeduction, 1000);
  assert.equal(adj.net, -900);
});

test("overtime is paid to the minute, not rounded up to an hour", () => {
  // Rounding a payroll figure in the employer's favour is a decision nobody
  // asked for.
  const adj = payrollAdjustment(
    { workedMinutes: 0, overtimeMinutes: 30, lateArrivals: 0, lateMinutes: 0, absentDays: 0, unclosedShifts: 0, daysPresent: 1 },
    POLICY
  );
  assert.equal(adj.overtimePay, 100);
});

test("no rates set means no money, and says so", () => {
  const adj = payrollAdjustment(
    { workedMinutes: 0, overtimeMinutes: 120, lateArrivals: 3, lateMinutes: 60, absentDays: 2, unclosedShifts: 0, daysPresent: 18 },
    { ...POLICY, overtime_rate_per_hour: 0, late_deduction: 0, absent_deduction: 0 }
  );
  assert.equal(adj.net, 0);
  assert.equal(adj.ratesConfigured, false, "so the payroll can say the rates are unset rather than imply zero");
});
