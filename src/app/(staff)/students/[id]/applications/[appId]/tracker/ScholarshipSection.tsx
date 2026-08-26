"use client";

import { useActionState, useState } from "react";
import { addStudentScholarship, markPreenrollmentFinalized, updateStudentScholarship, deleteStudentScholarship } from "@/lib/actions/scholarships";

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
  const action = updateStudentScholarship.bind(null, s.id, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);

  if (editing) {
    return (
      <form action={formAction} className="flex flex-wrap items-end gap-2 rounded-md border border-border p-2">
        <input name="name" defaultValue={s.name ?? ""} placeholder="Name" className="rounded-md border border-border px-2 py-1 text-xs" />
        <input name="award_amount" type="number" step="0.01" defaultValue={s.award_amount ?? ""} className="w-28 rounded-md border border-border px-2 py-1 text-xs" />
        <select name="status" defaultValue={s.status} className="rounded-md border border-border px-2 py-1 text-xs">
          <option value="submitted">Submitted</option>
          <option value="pending">Pending</option>
          <option value="rejected">Rejected</option>
          <option value="accepted">Accepted</option>
          <option value="modification">Modification</option>
        </select>
        <button type="submit" disabled={pending} className="rounded bg-primary px-2 py-1 text-xs text-primary-ink disabled:opacity-50">
          Save
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted hover:underline">
          Cancel
        </button>
        {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-ink">{s.name ?? "Scholarship"}</span>
      <span className="flex items-center gap-2 text-muted">
        {s.status} {s.award_amount != null && `· €${s.award_amount}`}
        {isSuperAdmin && (
          <>
            <button onClick={() => setEditing(true)} className="text-xs text-muted hover:text-primary">
              ✏️
            </button>
            <button onClick={() => deleteStudentScholarship(s.id, revalidateTo)} className="text-xs text-muted hover:text-danger">
              🗑️
            </button>
          </>
        )}
      </span>
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

  return (
    <div>
      <label className="mb-3 flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          defaultChecked={preenrollmentFinalized}
          onChange={(e) => markPreenrollmentFinalized(applicationId, revalidateTo, e.target.checked)}
        />
        Pre-enrollment finalized on Universitaly.it (controls what the student can see for this application&apos;s Scholarship Region)
      </label>

      <div className="mb-3 flex flex-col gap-2">
        {scholarships.map((s) => (
          <ScholarshipRow key={s.id} s={s} revalidateTo={revalidateTo} isSuperAdmin={isSuperAdmin} />
        ))}
        {scholarships.length === 0 && <p className="text-sm text-muted">No scholarship record yet.</p>}
      </div>

      <form action={formAction} className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
        <select name="scholarship_body_id" className="rounded-md border border-border px-2 py-1.5 text-sm">
          <option value="">Scholarship body…</option>
          {bodies.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} {b.region && `(${b.region})`}
            </option>
          ))}
        </select>
        <input name="name" placeholder="Scholarship name" className="rounded-md border border-border px-2 py-1.5 text-sm" />
        <input name="award_amount" type="number" step="0.01" placeholder="Award amount" className="w-32 rounded-md border border-border px-2 py-1.5 text-sm" />
        <select name="status" className="rounded-md border border-border px-2 py-1.5 text-sm">
          <option value="submitted">Submitted</option>
          <option value="pending">Pending</option>
          <option value="rejected">Rejected</option>
          <option value="accepted">Accepted</option>
          <option value="modification">Modification</option>
        </select>
        <button type="submit" disabled={pending} className="rounded-md border border-primary px-2 py-1.5 text-xs font-medium text-primary disabled:opacity-50">
          Add
        </button>
        {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      </form>
    </div>
  );
}
