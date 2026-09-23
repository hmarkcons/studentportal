// Staff leave: which days a request covers, how many are paid, and whose
// allowance they come out of.
//
// The rules are the staff agreement's (sample template, clause 6):
//
//   - one allowance a year (attendance_policy.annual_leave_days, 14), for
//     planned, sick and emergency leave alike, in each year of employment
//     counted from the joining date;
//   - planned leave is asked for at least a month ahead;
//   - sick and emergency leave is paid only with a medical certificate;
//   - anything past the allowance is unpaid.
//
// Only working days count — the person's own working days, less office
// holidays — the same days payroll would otherwise count as absent.
//
// Pure, so it is unit-tested (scripts/leave-test.mjs); dates are YYYY-MM-DD
// strings throughout, never Date objects, so no time zone can move a day.

export type LeaveKind = "planned" | "sick" | "emergency";

export const LEAVE_KIND_LABEL: Record<LeaveKind, string> = {
  planned: "Planned leave",
  sick: "Sick leave",
  emergency: "Emergency leave",
};

/** The notice planned leave needs, in calendar months. */
export const PLANNED_NOTICE_MONTHS = 1;

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const parts = (date: string) => date.slice(0, 10).split("-").map(Number) as [number, number, number];
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** The date n calendar months after, clamped to the month's end (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: string, n: number): string {
  const [y, m, d] = parts(date);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return iso(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: string): number {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * The leave year `onDate` falls in: from the latest anniversary of joining on
 * or before it, to the day before the next. Someone who joined on 29 February
 * has their anniversary on 28 February in other years.
 */
export function leaveYear(joinedOn: string, onDate: string): { start: string; end: string } {
  const [jy] = parts(joinedOn);
  const [oy] = parts(onDate);
  const monthsFromJoin = (year: number) => (year - jy) * 12;
  let start = addMonths(joinedOn, monthsFromJoin(oy));
  if (start > onDate) start = addMonths(joinedOn, monthsFromJoin(oy - 1));
  // Before they joined, their first year is the one that starts when they do.
  if (onDate < joinedOn) start = joinedOn;
  const next = addMonths(joinedOn, monthsFromJoin(Number(start.slice(0, 4)) + 1));
  return { start, end: addDays(next, -1) };
}

/** The working days from start to end inclusive: their working days, less holidays. */
export function workingDates(
  start: string,
  end: string,
  workDays: readonly number[],
  holidays: ReadonlySet<string> = new Set()
): string[] {
  const out: string[] = [];
  if (end < start) return out;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (workDays.includes(weekday(d)) && !holidays.has(d)) out.push(d);
    if (out.length > 400) break; // a date typed a century out; nobody takes that much leave
  }
  return out;
}

/**
 * Which of a request's days are paid from the allowance and which are not.
 *
 * Sick or emergency leave without a medical certificate is unpaid throughout
 * — the agreement pays it only with one. Otherwise the earliest days are paid
 * until the allowance runs out, and the rest are unpaid.
 */
export function splitLeave(input: {
  dates: readonly string[];
  kind: LeaveKind;
  hasCertificate: boolean;
  remaining: number;
}): { paid: string[]; unpaid: string[]; reason: "certificate" | "allowance" | null } {
  const dates = [...input.dates].sort();
  if (input.kind !== "planned" && !input.hasCertificate) {
    return { paid: [], unpaid: dates, reason: dates.length ? "certificate" : null };
  }
  const paidCount = Math.max(0, Math.min(dates.length, Math.floor(input.remaining)));
  return {
    paid: dates.slice(0, paidCount),
    unpaid: dates.slice(paidCount),
    reason: paidCount < dates.length ? "allowance" : null,
  };
}

/** Paid days already taken in a leave year, from approved requests' fixed paid dates. */
export function paidDaysUsed(approved: readonly { paid_dates: readonly string[] }[], year: { start: string; end: string }): number {
  let used = 0;
  for (const r of approved) for (const d of r.paid_dates) if (d >= year.start && d <= year.end) used++;
  return used;
}

/** Planned leave starting sooner than a month after it was asked for. */
export function shortNotice(kind: LeaveKind, requestedOn: string, start: string): boolean {
  return kind === "planned" && start < addMonths(requestedOn, PLANNED_NOTICE_MONTHS);
}

/**
 * Leave and holidays for one month, as payroll needs them: the days that are
 * not an absence (paid leave, holidays) and the days that are, but are leave.
 */
export function leaveForMonth(
  month: string,
  approved: readonly { paid_dates: readonly string[]; unpaid_dates: readonly string[] }[],
  holidays: readonly string[]
): { paidLeave: Set<string>; unpaidLeave: Set<string>; holidays: Set<string> } {
  const inMonth = (d: string) => d.startsWith(month);
  const paidLeave = new Set<string>();
  const unpaidLeave = new Set<string>();
  for (const r of approved) {
    for (const d of r.paid_dates) if (inMonth(d)) paidLeave.add(d);
    for (const d of r.unpaid_dates) if (inMonth(d)) unpaidLeave.add(d);
  }
  return { paidLeave, unpaidLeave, holidays: new Set(holidays.filter(inMonth)) };
}
