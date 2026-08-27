"use client";

import { useActionState, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { ProofFileCell } from "@/components/ProofFileCell";
import {
  createStaffCommission,
  deleteStaffCommission,
  markStaffCommissionPaid,
  updateStaffCommission,
  uploadStaffCommissionProof,
} from "@/lib/actions/finance";

const inputClass = "rounded-md border border-border bg-card px-2 py-1 text-xs";

export type CommissionRecord = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  registration_date: string | null;
  payment_proof_path: string | null;
  student_name: string;
};

function EditCommissionForm({ record, revalidateTo }: { record: CommissionRecord; revalidateTo: string }) {
  const [editing, setEditing] = useState(false);
  const action = updateStaffCommission.bind(null, record.id, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="rounded-md border border-border px-2 py-0.5 text-xs text-muted hover:text-ink">
        ✏️ Edit
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1">
      <input name="amount" type="number" step="0.01" defaultValue={record.amount} required className={`${inputClass} w-24`} />
      <input name="currency" defaultValue={record.currency} required className={`${inputClass} w-16`} />
      <input name="registration_date" type="date" defaultValue={record.registration_date ?? ""} className={inputClass} />
      <select name="status" defaultValue={record.status} className={inputClass}>
        <option value="unpaid">unpaid</option>
        <option value="paid">paid</option>
      </select>
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-ink disabled:opacity-50">
        {pending ? "…" : "Save"}
      </button>
      <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted hover:underline">
        Cancel
      </button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}

function MarkPaidForm({ id, revalidateTo }: { id: string; revalidateTo: string }) {
  const action = markStaffCommissionPaid.bind(null, id, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <button type="submit" disabled={pending} className="rounded-md border border-success px-2 py-1 text-xs text-success disabled:opacity-50">
        {pending ? "…" : "Mark paid"}
      </button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}

function DeleteCommissionButton({ id, revalidateTo }: { id: string; revalidateTo: string }) {
  return (
    <button
      onClick={() => {
        if (confirm("Delete this commission record?")) deleteStaffCommission(id, revalidateTo);
      }}
      className="rounded-md border border-border px-2 py-0.5 text-xs text-muted hover:text-danger"
    >
      🗑️
    </button>
  );
}

function AddCommissionForm({
  staffId,
  students,
  defaultDate,
  revalidateTo,
}: {
  staffId: string;
  students: { id: string; full_name: string }[];
  defaultDate: string;
  revalidateTo: string;
}) {
  const action = createStaffCommission.bind(null, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="mb-3 flex flex-wrap items-end gap-2">
      <input type="hidden" name="staff_id" value={staffId} />
      <select name="student_id" required className={inputClass}>
        <option value="">Student…</option>
        {students.map((s) => (
          <option key={s.id} value={s.id}>
            {s.full_name}
          </option>
        ))}
      </select>
      <input name="amount" type="number" step="0.01" placeholder="Amount" required className={`${inputClass} w-24`} />
      <select name="currency" defaultValue="PKR" className={inputClass}>
        <option value="PKR">PKR</option>
        <option value="EUR">EUR</option>
        <option value="USD">USD</option>
      </select>
      <input name="registration_date" type="date" defaultValue={defaultDate} className={inputClass} />
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-ink disabled:opacity-50">
        {pending ? "Adding…" : "+ Add commission record"}
      </button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}

export function CommissionLedgerTable({
  staffId,
  records,
  students,
  proofUrls,
  defaultDate,
  revalidateTo,
}: {
  staffId: string;
  records: CommissionRecord[];
  students: { id: string; full_name: string }[];
  proofUrls: Record<string, string>;
  defaultDate: string;
  revalidateTo: string;
}) {
  return (
    <div>
      <AddCommissionForm staffId={staffId} students={students} defaultDate={defaultDate} revalidateTo={revalidateTo} />
      {records.length === 0 ? (
        <p className="text-sm text-muted">No commission records for this staff member in the selected month.</p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {records.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div>
                <span className="text-ink">{r.student_name}</span>{" "}
                <span className="text-muted">
                  · {r.currency} {r.amount}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={r.status === "paid" ? "success" : "warning"}>{r.status}</Badge>
                <ProofFileCell viewUrl={proofUrls[r.id]} uploadAction={uploadStaffCommissionProof.bind(null, r.id, revalidateTo)} />
                {r.status !== "paid" && <MarkPaidForm id={r.id} revalidateTo={revalidateTo} />}
                <EditCommissionForm record={r} revalidateTo={revalidateTo} />
                <DeleteCommissionButton id={r.id} revalidateTo={revalidateTo} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
