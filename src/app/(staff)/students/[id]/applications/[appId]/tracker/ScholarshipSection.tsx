"use client";

import { useActionState } from "react";
import { addStudentScholarship, markPreenrollmentFinalized } from "@/lib/actions/scholarships";

export function ScholarshipSection({
  studentId,
  applicationId,
  revalidateTo,
  bodies,
  scholarships,
  preenrollmentFinalized,
}: {
  studentId: string;
  applicationId: string;
  revalidateTo: string;
  bodies: { id: string; name: string; region: string | null }[];
  scholarships: { id: string; name: string | null; status: string; award_amount: number | null }[];
  preenrollmentFinalized: boolean;
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
          <div key={s.id} className="flex items-center justify-between text-sm">
            <span className="text-ink">{s.name ?? "Scholarship"}</span>
            <span className="text-muted">
              {s.status} {s.award_amount != null && `· €${s.award_amount}`}
            </span>
          </div>
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
          <option value="applied">Applied</option>
          <option value="awarded">Awarded</option>
          <option value="rejected">Rejected</option>
        </select>
        <button type="submit" disabled={pending} className="rounded-md border border-primary px-2 py-1.5 text-xs font-medium text-primary disabled:opacity-50">
          Add
        </button>
        {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      </form>
    </div>
  );
}
