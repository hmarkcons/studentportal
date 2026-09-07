"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PAYMENT_STATUS_LABELS } from "@/lib/invoiceMath";
import { formatDateOnly } from "@/lib/formatDate";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { Select } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";

export type FeeStatus = "paid_in_full" | "partially_paid" | "payment_pending" | "withdrawn";

export type FeeRow = {
  studentId: string;
  studentName: string;
  country: string | null;
  intake: string | null;
  level: string | null;
  counselor: string | null;
  currency: string;
  total: number;
  paid: number;
  outstanding: number;
  installmentsPaid: number;
  installmentsTotal: number;
  adminCharge: number;
  adminFeePaid: boolean;
  nextDueDate: string | null;
  /** Any unpaid installment already past its due date. */
  overdue: boolean;
  status: FeeStatus;
  hasInvoice: boolean;
};

const STATUS_TONE: Record<FeeStatus, "success" | "warning" | "neutral" | "danger"> = {
  paid_in_full: "success",
  partially_paid: "warning",
  payment_pending: "neutral",
  withdrawn: "danger",
};

const LEVEL_LABELS: Record<string, string> = { bachelors: "Bachelors", masters: "Masters", phd: "PhD" };

function money(currency: string, n: number) {
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function uniq(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))].sort();
}

export function ConsultancyFeeOverview({ rows, canManage }: { rows: FeeRow[]; canManage: boolean }) {
  const [country, setCountry] = useState("");
  const [intake, setIntake] = useState("");
  const [level, setLevel] = useState("");
  const [counselor, setCounselor] = useState("");
  const [status, setStatus] = useState("");

  const options = useMemo(
    () => ({
      countries: uniq(rows.map((r) => r.country)),
      intakes: uniq(rows.map((r) => r.intake)),
      levels: uniq(rows.map((r) => r.level)),
      counselors: uniq(rows.map((r) => r.counselor)),
    }),
    [rows]
  );

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!country || r.country === country) &&
          (!intake || r.intake === intake) &&
          (!level || r.level === level) &&
          (!counselor || r.counselor === counselor) &&
          (!status || r.status === status)
      ),
    [rows, country, intake, level, counselor, status]
  );

  // Totals follow the filters, so "Italy, Fall 2026, partially paid" answers
  // how much that specific group still owes rather than the whole book.
  const summary = useMemo(() => {
    const s = { paid_in_full: 0, partially_paid: 0, payment_pending: 0, withdrawn: 0, outstanding: 0, overdue: 0 };
    for (const r of filtered) {
      s[r.status] += 1;
      if (r.status !== "withdrawn") s.outstanding += r.outstanding;
      if (r.overdue) s.overdue += 1;
    }
    return s;
  }, [filtered]);

  // Mixed currencies can't be summed into one figure honestly.
  const currencies = useMemo(() => uniq(filtered.map((r) => r.currency)), [filtered]);
  const anyFilter = Boolean(country || intake || level || counselor || status);

  return (
    <div className="mb-8">
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Paid in full" value={summary.paid_in_full} tone="success" icon="✅" />
        <StatCard label="Partially paid" value={summary.partially_paid} tone="warning" icon="◐" />
        <StatCard label="Payment pending" value={summary.payment_pending} tone="default" icon="⏳" />
        <StatCard
          label={summary.overdue ? `Overdue (${summary.overdue})` : "Outstanding"}
          value={currencies.length === 1 ? money(currencies[0], summary.outstanding) : `${filtered.length} students`}
          tone={summary.overdue ? "danger" : "default"}
          icon="💰"
        />
      </div>

      {currencies.length > 1 && (
        <p className="mb-3 text-xs text-muted">
          These students are billed in {currencies.join(", ")}, so the outstanding total is not summed — filter to one
          country to see a figure.
        </p>
      )}

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <Filter label="Country" value={country} onChange={setCountry} options={options.countries} />
        <Filter label="Intake" value={intake} onChange={setIntake} options={options.intakes} />
        <Filter
          label="Level"
          value={level}
          onChange={setLevel}
          options={options.levels}
          render={(v) => LEVEL_LABELS[v] ?? v}
        />
        <Filter label="Counselor" value={counselor} onChange={setCounselor} options={options.counselors} />
        <Filter
          label="Payment status"
          value={status}
          onChange={setStatus}
          options={["paid_in_full", "partially_paid", "payment_pending", "withdrawn"]}
          render={(v) => PAYMENT_STATUS_LABELS[v as FeeStatus]}
        />
        {anyFilter && (
          <button
            type="button"
            onClick={() => {
              setCountry("");
              setIntake("");
              setLevel("");
              setCounselor("");
              setStatus("");
            }}
            className="text-xs text-primary hover:underline"
          >
            Clear filters
          </button>
        )}
        <span className="text-xs text-muted">
          {filtered.length} of {rows.length} students
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState>No registered students match these filters.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted">
                <Th>Student</Th>
                <Th>Country</Th>
                <Th>Intake</Th>
                <Th>Level</Th>
                <Th>Counselor</Th>
                <Th right>Total</Th>
                <Th right>Paid</Th>
                <Th right>Pending</Th>
                <Th>Installments</Th>
                <Th>Admin charge</Th>
                <Th>Next deadline</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.studentId} className="border-b border-border last:border-0">
                  <Td>
                    <Link href={`/students/${r.studentId}`} className="text-primary hover:underline">
                      {r.studentName}
                    </Link>
                  </Td>
                  <Td muted>{r.country ?? "—"}</Td>
                  <Td muted>{r.intake ?? "—"}</Td>
                  <Td muted>{r.level ? LEVEL_LABELS[r.level] ?? r.level : "—"}</Td>
                  <Td muted>{r.counselor ?? "Unassigned"}</Td>
                  <Td right>{r.hasInvoice ? money(r.currency, r.total) : "—"}</Td>
                  <Td right>{r.hasInvoice ? money(r.currency, r.paid) : "—"}</Td>
                  <Td right>
                    {r.hasInvoice ? (
                      <span className={r.outstanding > 0 ? "text-warning" : "text-success"}>
                        {money(r.currency, r.outstanding)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td muted>
                    {r.hasInvoice ? (
                      <>
                        {r.installmentsPaid}/{r.installmentsTotal} paid
                        {r.installmentsTotal - r.installmentsPaid > 0 && (
                          <span className="text-warning"> · {r.installmentsTotal - r.installmentsPaid} left</span>
                        )}
                      </>
                    ) : (
                      "no invoice"
                    )}
                  </Td>
                  <Td>
                    {r.adminCharge > 0 ? (
                      <Badge tone={r.adminFeePaid ? "success" : "warning"}>{r.adminFeePaid ? "Paid" : "Unpaid"}</Badge>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                  <Td>
                    {r.nextDueDate ? (
                      <span className={r.overdue ? "text-danger" : "text-ink"}>
                        {formatDateOnly(r.nextDueDate)}
                        {r.overdue ? " · overdue" : ""}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                  <Td>
                    <Badge tone={STATUS_TONE[r.status]}>{PAYMENT_STATUS_LABELS[r.status]}</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!canManage && (
        <p className="mt-2 text-xs text-muted">
          Read-only view. Recording and editing payments is restricted to Super Admin.
        </p>
      )}
    </div>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
  render,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  render?: (v: string) => string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <Select value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-auto py-0 text-xs">
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {render ? render(o) : o}
          </option>
        ))}
      </Select>
    </label>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`whitespace-nowrap px-3 py-2 font-medium ${right ? "text-right" : ""}`}>{children}</th>;
}

function Td({ children, right, muted }: { children: React.ReactNode; right?: boolean; muted?: boolean }) {
  return (
    <td className={`whitespace-nowrap px-3 py-2 ${right ? "text-right font-mono text-xs" : ""} ${muted ? "text-muted" : "text-ink"}`}>
      {children}
    </td>
  );
}
