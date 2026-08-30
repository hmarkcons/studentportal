"use client";

import { useActionState, useState } from "react";
import { addStudentScholarship, markPreenrollmentFinalized, updateStudentScholarship, deleteStudentScholarship } from "@/lib/actions/scholarships";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";

function ScholarshipRow({
  s,
  revalidateTo,
  isSuperAdmin,
}: {
  s: { id: string; name: string | null; status: string; award_amount: number | null };
  revalidateTo: string;
  isSuperAdmin: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const action = updateStudentScholarship.bind(null, s.id, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);

  async function handleDelete() {
    setDeleteError(null);
    const result = await deleteStudentScholarship(s.id, revalidateTo);
    if (result?.error) setDeleteError(result.error);
  }

  if (editing) {
    return (
      <form action={formAction} className="flex flex-wrap items-end gap-2 rounded-md border border-border p-2">
        <Input name="name" defaultValue={s.name ?? ""} placeholder="Name" />
        <Input name="award_amount" type="number" step="0.01" defaultValue={s.award_amount ?? ""} className="w-28" />
        <Select name="status" defaultValue={s.status}>
          <option value="submitted">Submitted</option>
          <option value="pending">Pending</option>
          <option value="rejected">Rejected</option>
          <option value="accepted">Accepted</option>
          <option value="modification">Modification</option>
        </Select>
        <Button type="submit" variant="primary" size="sm" pending={pending}>
          Save
        </Button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted hover:underline">
          Cancel
        </button>
        {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
      </form>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink">{s.name ?? "Scholarship"}</span>
        <span className="flex items-center gap-2 text-muted">
          {s.status} {s.award_amount != null && `· €${s.award_amount}`}
          {isSuperAdmin && (
            <>
              <button onClick={() => setEditing(true)} className="text-xs text-muted hover:text-primary">
                ✏️
              </button>
              <button onClick={handleDelete} className="text-xs text-muted hover:text-danger">
                🗑️
              </button>
            </>
          )}
        </span>
      </div>
      {deleteError && <p className="text-xs text-danger">{deleteError}</p>}
    </div>
  );
}

export function ScholarshipSection({
  studentId,
  applicationId,
  revalidateTo,
  bodies,
  scholarships,
  preenrollmentFinalized,
  isSuperAdmin = false,
}: {
  studentId: string;
  applicationId: string;
  revalidateTo: string;
  bodies: { id: string; name: string; region: string | null }[];
  scholarships: { id: string; name: string | null; status: string; award_amount: number | null }[];
  preenrollmentFinalized: boolean;
  isSuperAdmin?: boolean;
}) {
  const action = addStudentScholarship.bind(null, studentId, applicationId, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [finalized, setFinalized] = useState(preenrollmentFinalized);
  const [finalizedError, setFinalizedError] = useState<string | null>(null);

  async function handleFinalizedChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.checked;
    setFinalized(next);
    setFinalizedError(null);
    const result = await markPreenrollmentFinalized(applicationId, revalidateTo, next);
    if (result?.error) {
      setFinalized(!next);
      setFinalizedError(result.error);
    }
  }

  return (
    <div>
      <div className="mb-3">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={finalized} onChange={handleFinalizedChange} />
          Pre-enrollment finalized on Universitaly.it (controls what the student can see for this application&apos;s Scholarship Region)
        </label>
        {finalizedError && <p className="mt-1 text-xs text-danger">{finalizedError}</p>}
      </div>

      <div className="mb-3 flex flex-col gap-2">
        {scholarships.map((s) => (
          <ScholarshipRow key={s.id} s={s} revalidateTo={revalidateTo} isSuperAdmin={isSuperAdmin} />
        ))}
        {scholarships.length === 0 && <EmptyState>No scholarship record yet.</EmptyState>}
      </div>

      <form action={formAction} className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
        <Select name="scholarship_body_id">
          <option value="">Scholarship body…</option>
          {bodies.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} {b.region && `(${b.region})`}
            </option>
          ))}
        </Select>
        <Input name="name" placeholder="Scholarship name" />
        <Input name="award_amount" type="number" step="0.01" placeholder="Award amount" className="w-32" />
        <Select name="status">
          <option value="submitted">Submitted</option>
          <option value="pending">Pending</option>
          <option value="rejected">Rejected</option>
          <option value="accepted">Accepted</option>
          <option value="modification">Modification</option>
        </Select>
        <Button type="submit" size="sm" pending={pending}>
          Add
        </Button>
        {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      </form>
    </div>
  );
}
