"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { ProofFileCell } from "@/components/ProofFileCell";
import { toPKR } from "@/lib/constants";
import {
  createStaffCommission,
  updateStaffCommission,
  deleteStaffCommission,
  markStaffCommissionPaid,
  uploadStaffCommissionProof,
} from "@/lib/actions/finance";
import { INVOICE_STATUS_LABELS, type InvoiceStatus } from "@/lib/invoiceStatus";

const REVALIDATE_TO = "/finance/staff-commission";
const PAGE_SIZE = 10;

export type CommissionRow = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  payment_method: string | null;
  registration_date: string | null;
  payment_proof_path: string | null;
  staffId: string;
  staffName: string;
  studentName: string;
  studentEmail: string | null;
  registeredMonth: string | null;
  registrationStatus: string | null;
  universityName: string | null;
  programName: string | null;
  intake: string | null;
  refundCount: number;
  consultancyFeeStatus: InvoiceStatus | null;
  adminFeeStatus: "paid" | "unpaid" | null;
};

function AddCommissionForm({ staffList, students }: { staffList: { id: string; full_name: string }[]; students: { id: string; full_name: string }[] }) {
  const action = createStaffCommission.bind(null, REVALIDATE_TO);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-3">
      <Select name="staff_id" required>
        <option value="">Staff…</option>
        {staffList.map((s) => (
          <option key={s.id} value={s.id}>
            {s.full_name}
          </option>
        ))}
      </Select>
      <Select name="student_id" required>
        <option value="">Student…</option>
        {students.map((s) => (
          <option key={s.id} value={s.id}>
            {s.full_name}
          </option>
        ))}
      </Select>
      <Input name="amount" type="number" step="0.01" placeholder="Commission amount" required className="w-32" />
      <Select name="currency" defaultValue="PKR">
        <option value="PKR">PKR</option>
        <option value="EUR">EUR</option>
        <option value="USD">USD</option>
      </Select>
      <Input name="registration_date" type="date" />
      <Button type="submit" variant="primary" size="sm" disabled={pending}>
        {pending ? "Adding…" : "+ Add commission"}
      </Button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}

function EditRow({ row, onDone }: { row: CommissionRow; onDone: () => void }) {
  const action = updateStaffCommission.bind(null, row.id, REVALIDATE_TO);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1 rounded-md border border-border p-2">
      <Input name="amount" type="number" step="0.01" defaultValue={row.amount} required className="w-24" />
      <Input name="currency" defaultValue={row.currency} required className="w-16" />
      <Input name="registration_date" type="date" defaultValue={row.registration_date ?? ""} />
      <Select name="status" defaultValue={row.status}>
        <option value="unpaid">unpaid</option>
        <option value="paid">paid</option>
      </Select>
      <Select name="payment_method" defaultValue={row.payment_method ?? ""}>
        <option value="">Method…</option>
        <option value="Cash">Cash</option>
        <option value="Bank transfer">Bank transfer</option>
        <option value="Card">Card</option>
        <option value="Other">Other</option>
      </Select>
      <Button type="submit" variant="primary" size="sm" pending={pending}>
        Save
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onDone}>
        Cancel
      </Button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}

function MarkPaidButton({ id }: { id: string }) {
  const action = markStaffCommissionPaid.bind(null, id, REVALIDATE_TO);
  const [, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex items-center gap-1">
      <Button type="submit" variant="success" size="sm">
        Mark paid
      </Button>
    </form>
  );
}

function feeStatusTone(status: string | null) {
  if (status === "paid" || status === "registered") return "success" as const;
  if (status === "overdue" || status === "withdrawn") return "danger" as const;
  if (status === "pending" || status === "unpaid") return "warning" as const;
  return "neutral" as const;
}

function StatCard({
  icon,
  iconTone,
  label,
  value,
  caption,
}: {
  icon: string;
  iconTone: "primary" | "success" | "danger" | "warning";
  label: string;
  value: string;
  caption: string;
}) {
  const iconBg = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    danger: "bg-danger/10 text-danger",
    warning: "bg-warning/10 text-warning",
  }[iconTone];

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{label}</p>
        <span className={`flex h-8 w-8 items-center justify-center rounded-md text-base ${iconBg}`}>{icon}</span>
      </div>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs text-muted">{caption}</p>
    </div>
  );
}

export function StaffCommissionTable({
  rows,
  staffList,
  students,
  proofUrls,
}: {
  rows: CommissionRow[];
  staffList: { id: string; full_name: string }[];
  students: { id: string; full_name: string }[];
  proofUrls: Record<string, string>;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [monthInput, setMonthInput] = useState("all");
  const [counselorInput, setCounselorInput] = useState("all");
  const [regStatusInput, setRegStatusInput] = useState("all");
  const [commStatusInput, setCommStatusInput] = useState("all");
  const [applied, setApplied] = useState({ name: "", month: "all", counselor: "all", regStatus: "all", commStatus: "all" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  function search() {
    setApplied({ name: nameInput.trim().toLowerCase(), month: monthInput, counselor: counselorInput, regStatus: regStatusInput, commStatus: commStatusInput });
    setPage(1);
  }
  function clear() {
    setNameInput("");
    setMonthInput("all");
    setCounselorInput("all");
    setRegStatusInput("all");
    setCommStatusInput("all");
    setApplied({ name: "", month: "all", counselor: "all", regStatus: "all", commStatus: "all" });
    setPage(1);
  }

  const months = useMemo(
    () => Array.from(new Set(rows.map((r) => r.registeredMonth).filter((m): m is string => Boolean(m)))),
    [rows]
  );

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (applied.name && !r.studentName.toLowerCase().includes(applied.name) && !r.staffName.toLowerCase().includes(applied.name)) return false;
        if (applied.month !== "all" && r.registeredMonth !== applied.month) return false;
        if (applied.counselor !== "all" && r.staffId !== applied.counselor) return false;
        if (applied.regStatus !== "all" && r.registrationStatus !== applied.regStatus) return false;
        if (applied.commStatus !== "all" && r.status !== applied.commStatus) return false;
        return true;
      }),
    [rows, applied]
  );

  const stats = useMemo(() => {
    const totalPKR = filtered.reduce((sum, r) => sum + toPKR(r.amount, r.currency), 0);
    const paid = filtered.filter((r) => r.status === "paid").length;
    const unpaid = filtered.filter((r) => r.status === "unpaid").length;
    const refunds = filtered.reduce((sum, r) => sum + r.refundCount, 0);
    return { totalPKR, paid, unpaid, refunds };
  }, [filtered]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const rangeStart = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filtered.length);

  return (
    <div>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon="💰" iconTone="primary" label="Total Commission" value={`₨ ${Math.round(stats.totalPKR).toLocaleString()}`} caption="Filtered records" />
        <StatCard icon="✅" iconTone="success" label="Paid" value={String(stats.paid)} caption="Commission paid" />
        <StatCard icon="⏳" iconTone="warning" label="Unpaid" value={String(stats.unpaid)} caption="Awaiting payment" />
        <StatCard icon="🔄" iconTone="danger" label="Refunds" value={String(stats.refunds)} caption="Refund requests on file" />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-ink">Student</h3>
        <Button variant="primary" size="sm" onClick={() => setShowAddForm((v) => !v)}>
          {showAddForm ? "Close" : "+ Add Student"}
        </Button>
      </div>

      {showAddForm && <AddCommissionForm staffList={staffList} students={students} />}

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Search
          <Input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Student or staff name…"
            className="w-48 px-3"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Month
          <Select value={monthInput} onChange={(e) => setMonthInput(e.target.value)} className="w-36">
            <option value="all">All months</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Counselor
          <Select value={counselorInput} onChange={(e) => setCounselorInput(e.target.value)} className="w-40">
            <option value="all">All counselors</option>
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Reg. Status
          <Select value={regStatusInput} onChange={(e) => setRegStatusInput(e.target.value)} className="w-36">
            <option value="all">All</option>
            <option value="registered">Registered</option>
            <option value="withdrawn">Withdrawn</option>
            <option value="ghost">Ghost</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Comm. Status
          <Select value={commStatusInput} onChange={(e) => setCommStatusInput(e.target.value)} className="w-32">
            <option value="all">All</option>
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
          </Select>
        </label>
        <Button variant="primary" onClick={search}>
          Search
        </Button>
        <Button onClick={clear}>Clear</Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[1180px] text-sm">
          <thead>
            <tr className="border-b border-border bg-bg text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Reg. Month</th>
              <th className="px-4 py-3">University</th>
              <th className="px-4 py-3">Program</th>
              <th className="px-4 py-3">Intake</th>
              <th className="px-4 py-3">Counselor</th>
              <th className="px-4 py-3">Reg. Status</th>
              <th className="px-4 py-3 text-right">Commission</th>
              <th className="px-4 py-3">Comm. Status</th>
              <th className="px-4 py-3">Proof</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0 align-top">
                {editingId === r.id ? (
                  <td colSpan={11} className="px-4 py-3">
                    <EditRow row={r} onDone={() => setEditingId(null)} />
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-3">
                      <p className="text-ink">{r.studentName}</p>
                      {r.studentEmail && <p className="text-xs text-muted">{r.studentEmail}</p>}
                    </td>
                    <td className="px-4 py-3 text-muted">{r.registeredMonth ?? "—"}</td>
                    <td className="px-4 py-3 text-ink">{r.universityName ?? "—"}</td>
                    <td className="px-4 py-3 text-ink">{r.programName ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{r.intake ?? "—"}</td>
                    <td className="px-4 py-3 text-ink">{r.staffName}</td>
                    <td className="px-4 py-3">
                      {r.registrationStatus ? (
                        <Badge tone={feeStatusTone(r.registrationStatus)}>{r.registrationStatus}</Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">
                      {r.currency} {r.amount}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={r.status === "paid" ? "success" : "warning"}>{r.status}</Badge>
                      {r.payment_method && <p className="mt-0.5 text-xs text-muted">{r.payment_method}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <ProofFileCell viewUrl={proofUrls[r.id]} uploadAction={uploadStaffCommissionProof.bind(null, r.id, REVALIDATE_TO)} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-2">
                        {r.status !== "paid" && <MarkPaidButton id={r.id} />}
                        <div className="flex items-center gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => setEditingId(r.id)}>
                            ✏️ Edit
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (confirm(`Delete this commission record for ${r.studentName}?`)) deleteStaffCommission(r.id, REVALIDATE_TO);
                            }}
                          >
                            🗑️
                          </Button>
                        </div>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-muted">
                  No commission records match this search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <div className="mt-3 flex items-center justify-between text-xs text-muted">
          <span>
            {rangeStart}-{rangeEnd} of {filtered.length}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage((p) => p - 1)}>
              ← Prev
            </Button>
            <span>
              Page {currentPage} of {pageCount}
            </span>
            <Button variant="outline" size="sm" disabled={currentPage >= pageCount} onClick={() => setPage((p) => p + 1)}>
              Next →
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
