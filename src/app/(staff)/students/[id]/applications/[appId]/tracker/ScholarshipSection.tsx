"use client";

import { useActionState, useState } from "react";
import {
  addStudentScholarship,
  markPreenrollmentFinalized,
  updateStudentScholarship,
  deleteStudentScholarship,
} from "@/lib/actions/scholarships";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateOnly } from "@/lib/formatDate";
import {
  SCHOLARSHIP_STATUSES,
  SCHOLARSHIP_STATUS_LABELS,
  SCHOLARSHIP_STATUS_TONE,
  SCHOLARSHIP_CURRENCY_SYMBOL,
  scholarshipStatusLabel,
  type ScholarshipStatus,
} from "@/lib/scholarships";

export type ScholarshipBody = { id: string; name: string; region: string | null };

export type StudentScholarship = {
  id: string;
  name: string | null;
  status: string;
  award_amount: number | null;
  scholarship_body_id: string | null;
  application_deadline: string | null;
};

function StatusOptions() {
  return (
    <>
      {SCHOLARSHIP_STATUSES.map((s) => (
        <option key={s} value={s}>
          {SCHOLARSHIP_STATUS_LABELS[s]}
        </option>
      ))}
    </>
  );
}

function BodyOptions({ bodies }: { bodies: ScholarshipBody[] }) {
  return (
    <>
      <option value="">Scholarship body…</option>
      {bodies.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
          {b.region ? ` (${b.region})` : ""}
        </option>
      ))}
    </>
  );
}

function ScholarshipRow({
  s,
  bodies,
  revalidateTo,
  canManage,
}: {
  s: StudentScholarship;
  bodies: ScholarshipBody[];
  revalidateTo: string;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const action = updateStudentScholarship.bind(null, s.id, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);

  const body = bodies.find((b) => b.id === s.scholarship_body_id) ?? null;

  async function handleDelete() {
    const label = s.name ?? body?.name ?? "this scholarship";
    if (!confirm(`Delete the record for ${label}?`)) return;
    setDeleteError(null);
    const result = await deleteStudentScholarship(s.id, revalidateTo);
    if (result?.error) setDeleteError(result.error);
  }

  if (editing) {
    return (
      <form action={formAction} className="flex flex-wrap items-end gap-2 rounded-md border border-border p-2">
        {/* The body is editable now. It was offered when adding and then fixed
            for the rest of the record's life, so a scholarship filed against
            the wrong region could never be corrected. */}
        <label className="flex flex-col gap-1 text-xs text-muted">
          Body
          <Select name="scholarship_body_id" defaultValue={s.scholarship_body_id ?? ""}>
            <BodyOptions bodies={bodies} />
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Name
          <Input name="name" defaultValue={s.name ?? ""} placeholder="Scholarship name" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Award ({SCHOLARSHIP_CURRENCY_SYMBOL})
          <Input name="award_amount" type="number" step="0.01" min="0" defaultValue={s.award_amount ?? ""} className="w-28" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Deadline
          <Input name="application_deadline" type="date" defaultValue={s.application_deadline ?? ""} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Status
          <Select name="status" defaultValue={s.status}>
            <StatusOptions />
          </Select>
        </label>
        <Button type="submit" variant="primary" size="sm" pending={pending}>
          Save
        </Button>
        <button type="button" onClick={() => setEditing(false)} className="pb-2 text-xs text-muted hover:underline">
          Cancel
        </button>
        {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
      </form>
    );
  }

  return (
    <div className="rounded-md border border-border p-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="min-w-0">
          {/* The body's name is shown. Picking one from the dropdown used to
              leave the row reading "Scholarship", so the thing staff had just
              selected was invisible from then on. */}
          <p className="text-ink">{s.name ?? body?.name ?? "Scholarship"}</p>
          <p className="text-xs text-muted">
            {[
              s.name && body ? body.name : null,
              body?.region,
              s.award_amount != null ? `${SCHOLARSHIP_CURRENCY_SYMBOL}${s.award_amount.toLocaleString("en-US")}` : null,
              s.application_deadline ? `due ${formatDateOnly(s.application_deadline)}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "No body, amount or deadline recorded"}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          <Badge tone={SCHOLARSHIP_STATUS_TONE[s.status as ScholarshipStatus] ?? "neutral"}>
            {scholarshipStatusLabel(s.status)}
          </Badge>
          {canManage && (
            <>
              <button onClick={() => setEditing(true)} className="text-xs text-muted hover:text-primary" title="Edit">
                ✏️
              </button>
              <button onClick={handleDelete} className="text-xs text-muted hover:text-danger" title="Delete">
                🗑️
              </button>
            </>
          )}
        </span>
      </div>
      {deleteError && <p className="mt-1 text-xs text-danger">{deleteError}</p>}
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
  canManage = false,
}: {
  studentId: string;
  applicationId: string;
  revalidateTo: string;
  bodies: ScholarshipBody[];
  scholarships: StudentScholarship[];
  preenrollmentFinalized: boolean;
  /** scholarships.manage — Super Admin and Processing by default. */
  canManage?: boolean;
}) {
  const action = addStudentScholarship.bind(null, studentId, applicationId, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [finalized, setFinalized] = useState(preenrollmentFinalized);
  const [finalizedError, setFinalizedError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

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
        <label className="flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" checked={finalized} onChange={handleFinalizedChange} disabled={!canManage} className="mt-1" />
          {/* This really does gate what the student sees, at the database:
              student_scholarships_select grants a student their own rows only
              once the application's pre-enrolment is finalised. That policy was
              written for a portal page that had never been built, so the tick
              controlled a view nobody could reach — the page exists now, and
              the wording says plainly what ticking it does. */}
          <span>
            Pre-enrollment finalized on Universitaly.it
            <span className="block text-xs text-muted">
              Until this is ticked the student sees nothing on their Scholarship page. Most regional bodies will not
              process a DSU application before it is done.
            </span>
          </span>
        </label>
        {finalizedError && <p className="mt-1 text-xs text-danger">{finalizedError}</p>}
      </div>

      <div className="mb-3 flex flex-col gap-2">
        {scholarships.map((s) => (
          <ScholarshipRow key={s.id} s={s} bodies={bodies} revalidateTo={revalidateTo} canManage={canManage} />
        ))}
        {scholarships.length === 0 && <EmptyState>No scholarship record yet.</EmptyState>}
      </div>

      {canManage &&
        (adding ? (
          <form action={formAction} className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Body
              <Select name="scholarship_body_id" autoFocus>
                <BodyOptions bodies={bodies} />
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Name (if not a listed body)
              <Input name="name" placeholder="Scholarship name" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Award ({SCHOLARSHIP_CURRENCY_SYMBOL})
              <Input name="award_amount" type="number" step="0.01" min="0" placeholder="0.00" className="w-28" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Deadline
              <Input name="application_deadline" type="date" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Status
              <Select name="status" defaultValue="submitted">
                <StatusOptions />
              </Select>
            </label>
            <Button type="submit" size="sm" pending={pending}>
              Add
            </Button>
            <button type="button" onClick={() => setAdding(false)} className="pb-2 text-xs text-muted hover:underline">
              Cancel
            </button>
            {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="border-t border-border pt-3 text-xs font-medium text-primary hover:underline"
          >
            + Add scholarship
          </button>
        ))}
    </div>
  );
}
