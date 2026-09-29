"use client";

import { useActionState, useRef, useState } from "react";
import { Award, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { addStudentScholarship, updateStudentScholarship, deleteStudentScholarship } from "@/lib/actions/scholarships";
import { setScholarshipDocumentsStatus, setScholarshipStatus, type ScholarshipRef } from "@/lib/actions/scholarshipStatus";
import { uploadScholarshipProof, deleteScholarshipProof, type ScholarshipProof } from "@/lib/actions/scholarshipProofs";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { ActionStatus } from "@/components/ActionStatus";
import { useButtonAction } from "@/components/useButtonAction";
import { formatDateOnly } from "@/lib/formatDate";
import { formatFileSize } from "@/lib/fileSize";
import { toast } from "@/lib/toast";
import {
  SCHOLARSHIP_STATUSES,
  SCHOLARSHIP_STATUS_LABELS,
  SCHOLARSHIP_STATUS_TONE,
  SCHOLARSHIP_DOCUMENT_STATUSES,
  SCHOLARSHIP_DOCUMENT_STATUS_LABELS,
  SCHOLARSHIP_DOCUMENT_STATUS_TONE,
  isScholarshipDocumentStatus,
  scholarshipStatusLabel,
  type ScholarshipStatus,
} from "@/lib/scholarships";
import { ScholarshipProofUploader } from "./ScholarshipProofUploader";

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
 * One scholarship the student is applying for, or is about to: a recorded one,
 * or the finalised university's own body before anybody has touched it.
 *
 * The tab's whole job, in one place and in the order it happens: where the
 * application stands, where its documents stand, and the proof that it went
 * in. The dropdowns save as they change and the files attach as they are
 * chosen — nothing to press afterwards. A body nobody has recorded yet is
 * offered exactly the same way, and the first change records it
 * (resolveScholarship); until then nothing is written and the student sees
 * nothing.
 */
function ScholarshipPanel({
  studentId,
  applicationId,
  record,
  body,
  choices,
  proofs,
  bodies,
  canManage,
  currencySymbol,
  revalidateTo,
}: {
  studentId: string;
  applicationId: string;
  record: StudentScholarship | null;
  /** The record's body, or the body a draft stands for; null when one has to be chosen. */
  body: ScholarshipBody | null;
  /** What a draft with no body of its own may be recorded against. */
  choices: ScholarshipBody[];
  proofs: ScholarshipProof[];
  /** Every body the details editor may move the record to. */
  bodies: ScholarshipBody[];
  canManage: boolean;
  currencySymbol: string;
  revalidateTo: string;
}) {
  const [status, setStatus] = useState(record?.status ?? "");
  const [documents, setDocuments] = useState(record?.documents_status ?? "");
  const [chosenBody, setChosenBody] = useState(body?.id ?? "");
  const [editing, setEditing] = useState(false);
  const statusSave = useButtonAction();
  const documentsSave = useButtonAction();
  const del = useButtonAction();

  // A new server answer — the record just made, or changed elsewhere — wins
  // over what the dropdowns last held. Adjusted during render, React's pattern
  // for state that follows a prop.
  const [seen, setSeen] = useState(record);
  if (record !== seen) {
    setSeen(record);
    setStatus(record?.status ?? "");
    setDocuments(record?.documents_status ?? "");
  }

  // Every write goes through one queue with the reference it should use. The
  // first write on a draft records the scholarship; the ones queued behind it
  // must use that record, not make a second (0299 refuses one anyway).
  const made = useRef<string | null>(null);
  const recordId = record?.id ?? null;
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  function write<R extends { error?: string | null; scholarshipId?: string | null } | undefined>(
    call: (ref: ScholarshipRef) => Promise<R>
  ): Promise<R | { error: string }> {
    const next = queue.current.then(async () => {
      const id = recordId ?? made.current;
      const bodyId = body?.id ?? chosenBody;
      const ref: ScholarshipRef | null = id ? { id } : bodyId ? { applicationId, bodyId } : null;
      if (!ref) return { error: "Choose which scholarship body this is with first." };
      const result = await call(ref);
      if (result && result.scholarshipId) made.current = result.scholarshipId;
      return result;
    });
    queue.current = next.catch(() => {});
    return next;
  }

  const recorded = Boolean(record);
  const bodyName = body?.name ?? bodies.find((b) => b.id === chosenBody)?.name ?? null;
  const title = record?.name ?? bodyName ?? "Scholarship";
  const facts = [
    record?.name && bodyName && record.name !== bodyName ? bodyName : null,
    body?.region,
    record?.award_amount != null ? `${currencySymbol}${record.award_amount.toLocaleString("en-US")}` : null,
    record?.application_deadline
      ? `due ${formatDateOnly(record.application_deadline, { day: "numeric", month: "short", year: "numeric" })}`
      : null,
  ].filter(Boolean);

  async function handleDelete() {
    if (!record) return;
    if (!confirm(`Delete the record for ${title}? Its proof files go with it.`)) return;
    await del.run(() => deleteStudentScholarship(record.id, revalidateTo), { toast: "Deleted." });
  }

  async function removeProof(proof: ScholarshipProof) {
    if (!confirm(`Remove "${proof.fileName}"? This deletes the file, and it is the evidence the application was submitted.`)) return;
    const result = await deleteScholarshipProof(proof.id, studentId);
    if (result?.error) toast(result.error, "danger");
    else toast("Removed.");
  }

  if (!canManage && !record) return null;

  return (
    <section
      className="overflow-hidden rounded-lg border border-border bg-card"
      data-scholarship-panel={record?.id ?? "draft"}
      data-scholarship-body={body?.id ?? chosenBody}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-bg px-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden className="bg-hero flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white">
            <Award className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">
              Scholarship application <span className="font-normal text-muted">·</span> {title}
            </p>
            <p className="text-xs text-muted">
              {recorded
                ? facts.join(" · ") || "No amount or deadline recorded"
                : "Not started — choose a status or upload the proof and it is recorded. The student sees it from then on."}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {recorded && (
            <>
              <Badge tone={SCHOLARSHIP_STATUS_TONE[status as ScholarshipStatus] ?? "neutral"}>{scholarshipStatusLabel(status)}</Badge>
              {isScholarshipDocumentStatus(documents) && (
                <Badge tone={SCHOLARSHIP_DOCUMENT_STATUS_TONE[documents]}>Documents: {SCHOLARSHIP_DOCUMENT_STATUS_LABELS[documents]}</Badge>
              )}
            </>
          )}
          {recorded && canManage && (
            <>
              <button
                type="button"
                onClick={() => setEditing((e) => !e)}
                aria-expanded={editing}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted hover:bg-card hover:text-primary"
              >
                <Pencil aria-hidden className="h-3.5 w-3.5 shrink-0" />
                Details
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={del.pending}
                className="inline-flex items-center rounded-md p-1 text-muted hover:bg-card hover:text-danger disabled:opacity-50"
                title="Delete this scholarship record"
                aria-label="Delete scholarship"
              >
                <Trash2 aria-hidden className="h-3.5 w-3.5 shrink-0" />
              </button>
            </>
          )}
        </div>
      </header>

      {editing && record && (
        <DetailsForm record={record} bodies={bodies} currencySymbol={currencySymbol} revalidateTo={revalidateTo} onDone={() => setEditing(false)} />
      )}

      {canManage && (
        <div className="grid gap-4 px-4 py-4 sm:grid-cols-2 xl:grid-cols-3">
          {!body && !recorded && (
            <label className="flex flex-col gap-1 text-xs font-medium text-ink">
              Scholarship body
              <Select value={chosenBody} onChange={(e) => setChosenBody(e.target.value)} data-scholarship-choose-body>
                <option value="">Choose the body…</option>
                {choices.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {b.region ? ` (${b.region})` : ""}
                  </option>
                ))}
              </Select>
            </label>
          )}
          <label className="flex flex-col gap-1 text-xs font-medium text-ink">
            Application status
            <span className="flex flex-wrap items-center gap-2">
              <Select
                aria-label="Application status"
                value={status}
                disabled={statusSave.pending || (!recorded && !body && !chosenBody)}
                onChange={async (e) => {
                  const next = e.target.value;
                  const before = status;
                  setStatus(next);
                  const result = await statusSave.run(() => write((ref) => setScholarshipStatus(ref, studentId, next)));
                  if (result && "error" in result && result.error) setStatus(before);
                }}
                className="min-w-44 flex-1"
                data-scholarship-status
              >
                {!recorded && (
                  <option value="" disabled>
                    Choose…
                  </option>
                )}
                {SCHOLARSHIP_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {SCHOLARSHIP_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
              <ActionStatus state={statusSave.state} pending={statusSave.pending} label="Saved." showError />
            </span>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-ink">
            Documents status
            <span className="flex flex-wrap items-center gap-2">
              <Select
                aria-label="Documents status"
                value={documents}
                disabled={documentsSave.pending || (!recorded && !body && !chosenBody)}
                onChange={async (e) => {
                  const next = e.target.value;
                  const before = documents;
                  setDocuments(next);
                  const result = await documentsSave.run(() => write((ref) => setScholarshipDocumentsStatus(ref, studentId, next || null)));
                  if (result && "error" in result && result.error) setDocuments(before);
                }}
                className="min-w-56 flex-1"
                data-scholarship-documents
              >
                <option value="">Not chosen yet</option>
                {SCHOLARSHIP_DOCUMENT_STATUSES.map((d) => (
                  <option key={d} value={d}>
                    {SCHOLARSHIP_DOCUMENT_STATUS_LABELS[d]}
                  </option>
                ))}
              </Select>
              <ActionStatus state={documentsSave.state} pending={documentsSave.pending} label="Saved." showError />
            </span>
          </label>
        </div>
      )}

      <div className={`px-4 pb-4 ${canManage ? "" : "pt-4"}`} data-scholarship-proofs>
        <p className="mb-2 text-xs font-medium text-ink">
          Proof of submission
          <span className="ml-1.5 font-normal text-muted">
            {proofs.length > 0
              ? `${proofs.length} file${proofs.length === 1 ? "" : "s"}`
              : "— the submission receipt, the protocol number, the ISEE acknowledgement"}
          </span>
        </p>
        {proofs.length > 0 && (
          <ul className="mb-2 flex flex-col divide-y divide-border rounded-md border border-border" data-proof-list>
            {proofs.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-xs">
                  {p.url ? (
                    <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                      <FileText aria-hidden className="h-3.5 w-3.5 shrink-0" />
                      {p.fileName}
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-medium text-ink">
                      <FileText aria-hidden className="h-3.5 w-3.5 shrink-0" />
                      {p.fileName}
                    </span>
                  )}
                  <span className="text-muted">
                    {p.fileSize != null && `${formatFileSize(p.fileSize)} · `}
                    {formatDateOnly(p.uploadedAt.slice(0, 10), { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </span>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => void removeProof(p)}
                    className="shrink-0 rounded border border-border px-1.5 text-xs text-danger hover:bg-danger-bg"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canManage && (
          <ScholarshipProofUploader
            disabled={!recorded && !body && !chosenBody}
            send={(form) => write((ref) => uploadScholarshipProof(ref, studentId, form))}
          />
        )}
      </div>
      {del.state?.error && <p className="px-4 pb-3 text-xs text-danger">{del.state.error}</p>}
    </section>
  );
}

/** Name, award, deadline and body — the parts that change once, not every week. */
function DetailsForm({
  record,
  bodies,
  currencySymbol,
  revalidateTo,
  onDone,
}: {
  record: StudentScholarship;
  bodies: ScholarshipBody[];
  currencySymbol: string;
  revalidateTo: string;
  onDone: () => void;
}) {
  const action = updateStudentScholarship.bind(null, record.id, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.success) onDone();
  }
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2 border-b border-border px-4 py-3">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Body
        <Select name="scholarship_body_id" defaultValue={record.scholarship_body_id ?? ""}>
          <option value="">No body</option>
          {bodies.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
              {b.region ? ` (${b.region})` : ""}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Name
        <Input name="name" defaultValue={record.name ?? ""} placeholder="Scholarship name" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Award ({currencySymbol})
        <Input name="award_amount" type="number" step="0.01" min="0" defaultValue={record.award_amount ?? ""} className="w-28" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Deadline
        <Input name="application_deadline" type="date" defaultValue={record.application_deadline ?? ""} />
      </label>
      {/* The status is the dropdown below; sent as it stands so this form cannot change it. */}
      <input type="hidden" name="status" value={record.status} />
      <Button type="submit" variant="primary" size="sm" pending={pending} status={{ state, label: "Saved." }}>
        Save details
      </Button>
      <button type="button" onClick={onDone} className="pb-2 text-xs text-muted hover:underline">
        Cancel
      </button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}

/** A scholarship that is not a listed body's, or a second body — the exception, kept out of the way. */
function AddAnother({
  studentId,
  applicationId,
  bodies,
  currencySymbol,
  revalidateTo,
}: {
  studentId: string;
  applicationId: string;
  bodies: ScholarshipBody[];
  currencySymbol: string;
  revalidateTo: string;
}) {
  const action = addStudentScholarship.bind(null, studentId, applicationId, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.success) setOpen(false);
  }
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex w-fit items-center gap-1 text-xs font-medium text-primary hover:underline"
        data-scholarship-add-another
      >
        <Plus aria-hidden className="h-3.5 w-3.5 shrink-0" />
        Add another scholarship
      </button>
    );
  }
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-3">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Body
        <Select name="scholarship_body_id" autoFocus>
          <option value="">Not a listed body</option>
          {bodies.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
              {b.region ? ` (${b.region})` : ""}
            </option>
          ))}
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
      <input type="hidden" name="status" value="pending" />
      <Button type="submit" size="sm" pending={pending} status={{ state, label: "Added." }}>
        Add
      </Button>
      <button type="button" onClick={() => setOpen(false)} className="pb-2 text-xs text-muted hover:underline">
        Cancel
      </button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}

/**
 * Every scholarship of one finalised application, each as a panel: the ones
 * on record, then the university's own body if nobody has recorded it yet
 * (`drafts`), or — when no body in the directory lists the university — one
 * panel that asks which of the country's bodies it is (`chooseFrom`).
 */
export function ScholarshipApplications({
  studentId,
  applicationId,
  records,
  drafts,
  chooseFrom,
  bodies,
  proofsByScholarship,
  canManage,
  currencySymbol,
  revalidateTo,
}: {
  studentId: string;
  applicationId: string;
  records: StudentScholarship[];
  drafts: ScholarshipBody[];
  chooseFrom: ScholarshipBody[] | null;
  bodies: ScholarshipBody[];
  proofsByScholarship: Record<string, ScholarshipProof[]>;
  canManage: boolean;
  currencySymbol: string;
  revalidateTo: string;
}) {
  const bodyById = new Map(bodies.map((b) => [b.id, b]));
  // Keyed by application and body, so a draft and the record its first change
  // makes are the same panel: the dropdown just chosen does not flicker back.
  const panels = [
    ...records.map((r) => ({ key: r.scholarship_body_id ?? r.id, record: r, body: r.scholarship_body_id ? (bodyById.get(r.scholarship_body_id) ?? null) : null })),
    ...drafts.map((b) => ({ key: b.id, record: null, body: b })),
  ];
  const showChooser = canManage && chooseFrom !== null && chooseFrom.length > 0 && panels.length === 0;

  if (panels.length === 0 && !showChooser && !canManage) return null;

  return (
    <div className="mb-4 flex flex-col gap-3" data-scholarship-applications>
      {panels.map((p) => (
        <ScholarshipPanel
          key={p.key}
          studentId={studentId}
          applicationId={applicationId}
          record={p.record}
          body={p.body}
          choices={[]}
          proofs={p.record ? (proofsByScholarship[p.record.id] ?? []) : []}
          bodies={bodies}
          canManage={canManage}
          currencySymbol={currencySymbol}
          revalidateTo={revalidateTo}
        />
      ))}
      {showChooser && (
        <ScholarshipPanel
          key="choose"
          studentId={studentId}
          applicationId={applicationId}
          record={null}
          body={null}
          choices={chooseFrom}
          proofs={[]}
          bodies={bodies}
          canManage={canManage}
          currencySymbol={currencySymbol}
          revalidateTo={revalidateTo}
        />
      )}
      {canManage && (
        <AddAnother studentId={studentId} applicationId={applicationId} bodies={bodies} currencySymbol={currencySymbol} revalidateTo={revalidateTo} />
      )}
    </div>
  );
}
