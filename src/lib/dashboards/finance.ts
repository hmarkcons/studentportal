// The finance dashboard: money in, money owed, money late. Pure —
// scripts/dashboards-test.mjs.
//
// Invoices are raised in EUR, PKR or USD. Totals across currencies — a
// chart, an overdue total — are converted to PKR with the fixed rates the
// payroll and commission pages already use for the same purpose (toPKR in
// constants.ts) and say "≈" wherever they are shown. The collected figure for
// this month is also given per currency, unconverted, because that is the one
// that gets reconciled against a bank statement.

import { toPKR } from "../constants.ts";
import type { ReportMonth } from "../leadOwners.ts";
import { percentOf } from "../chartMath.ts";
import { addDays, daysBetween, karachiMonth } from "./dates.ts";

export const DUE_SOON_DAYS = 30;

export type FinInstallment = {
  amount: number | string | null;
  amount_paid: number | string | null;
  status: string | null;
  due_date: string | null;
  paid_date: string | null;
  currency: string;
  studentId: string | null;
  studentName: string | null;
};
export type FinRefund = { status: string | null; amount: number | string | null; currency: string | null };
export type FinPartnerCommission = {
  status: string | null;
  expected_amount: number | string | null;
  paid_fee: number | string | null;
  currency: string | null;
  received_date: string | null;
};
export type FinStaffCommission = { status: string | null; amount: number | string | null; currency: string | null };

function num(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** What has been received against an instalment — the rule computePaymentProgress uses. */
export function paidOn(i: Pick<FinInstallment, "amount" | "amount_paid" | "status">): number {
  if (i.status === "paid") return num(i.amount);
  if (i.status === "partial") return num(i.amount_paid);
  return 0;
}

export const AGING_BUCKETS = [
  { label: "1–30 days", max: 30 },
  { label: "31–60 days", max: 60 },
  { label: "61–90 days", max: 90 },
  { label: "Over 90 days", max: Infinity },
];

export type FinanceSummary = {
  /** Received this month, per currency, unconverted. */
  collectedThisMonth: { currency: string; amount: number }[];
  collectedMonthlyPkr: { key: string; label: string; pkr: number }[];
  /** Instalments falling due this month, against what of them has been received. ≈PKR. */
  dueThisMonthPkr: number;
  collectedOfDueThisMonthPkr: number;
  outstandingPkr: number;
  overduePkr: number;
  overdueCount: number;
  aging: { label: string; pkr: number }[];
  overdue: { studentId: string | null; studentName: string; remaining: number; currency: string; days: number }[];
  dueSoonCount: number;
  dueSoonPkr: number;
  refunds: { toApprove: number; toPay: number; toPayPkr: number };
  partner: { expectedPkr: number; receivedPkr: number; overdueCount: number; receivedThisMonthPkr: number; rate: number | null };
  staffCommissionUnpaidPkr: number;
};

export function summarizeFinance({
  installments,
  refunds,
  partnerCommissions,
  staffCommissions,
  months,
  today,
}: {
  installments: FinInstallment[];
  refunds: FinRefund[];
  partnerCommissions: FinPartnerCommission[];
  staffCommissions: FinStaffCommission[];
  months: ReportMonth[];
  today: string;
}): FinanceSummary {
  const thisMonth = today.slice(0, 7);
  const soon = addDays(today, DUE_SOON_DAYS);

  const collected = new Map<string, number>();
  const monthly = months.map((m) => ({ key: m.key, label: m.label, pkr: 0 }));
  const bucket = new Map(monthly.map((m) => [m.key, m]));
  const aging = AGING_BUCKETS.map((b) => ({ label: b.label, pkr: 0 }));
  const overdue: FinanceSummary["overdue"] = [];
  let dueThisMonthPkr = 0;
  let collectedOfDueThisMonthPkr = 0;
  let outstandingPkr = 0;
  let overduePkr = 0;
  let dueSoonCount = 0;
  let dueSoonPkr = 0;

  for (const i of installments) {
    const received = paidOn(i);
    const remaining = Math.max(0, num(i.amount) - received);
    const currency = i.currency || "EUR";

    if (received > 0 && i.paid_date) {
      const month = karachiMonth(i.paid_date);
      const b = bucket.get(month);
      if (b) b.pkr += toPKR(received, currency);
      if (month === thisMonth) collected.set(currency, (collected.get(currency) ?? 0) + received);
    }

    const due = (i.due_date ?? "").slice(0, 10);
    if (due.slice(0, 7) === thisMonth) {
      dueThisMonthPkr += toPKR(num(i.amount), currency);
      collectedOfDueThisMonthPkr += toPKR(received, currency);
    }

    if (remaining <= 0) continue;
    outstandingPkr += toPKR(remaining, currency);
    if (due && due < today) {
      const days = daysBetween(due, today);
      overduePkr += toPKR(remaining, currency);
      const slot = AGING_BUCKETS.findIndex((b) => days <= b.max);
      aging[slot].pkr += toPKR(remaining, currency);
      overdue.push({ studentId: i.studentId, studentName: i.studentName ?? "Student", remaining, currency, days });
    } else if (due && due <= soon) {
      dueSoonCount++;
      dueSoonPkr += toPKR(remaining, currency);
    }
  }
  overdue.sort((a, b) => b.days - a.days || toPKR(b.remaining, b.currency) - toPKR(a.remaining, a.currency));

  let toApprove = 0;
  let toPay = 0;
  let toPayPkr = 0;
  for (const r of refunds) {
    if (r.status === "requested") toApprove++;
    if (r.status === "approved") {
      toPay++;
      toPayPkr += toPKR(num(r.amount), r.currency ?? "PKR");
    }
  }

  let expectedPkr = 0;
  let receivedPkr = 0;
  let partnerOverdue = 0;
  let receivedThisMonthPkr = 0;
  for (const c of partnerCommissions) {
    const currency = c.currency ?? "EUR";
    if (c.status === "disputed") continue;
    expectedPkr += toPKR(num(c.expected_amount), currency);
    const got = c.status === "received" ? num(c.expected_amount) : c.status === "partially_received" ? num(c.paid_fee) : 0;
    receivedPkr += toPKR(got, currency);
    if (c.status === "overdue") partnerOverdue++;
    if (got > 0 && c.received_date && karachiMonth(c.received_date) === thisMonth) receivedThisMonthPkr += toPKR(got, currency);
  }

  const staffCommissionUnpaidPkr = staffCommissions
    .filter((s) => s.status === "unpaid")
    .reduce((a, s) => a + toPKR(num(s.amount), s.currency ?? "PKR"), 0);

  return {
    collectedThisMonth: [...collected.entries()].map(([currency, amount]) => ({ currency, amount: round2(amount) })).sort((a, b) => a.currency.localeCompare(b.currency)),
    collectedMonthlyPkr: monthly.map((m) => ({ ...m, pkr: Math.round(m.pkr) })),
    dueThisMonthPkr: Math.round(dueThisMonthPkr),
    collectedOfDueThisMonthPkr: Math.round(collectedOfDueThisMonthPkr),
    outstandingPkr: Math.round(outstandingPkr),
    overduePkr: Math.round(overduePkr),
    overdueCount: overdue.length,
    aging: aging.map((a) => ({ ...a, pkr: Math.round(a.pkr) })),
    overdue: overdue.slice(0, 8),
    dueSoonCount,
    dueSoonPkr: Math.round(dueSoonPkr),
    refunds: { toApprove, toPay, toPayPkr: Math.round(toPayPkr) },
    partner: {
      expectedPkr: Math.round(expectedPkr),
      receivedPkr: Math.round(receivedPkr),
      overdueCount: partnerOverdue,
      receivedThisMonthPkr: Math.round(receivedThisMonthPkr),
      rate: percentOf(receivedPkr, expectedPkr),
    },
    staffCommissionUnpaidPkr: Math.round(staffCommissionUnpaidPkr),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
