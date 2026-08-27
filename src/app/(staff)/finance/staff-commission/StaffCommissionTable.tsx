"use client";

import { useActionState, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { ProofFileCell } from "@/components/ProofFileCell";
import {
  createStaffCommission,
  updateStaffCommission,
  deleteStaffCommission,
  markStaffCommissionPaid,
  uploadStaffCommissionProof,
} from "@/lib/actions/finance";
import { INVOICE_STATUS_LABELS, type InvoiceStatus } from "@/lib/invoiceStatus";

const inputClass = "rounded-md border border-border bg-card px-2 py-1 text-xs";
const REVALIDATE_TO = "/finance/staff-commission";

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
  consultancyFeeStatus: InvoiceStatus | null;
  adminFeeStatus: "paid" | "unpaid" | null;
};

function AddCommissionForm({ staffList, students }: { staffList: { id: string; full_name: string }[]; students: { id: string; full_name: string }[] }) {
  const action = createStaffCommission.bind(null, REVALIDATE_TO);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-3">
      <select name="staff_id" required className={inputClass}>
        <option value="">Staff…</option>
        {staffList.map((s) => (
          <option key={s.id} value={s.id}>
            {s.full_name}
          </option>
        ))}
      </select>
      <select name="student_id" required className={inputClass}>
        <option value="">Student…</option>
        {students.map((s) => (
          <option key={s.id} value={s.id}>
            {s.full_name}
          </option>
        ))}
      </select>
      <input name="amount" type="number" step="0.01" placeholder="Commission amount" required className={`${inputClass} w-32`} />
      <select name="currency" defaultValue="PKR" className={inputClass}>
        <option value="PKR">PKR</option>
        <option value="EUR">EUR</option>
        <option value="USD">USD</option>
      </select>
      <input name="registration_date" type="date" className={inputClass} />
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-ink disabled:opacity-50">
        {pending ? "Adding…" : "+ Add commission"}
      </button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}

function EditRow({ row, onDone }: { row: CommissionRow; onDone: () => void }) {
  const action = updateStaffCommission.bind(null, row.id, REVALIDATE_TO);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1 rounded-md border border-border p-2">
      <input name="amount" type="number" step="0.01" defaultValue={row.amount} required className={`${inputClass} w-24`} />
      <input name="currency" defaultValue={row.currency} required className={`${inputClass} w-16`} />
      <input name="registration_date" type="date" defaultValue={row.registration_date ?? ""} className={inputClass} />
      <select name="status" defaultValue={row.status} className={inputClass}>
        <option value="unpaid">unpaid</option>
        <option value="paid">paid</option>
      </select>
      <select name="payment_method" defaultValue={row.payment_method ?? ""} className={inputClass}>
        <option value="">Method…</option>
        <option value="Cash">Cash</option>
        <option value="Bank transfer">Bank transfer</option>
        <option value="Card">Card</option>
        <option value="Other">Other</option>
      </select>
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-ink disabled:opacity-50">
        {pending ? "…" : "Save"}
      </button>
      <button type="button" onClick={onDone} className="text-xs text-muted hover:underline">
        Cancel
      </button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}

function MarkPaidButton({ id }: { id: string }) {
  const action = markStaffCommissionPaid.bind(null, id, REVALIDATE_TO);
  const [, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex items-center gap-1">
      <button type="submit" className="rounded-md border border-success px-2 py-0.5 text-xs text-success">
        Mark paid
      </button>
    </form>
  );
}

function feeStatusTone(status: string | null) {
  if (status === "paid") return "success" as const;
  if (status === "overdue") return "danger" as const;
  if (status === "pending" || status === "unpaid") return "warning" as const;
  return "neutral" as const;
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
  const [nameInput, setNameInput] = useState("");
  const [statusInput, setStatusInput] = useState("all");
  const [appliedName, setAppliedName] = useState("");
  const [appliedStatus, setAppliedStatus] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);

  function search() {
    setAppliedName(nameInput.trim().toLowerCase());
    setAppliedStatus(statusInput);
  }
  function clear() {
    setNameInput("");
    setStatusInput("all");
    setAppliedName("");
    setAppliedStatus("all");
  }

  const filtered = rows.filter((r) => {
    if (appliedName && !r.studentName.toLowerCase().includes(appliedName) && !r.staffName.toLowerCase().includes(appliedName)) return false;
    if (appliedStatus !== "all" && r.status !== appliedStatus) return false;
    return true;
  });

  return (
    <div>
      <AddCommissionForm staffList={staffList} students={students} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Search student or staff name…"
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm"
        />
        <select value={statusInput} onChange={(e) => setStatusInput(e.target.value)} className="rounded-md border border-border bg-card px-2 py-1.5 text-sm">
          <option value="all">All statuses</option>
          <option value="unpaid">Unpaid</option>
          <option value="paid">Paid</option>
        </select>
        <button onClick={search} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink">
          Search
        </button>
        <button onClick={clear} className="rounded-md border border-border px-3 py-1.5 text-sm text-muted hover:text-ink">
          Clear
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-b border-border bg-bg text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Assigned Staff</th>
              <th className="px-4 py-3">Registered</th>
              <th className="px-4 py-3">Consultancy Fee</th>
              <th className="px-4 py-3">Admin Fee</th>
              <th className="px-4 py-3 text-right">Commission</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Proof</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0 align-top">
                {editingId === r.id ? (
                  <td colSpan={9} className="px-4 py-3">
                    <EditRow row={r} onDone={() => setEditingId(null)} />
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-3 text-ink">{r.studentName}</td>
                    <td className="px-4 py-3 text-ink">{r.staffName}</td>
                    <td className="px-4 py-3 text-muted">{r.registration_date ? new Date(r.registration_date).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-3">
                      {r.consultancyFeeStatus ? (
                        <Badge tone={feeStatusTone(r.consultancyFeeStatus)}>{INVOICE_STATUS_LABELS[r.consultancyFeeStatus]}</Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">{r.adminFeeStatus ? <Badge tone={feeStatusTone(r.adminFeeStatus)}>{r.adminFeeStatus}</Badge> : "—"}</td>
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
                          <button type="button" onClick={() => setEditingId(r.id)} className="rounded-md border border-border px-2 py-0.5 text-xs hover:bg-bg">
                            ✏️ Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Delete this commission record for ${r.studentName}?`)) deleteStaffCommission(r.id, REVALIDATE_TO);
                            }}
                            className="rounded-md border border-border px-2 py-0.5 text-xs text-muted hover:text-danger"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-muted">
                  No commission records match this search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
