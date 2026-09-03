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
import { suggestCommission, type CommissionStaffOption } from "@/app/(staff)/finance/staff-commission/StaffCommissionTable";

export type CommissionRecord = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  registration_date: string | null;
  payment_proof_path: string | null;
  student_name: string;
  shared_with_name: string | null;
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
      <Input name="registration_date" type="date" defaultValue={record.registration_date ?? ""} required />
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
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this commission record?")) return;
    setPending(true);
    setError(null);
    const result = await deleteStaffCommission(id, revalidateTo);
    if (result?.error) setError(result.error);
    setPending(false);
  }

  return (
    <div>
      <Button variant="outline" size="sm" onClick={handleDelete} pending={pending}>
        🗑️
      </Button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

export type StudentCommissionBasis = { track: string | null; consultancyFee: number | null; currency: string | null };

function AddCommissionForm({
  currentStaff,
  shareableStaff,
  students,
  defaultDate,
  revalidateTo,
  studentCommissionBasis,
}: {
  currentStaff: CommissionStaffOption;
  shareableStaff: CommissionStaffOption[];
  students: { id: string; full_name: string }[];
  defaultDate: string;
  revalidateTo: string;
  studentCommissionBasis: Record<string, StudentCommissionBasis>;
}) {
  const action = createStaffCommission.bind(null, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [studentId, setStudentId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("PKR");
  const [amountEdited, setAmountEdited] = useState(false);
  const [suggestionKey, setSuggestionKey] = useState<string | null>(null);
  const [isShared, setIsShared] = useState(false);
  const [sharedWithStaffId, setSharedWithStaffId] = useState("");

  const basis = studentCommissionBasis[studentId] ?? null;
  const suggestion = suggestCommission(currentStaff, basis);

  // Adjusting state during render (React's documented pattern for this)
  // rather than in an effect, so a new student pick takes effect in the same
  // render. Never re-applied without a new pick, so a real correction the
  // user typed is never silently overwritten.
  if (studentId !== suggestionKey) {
    setSuggestionKey(studentId);
    setAmountEdited(false);
    setAmount(suggestion.amount != null ? String(suggestion.amount) : "");
    setCurrency(suggestion.currency ?? "PKR");
  }

  const amountNum = Number(amount) || 0;

  return (
    <form action={formAction} className="mb-3 flex flex-col gap-2">
      <input type="hidden" name="staff_id" value={currentStaff.id} />
      <div className="flex flex-wrap items-end gap-2">
        <Select name="student_id" required value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          <option value="">Student…</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </Select>
        <Input
          name="amount"
          type="number"
          step="0.01"
          placeholder="Amount"
          required
          className="w-24"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setAmountEdited(true);
          }}
        />
        <Select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
          <option value="PKR">PKR</option>
          <option value="EUR">EUR</option>
          <option value="USD">USD</option>
        </Select>
        <Input name="registration_date" type="date" defaultValue={defaultDate} required />
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? "Adding…" : "+ Add commission record"}
        </Button>
      </div>
      {suggestion.amount != null && !amountEdited && (
        <p className="w-full text-xs text-muted">
          Suggested: {suggestion.type === "flat" ? `flat ${suggestion.currency} ${suggestion.rate}` : `${suggestion.rate}% of ${basis?.currency} ${basis?.consultancyFee?.toFixed(2)}`}{" "}
          ({basis?.track} track{suggestion.type !== "flat" ? ", discount already applied" : ""}) — adjust if needed.
        </p>
      )}
      {studentId && suggestion.amount == null && (
        <p className="w-full text-xs text-muted">No suggestion available — this student has no signed agreement on file yet.</p>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={isShared}
            onChange={(e) => {
              setIsShared(e.target.checked);
              if (!e.target.checked) setSharedWithStaffId("");
            }}
          />
          Shared commission — this student was registered through the equal effort of another staff member
        </label>
        {isShared && (
          <Select value={sharedWithStaffId} onChange={(e) => setSharedWithStaffId(e.target.value)}>
            <option value="">Share with…</option>
            {shareableStaff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </Select>
        )}
        <input type="hidden" name="shared_with_staff_id" value={isShared ? sharedWithStaffId : ""} />
      </div>
      {isShared && sharedWithStaffId && (
        <p className="text-xs text-muted">
          {currentStaff.full_name}&apos;s commission rate is used to work out the total, then split 50/50 between them and{" "}
          {shareableStaff.find((s) => s.id === sharedWithStaffId)?.full_name} — each will show roughly {currency} {(amountNum / 2).toFixed(2)} in
          their own ledger.
        </p>
      )}
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}

export function CommissionLedgerTable({
  currentStaff,
  shareableStaff,
  records,
  students,
  proofUrls,
  defaultDate,
  revalidateTo,
  canManage,
  studentCommissionBasis,
}: {
  currentStaff: CommissionStaffOption;
  shareableStaff: CommissionStaffOption[];
  records: CommissionRecord[];
  students: { id: string; full_name: string }[];
  proofUrls: Record<string, string>;
  defaultDate: string;
  revalidateTo: string;
  canManage: boolean;
  studentCommissionBasis: Record<string, StudentCommissionBasis>;
}) {
  return (
    <div>
      {canManage && (
        <AddCommissionForm
          currentStaff={currentStaff}
          shareableStaff={shareableStaff}
          students={students}
          defaultDate={defaultDate}
          revalidateTo={revalidateTo}
          studentCommissionBasis={studentCommissionBasis}
        />
      )}
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
                  {r.shared_with_name && ` (shared w/ ${r.shared_with_name})`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={r.status === "paid" ? "success" : "warning"}>{r.status}</Badge>
                {canManage ? (
                  <>
                    <ProofFileCell viewUrl={proofUrls[r.id]} uploadAction={uploadStaffCommissionProof.bind(null, r.id, revalidateTo)} />
                    {r.status !== "paid" && <MarkPaidForm id={r.id} revalidateTo={revalidateTo} />}
                    <EditCommissionForm record={r} revalidateTo={revalidateTo} />
                    <DeleteCommissionButton id={r.id} revalidateTo={revalidateTo} />
                  </>
                ) : (
                  proofUrls[r.id] && (
                    <a href={proofUrls[r.id]} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                      View proof
                    </a>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
