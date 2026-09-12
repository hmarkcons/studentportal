// Turning attendance records into hours, and hours into money.
//
// Every judgement here is deliberately explicit, because a payroll figure
// somebody cannot reconstruct is a figure they will not trust:
//
//   * a shift nobody clocked out of is not paid a length — the time they left
//     is not recorded, and counting to "now" or to the end of the shift would
//     be inventing it (see clock_out_missing, 0157);
//   * a day with no attendance record at all is an absence only if it was a
//     working day for that person and it is in the past;
//   * today is never counted as an absence — the day is not over;
//   * overtime is time past the end of the shift, not time past eight hours:
//     the hours are per person and may not be eight.
//
// Times are Karachi's throughout, matching how attendance is recorded.

import { OFFICE_TIMEZONE, officeToday, shiftMinutes, type ShiftRow } from "./attendance.ts";

export type AttendancePolicy = {
  work_start_time: string | null;
  work_end_time: string | null;
  work_days: number[];
  grace_minutes: number;
  overtime_rate_per_hour: number;
  late_deduction: number;
  absent_deduction: number;
};

export type StaffSchedule = {
  work_start_time?: string | null;
  work_end_time?: string | null;
  work_days?: number[] | null;
};

export type Schedule = {
  start: string | null;
  end: string | null;
  days: number[];
  graceMinutes: number;
  /** True when there are hours to hold this person to at all. */
  configured: boolean;
};

/** A staff member's own hours, falling back to the office policy. */
export function effectiveSchedule(staff: StaffSchedule | null, policy: AttendancePolicy): Schedule {
  const start = staff?.work_start_time ?? policy.work_start_time ?? null;
  const end = staff?.work_end_time ?? policy.work_end_time ?? null;
  const days = staff?.work_days?.length ? staff.work_days : policy.work_days;
  return { start, end, days, graceMinutes: policy.grace_minutes, configured: Boolean(start && end) };
}

/** "09:30" or "09:30:00" as minutes past midnight. */
export function timeToMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** An instant as minutes past midnight in the office's own timezone. */
export function instantToOfficeMinutes(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = d.toLocaleTimeString("en-GB", {
    timeZone: OFFICE_TIMEZONE,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  return timeToMinutes(parts);
}

/**
 * How many minutes past the grace period this arrival was, or 0.
 *
 * Arriving at 09:10 against a 09:00 start and fifteen minutes' grace is not
 * late at all, and arriving at 09:20 is five minutes late rather than twenty:
 * the grace is a boundary, not a discount.
 */
export function lateMinutes(clockIn: string | null, schedule: Schedule): number {
  const arrived = instantToOfficeMinutes(clockIn);
  const due = timeToMinutes(schedule.start);
  if (arrived === null || due === null) return 0;
  const allowed = due + schedule.graceMinutes;
  return arrived > allowed ? arrived - allowed : 0;
}

/** Minutes worked past the end of the shift. Nothing for an unclosed one. */
export function overtimeMinutes(row: ShiftRow, schedule: Schedule): number {
  const left = instantToOfficeMinutes(row.clock_out ?? null);
  const due = timeToMinutes(schedule.end);
  if (left === null || due === null) return 0;
  return left > due ? left - due : 0;
}

/** Every date in a month, as YYYY-MM-DD. */
export function datesInMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const out: string[] = [];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  for (let day = 1; day <= last; day++) {
    out.push(`${month}-${String(day).padStart(2, "0")}`);
  }
  return out;
}

/** 0 = Sunday … 6 = Saturday, for a date-only string. */
export function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export type MonthSummary = {
  /** Shifts that could be measured — one with no clock-out cannot be. */
  workedMinutes: number;
  overtimeMinutes: number;
  lateArrivals: number;
  lateMinutes: number;
  /** Working days in the month, up to and excluding today, with no record. */
  absentDays: number;
  /** Shifts nobody clocked out of: hours nobody can count. */
  unclosedShifts: number;
  daysPresent: number;
};

export function summariseMonth(input: {
  month: string;
  records: (ShiftRow & { work_date: string })[];
  schedule: Schedule;
  today?: string;
}): MonthSummary {
  const today = input.today ?? officeToday();
  const byDate = new Map<string, (ShiftRow & { work_date: string })[]>();
  for (const r of input.records) {
    const list = byDate.get(r.work_date) ?? [];
    list.push(r);
    byDate.set(r.work_date, list);
  }

  let workedMinutes = 0;
  let overtime = 0;
  let lateArrivals = 0;
  let lateTotal = 0;
  let unclosed = 0;

  for (const r of input.records) {
    const minutes = shiftMinutes(r);
    if (minutes === null) {
      // Either still in progress or given up on. Neither is a length.
      if (!r.clock_out) unclosed++;
    } else {
      workedMinutes += minutes;
      overtime += overtimeMinutes(r, input.schedule);
    }
    const late = lateMinutes(r.clock_in ?? null, input.schedule);
    if (late > 0) {
      lateArrivals++;
      lateTotal += late;
    }
  }

  let absent = 0;
  if (input.schedule.configured) {
    for (const date of datesInMonth(input.month)) {
      // Today is not an absence: the day is not over. Nor is any future date.
      if (date >= today) continue;
      if (!input.schedule.days.includes(weekdayOf(date))) continue;
      if (!byDate.has(date)) absent++;
    }
  }

  return {
    workedMinutes,
    overtimeMinutes: overtime,
    lateArrivals,
    lateMinutes: lateTotal,
    absentDays: absent,
    unclosedShifts: unclosed,
    daysPresent: byDate.size,
  };
}

export type PayrollAdjustment = {
  overtimePay: number;
  lateDeduction: number;
  absentDeduction: number;
  /** Positive adds to the payslip, negative takes off. */
  net: number;
  /** True when no rate is set, so the figures above are all zero by default. */
  ratesConfigured: boolean;
};

/**
 * What the month's attendance is worth.
 *
 * Overtime is paid by the hour and rounded to the minute rather than up to a
 * whole hour, because rounding a payroll figure in the employer's favour is a
 * decision nobody asked for. Lateness and absence are per occurrence, which is
 * how both were described.
 */
export function payrollAdjustment(summary: MonthSummary, policy: AttendancePolicy): PayrollAdjustment {
  const overtimePay = (summary.overtimeMinutes / 60) * Number(policy.overtime_rate_per_hour ?? 0);
  const lateDeduction = summary.lateArrivals * Number(policy.late_deduction ?? 0);
  const absentDeduction = summary.absentDays * Number(policy.absent_deduction ?? 0);
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    overtimePay: round(overtimePay),
    lateDeduction: round(lateDeduction),
    absentDeduction: round(absentDeduction),
    net: round(overtimePay - lateDeduction - absentDeduction),
    ratesConfigured:
      Number(policy.overtime_rate_per_hour ?? 0) > 0 ||
      Number(policy.late_deduction ?? 0) > 0 ||
      Number(policy.absent_deduction ?? 0) > 0,
  };
}
