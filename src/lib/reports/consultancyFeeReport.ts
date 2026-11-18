// The consultancy fee report (2026-11-18): every registered student's
// consultancy fee, by how its payment stands —
//
//   Paid in full     the invoice is settled: every instalment paid
//   Pending fee      something still to pay, nothing overdue yet (including
//                    a student not yet invoiced at all)
//   Payment overdue  an instalment unpaid past its due date
//   Withdrawn        the student withdrew, whatever they paid
//
// in that order of precedence: a withdrawn student is Withdrawn even with an
// overdue instalment. The figures are the Consultancy Fee page's own —
// computeInvoiceMath and computePaymentProgress on the same rows.
//
// Pure — no portal imports — so the unit tests load it under plain Node.
import { day, money } from "../studentReport.ts";
import type { TableReport, TableRow } from "./tableReport.ts";

export type FeeCategory = "paid_in_full" | "pending" | "overdue" | "withdrawn";
export type FeeFilter = "all" | FeeCategory;

export const FEE_FILTER_LABELS: Record<FeeFilter, string> = {
  all: "All students",
  paid_in_full: "Paid in full",
  pending: "Pending fee",
  overdue: "Payment overdue",
  withdrawn: "Withdrawn",
};

export type FeeReportFilters = { category: FeeFilter };

export function parseFeeFilters(params: URLSearchParams | Record<string, string | string[] | undefined>): FeeReportFilters {
  const raw = params instanceof URLSearchParams ? params.get("category") : params.category;
  const value = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  return { category: value in FEE_FILTER_LABELS ? (value as FeeFilter) : "all" };
}

/** One student's fee, as the loader reads it. */
export type FeeStanding = {
  studentId: string;
  name: string;
  code: string | null;
  country: string | null;
  intake: string | null;
  counsellor: string | null;
  withdrawn: boolean;
  invoiced: boolean;
  currency: string;
  total: number;
  paid: number;
  outstanding: number;
  instalmentsPaid: number;
  instalmentsTotal: number;
  nextDue: string | null;
  /** The earliest unpaid instalment's due date, when it is past. */
  overdueSince: string | null;
};

/** Where a student's fee stands, by the order of precedence above. */
export function feeCategory(s: Pick<FeeStanding, "withdrawn" | "invoiced" | "instalmentsTotal" | "outstanding" | "overdueSince">): FeeCategory {
  if (s.withdrawn) return "withdrawn";
  // Paid in full only on an invoice with something on it to pay: with no
  // instalments there is nothing paid, whatever the arithmetic says.
  if (s.invoiced && s.instalmentsTotal > 0 && s.outstanding <= 0) return "paid_in_full";
  if (s.overdueSince) return "overdue";
  return "pending";
}

/** The earliest due date of an instalment not fully paid that is before today. */
export function overdueSince(instalments: readonly { status: string | null; due_date: string | null }[], today: string): string | null {
  let first: string | null = null;
  for (const i of instalments) {
    if (i.status === "paid" || !i.due_date || i.due_date >= today) continue;
    if (!first || i.due_date < first) first = i.due_date;
  }
  return first;
}

const TONE = { paid_in_full: "good", pending: "warn", overdue: "bad", withdrawn: "muted" } as const;

export function buildFeeReport(
  all: readonly FeeStanding[],
  filters: FeeReportFilters,
  meta: { preparedOn: string; preparedBy: string | null }
): TableReport {
  const withCategory = all.map((s) => ({ s, category: feeCategory(s) }));
  const shown = withCategory
    .filter((x) => filters.category === "all" || x.category === filters.category)
    .sort((a, b) => a.s.name.localeCompare(b.s.name, "en", { sensitivity: "base" }));

  const count = (c: FeeCategory) => withCategory.filter((x) => x.category === c).length;
  // What is still owed by the students shown, per currency (never added across currencies).
  const owed = new Map<string, number>();
  for (const { s } of shown) if (s.outstanding > 0 && !s.withdrawn) owed.set(s.currency, (owed.get(s.currency) ?? 0) + s.outstanding);

  const rows: TableRow[] = shown.map(({ s, category }) => ({
    tone: TONE[category],
    cells: {
      student: s.name,
      code: s.code ?? "—",
      country: s.country ?? "—",
      intake: s.intake ?? "—",
      counsellor: s.counsellor ?? "—",
      total: s.invoiced ? money(s.currency, s.total) : "Not invoiced",
      paid: s.invoiced ? money(s.currency, s.paid) : "—",
      outstanding: s.invoiced ? money(s.currency, s.outstanding) : "—",
      instalments: s.instalmentsTotal ? `${s.instalmentsPaid} of ${s.instalmentsTotal}` : "—",
      nextDue: day(s.nextDue) ?? "—",
      overdue: day(s.overdueSince) ?? "—",
      status: FEE_FILTER_LABELS[category],
    },
  }));

  return {
    title: "Consultancy fee report",
    filters: FEE_FILTER_LABELS[filters.category],
    preparedOn: meta.preparedOn,
    preparedBy: meta.preparedBy,
    summary: [
      { label: "Students shown", value: String(shown.length) },
      { label: "Paid in full", value: String(count("paid_in_full")), tone: "good" },
      { label: "Pending fee", value: String(count("pending")), tone: "warn" },
      { label: "Payment overdue", value: String(count("overdue")), tone: "bad" },
      { label: "Withdrawn", value: String(count("withdrawn")), tone: "muted" },
      ...[...owed].map(([currency, amount]) => ({ label: `Still owed (${currency})`, value: money(currency, amount) })),
    ],
    columns: [
      { key: "student", header: "Student", width: 1.8 },
      { key: "code", header: "Student ID", width: 1.3 },
      { key: "country", header: "Country", width: 1.2 },
      { key: "intake", header: "Intake", width: 0.9 },
      { key: "counsellor", header: "Counsellor", width: 1.2 },
      { key: "total", header: "Total", width: 1.2, align: "right" },
      { key: "paid", header: "Paid", width: 1.2, align: "right" },
      { key: "outstanding", header: "Outstanding", width: 1.2, align: "right" },
      { key: "instalments", header: "Instalments paid", width: 0.9 },
      { key: "nextDue", header: "Next due", width: 1 },
      { key: "overdue", header: "Overdue since", width: 1 },
      { key: "status", header: "Status", width: 1.1 },
    ],
    rows,
    empty: `No registered student's fee is ${FEE_FILTER_LABELS[filters.category].toLowerCase()} just now.`,
    note: "Paid in full: every instalment paid. Pending fee: something still to pay, nothing overdue (a student not yet invoiced included). Payment overdue: an instalment unpaid past its due date. Withdrawn: the student withdrew, whatever was paid. Amounts are in each invoice's own currency.",
  };
}
