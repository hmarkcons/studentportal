"use client";

import { useActionState, useState } from "react";
import { Pencil, Square, SquareCheckBig, Trash2 } from "lucide-react";
import {
  addStudentScholarship,
  updateStudentScholarship,
  deleteStudentScholarship,
} from "@/lib/actions/scholarships";
import { Button } from "@/components/ui/Button";
import { useButtonAction } from "@/components/useButtonAction";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { ActionStatus } from "@/components/ActionStatus";
import { setScholarshipDocumentsStatus, setScholarshipStatus } from "@/lib/actions/scholarshipStatus";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateOnly } from "@/lib/formatDate";
import {
  SCHOLARSHIP_STATUSES,
  SCHOLARSHIP_STATUS_LABELS,
  SCHOLARSHIP_STATUS_TONE,
  SCHOLARSHIP_CURRENCY_SYMBOL,
  SCHOLARSHIP_DOCUMENT_STATUSES,
  SCHOLARSHIP_DOCUMENT_STATUS_LABELS,
  SCHOLARSHIP_DOCUMENT_STATUS_TONE,
  isScholarshipDocumentStatus,
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
  /** Where its documents stand (0297); null until chosen. */
  documents_status?: string | null;
};

/**
 * The two things staff change most on a scholarship, as dropdowns that save
 * as they change: the application's status, and where its documents stand.
 * Each confirms beside itself, and a refusal says so and leaves the choice
 * where it was.
 */
function QuickStatus({ s, studentId }: { s: StudentScholarship; studentId: string }) {
  const status = useButtonAction();
  const documents = useButtonAction();
  const [statusValue, setStatusValue] = useState(s.status);
  const [documentsValue, setDocumentsValue] = useState(s.documents_status ?? "");
  return (
    <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2" data-scholarship-quick={s.id}>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Application status
        <span className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Application status"
            value={statusValue}
            disabled={status.pending}
            onChange={async (e) => {
              const next = e.target.value;
              const before = statusValue;
              setStatusValue(next);
              const result = await status.run(() => setScholarshipStatus(s.id, studentId, next));
              if (result && "error" in result && result.error) setStatusValue(before);
            }}
            className="w-44"
            data-scholarship-status
          >
            <StatusOptions />
          </Select>
          <ActionStatus state={status.state} pending={status.pending} label="Saved." showError />
        </span>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Documents
        <span className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Documents status"
            value={documentsValue}
            disabled={documents.pending}
            onChange={async (e) => {
              const next = e.target.value;
              const before = documentsValue;
              setDocumentsValue(next);
              const result = await documents.run(() => setScholarshipDocumentsStatus(s.id, studentId, next || null));
              if (result && "error" in result && result.error) setDocumentsValue(before);
            }}
            className="w-56"
            data-scholarship-documents
          >
            <option value="">Not chosen yet</option>
            {SCHOLARSHIP_DOCUMENT_STATUSES.map((d) => (
              <option key={d} value={d}>
                {SCHOLARSHIP_DOCUMENT_STATUS_LABELS[d]}
              </option>
            ))}
          </Select>
          <ActionStatus state={documents.state} pending={documents.pending} label="Saved." showError />
        </span>
      </label>
    </div>
  );
}

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
  studentId,
  bodies,
  revalidateTo,
  canManage,
  currencySymbol,
}: {
  s: StudentScholarship;
  studentId: string;
  bodies: ScholarshipBody[];
  revalidateTo: string;
  canManage: boolean;
  /** The destination's currency — a UK award must not read as euros. */
  currencySymbol: string;
}) {
  const [editing, setEditing] = useState(false);
  // The row goes when the delete works, so it confirms with a toast; a
  // refusal is said under the row that is still there.
  const del = useButtonAction();
  const action = updateStudentScholarship.bind(null, s.id, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);

  const body = bodies.find((b) => b.id === s.scholarship_body_id) ?? null;

  async function handleDelete() {
    const label = s.name ?? body?.name ?? "this scholarship";
    if (!confirm(`Delete the record for ${label}?`)) return;
    await del.run(() => deleteStudentScholarship(s.id, revalidateTo), { toast: "Deleted." });
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
          Award ({currencySymbol})
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
        <Button type="submit" variant="primary" size="sm" pending={pending} status={{ state, label: "Saved." }}>
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
              s.award_amount != null ? `${currencySymbol}${s.award_amount.toLocaleString("en-US")}` : null,
              // Spelled-out month, for the reason the portal's visa page gives:
              // 11/30/2026 reads as 11 December to most of the world outside
              // the US, and a scholarship deadline missed by a month is the
              // whole award.
              s.application_deadline
                ? `due ${formatDateOnly(s.application_deadline, { day: "numeric", month: "short", year: "numeric" })}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ") || "No body, amount or deadline recorded"}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          {/* Read-only for anyone who cannot change them; the dropdowns below are the controls. */}
          {!canManage && (
            <>
              <Badge tone={SCHOLARSHIP_STATUS_TONE[s.status as ScholarshipStatus] ?? "neutral"}>
                {scholarshipStatusLabel(s.status)}
              </Badge>
              {isScholarshipDocumentStatus(s.documents_status) && (
                <Badge tone={SCHOLARSHIP_DOCUMENT_STATUS_TONE[s.documents_status]}>
                  Documents: {SCHOLARSHIP_DOCUMENT_STATUS_LABELS[s.documents_status]}
                </Badge>
              )}
            </>
          )}
          {canManage && (
            <>
              <button
                onClick={() => setEditing(true)}
                className="inline-flex items-center text-xs text-muted hover:text-primary"
                title="Edit"
                aria-label="Edit scholarship"
              >
                <Pencil aria-hidden className="h-3.5 w-3.5 shrink-0" />
              </button>
              <button
                onClick={handleDelete}
                disabled={del.pending}
                aria-busy={del.pending || undefined}
                className="inline-flex items-center text-xs text-muted hover:text-danger disabled:opacity-50"
                title="Delete"
                aria-label="Delete scholarship"
              >
                <Trash2 aria-hidden className="h-3.5 w-3.5 shrink-0" />
              </button>
            </>
          )}
        </span>
      </div>
      {canManage && <QuickStatus s={s} studentId={studentId} />}
      {del.state?.error && <p className="mt-1 text-xs text-danger">{del.state.error}</p>}
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
  currencySymbol = SCHOLARSHIP_CURRENCY_SYMBOL,
}: {
  studentId: string;
  applicationId: string;
  revalidateTo: string;
  bodies: ScholarshipBody[];
  scholarships: StudentScholarship[];
  preenrollmentFinalized: boolean;
  /**
   * The destination's own currency. Awards were labelled € everywhere because
   * every body was Italian; a UK award shown as €5,000 when it is £5,000 is
   * not a cosmetic problem. Defaults to euro so the tracker view, which has no
   * destination in scope, reads as it always did.
   */
  currencySymbol?: string;
  /** scholarships.manage — Super Admin and Processing by default. */
  canManage?: boolean;
}) {
  const action = addStudentScholarship.bind(null, studentId, applicationId, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);
  // Straight from the server now: the finalisation lives on the application
  // and 0173 keeps this equal to it, so there is no local state to hold and
  // nothing here can disagree with Applications.
  const finalized = preenrollmentFinalized;
  const [adding, setAdding] = useState(false);

  return (
    <div>
      {/* Not a control: finalising the university in Applications is what
          sets this, and the database keeps the two equal (0173). It gates what
          the student sees — student_scholarships_select grants them their own
          rows only once their application is finalised — so it is worth
          stating plainly on the page that depends on it. */}
      <div className="mb-3 flex items-start gap-2 text-sm">
        {finalized ? (
          <SquareCheckBig aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        ) : (
          <Square aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
        )}
        <span className={finalized ? "text-ink" : "text-muted"}>
          {finalized ? "University finalised — the student can see this scholarship" : "No university finalised yet"}
          <span className="block text-xs text-muted">
            {finalized
              ? "Set by finalising the university in Applications. Most regional bodies will not process a DSU application before pre-enrolment is done."
              : "Finalise the university in Applications to open this. Until then the student sees nothing on their Scholarship page."}
          </span>
        </span>
      </div>

      <div className="mb-3 flex flex-col gap-2">
        {scholarships.map((s) => (
          <ScholarshipRow
            key={s.id}
            s={s}
            studentId={studentId}
            bodies={bodies}
            revalidateTo={revalidateTo}
            canManage={canManage}
            currencySymbol={currencySymbol}
          />
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
              Award ({currencySymbol})
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
            <Button type="submit" size="sm" pending={pending} status={{ state, label: "Added." }}>
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
