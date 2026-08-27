"use client";

import { useActionState, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Input";
import { ProofFileCell } from "@/components/ProofFileCell";
import {
  createStaffCommission,
  deleteStaffCommission,
  markStaffCommissionPaid,
  updateStaffCommission,
  uploadStaffCommissionProof,
} from "@/lib/actions/finance";

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
      <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
        ✏️ Edit
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1">
      <Input name="amount" type="number" step="0.01" defaultValue={record.amount} required className="w-24" />
      <Input name="currency" defaultValue={record.currency} required className="w-16" />
      <Input name="registration_date" type="date" defaultValue={record.registration_date ?? ""} />
      <Select name="status" defaultValue={record.status}>
        <option value="unpaid">unpaid</option>
        <option value="paid">paid</option>
      </Select>
      <Button type="submit" variant="primary" size="sm" pending={pending}>
        Save
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
        Cancel
      </Button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}

function MarkPaidForm({ id, revalidateTo }: { id: string; revalidateTo: string }) {
  const action = markStaffCommissionPaid.bind(null, id, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <Button type="submit" variant="success" size="sm" pending={pending}>
        Mark paid
      </Button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}

function DeleteCommissionButton({ id, revalidateTo }: { id: string; revalidateTo: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        if (confirm("Delete this commission record?")) deleteStaffCommission(id, revalidateTo);
      }}
    >
      🗑️
    </Button>
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
      <Select name="student_id" required>
        <option value="">Student…</option>
        {students.map((s) => (
          <option key={s.id} value={s.id}>
            {s.full_name}
          </option>
        ))}
      </Select>
      <Input name="amount" type="number" step="0.01" placeholder="Amount" required className="w-24" />
      <Select name="currency" defaultValue="PKR">
        <option value="PKR">PKR</option>
        <option value="EUR">EUR</option>
        <option value="USD">USD</option>
      </Select>
      <Input name="registration_date" type="date" defaultValue={defaultDate} />
      <Button type="submit" variant="primary" size="sm" disabled={pending}>
        {pending ? "Adding…" : "+ Add commission record"}
      </Button>
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
        <EmptyState>No commission records for this staff member in the selected month.</EmptyState>
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
