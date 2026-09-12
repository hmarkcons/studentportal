"use client";

import { useActionState, useState, useTransition } from "react";
import { uploadDocument, reviewDocument, addDocumentRequirement, deleteDocumentRequirement } from "@/lib/actions/documents";
import { formatDateOnly } from "@/lib/formatDate";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { DOCUMENT_STATUS_TONE, DOCUMENT_STATUS_LABELS } from "@/lib/constants";
import { ACCEPTED_DOCUMENT_ACCEPT } from "@/lib/documentUpload";
import { CATEGORY_ORDER, CATEGORY_LABELS } from "@/lib/documentCategories";
import { uploadedLine, reviewedLine, addedLine, type UploaderRole } from "@/lib/activityStamp";
import { DocumentHistory, type ArchivedUpload } from "@/components/DocumentHistory";
import { DocumentSectionShell, ExpandAllToggle } from "@/components/DocumentSectionShell";

export type DocRow = {
  id: string;
  /** Everything previously sent against this requirement (0165). */
  history?: ArchivedUpload[];
  category: string | null;
  status: string;
  file_path: string | null;
  deadline: string | null;
  rejected_reason: string | null;
  fileUrl?: string | null;
  name?: string | null;
  /** When the file arrived, and from which side. Recorded all along; never shown. */
  uploaded_at?: string | null;
  uploaded_by_role?: UploaderRole | null;
  /** When it was reviewed — set whichever way the review went. */
  verified_at?: string | null;
  /** When the requirement itself was added to the checklist. */
  created_at?: string | null;
  /** Null for a requirement somebody added by hand rather than a template. */
  template_id?: string | null;
};

function UploadRow({
  doc,
  studentId,
  revalidateTo,
  number,
  canManage,
}: {
  doc: DocRow;
  studentId: string;
  revalidateTo: string;
  /** Whether this viewer may delete the requirement (and its file). */
  canManage: boolean;
  /** Position within the whole checklist, e.g. "2.3" for the third document
   *  of the second section. */
  number?: string;
}) {
  const action = uploadDocument.bind(null, doc.id, studentId, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [reason, setReason] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [reviewPending, startReview] = useTransition();
  const [reviewError, setReviewError] = useState<string | null>(null);

  const isVerified = doc.status === "verified";
  const showUploadForm = !isVerified || showReplace;

  function review(status: "verified" | "rejected") {
    setReviewError(null);
    startReview(async () => {
      const result = await reviewDocument(doc.id, revalidateTo, status, status === "rejected" ? reason : undefined);
      if (result?.error) setReviewError(result.error);
      else if (status === "rejected") setReason("");
    });
  }

  function remove() {
    if (!confirm(`Remove "${doc.name ?? doc.category ?? "this document"}" from the checklist?`)) return;
    startReview(async () => {
      const result = await deleteDocumentRequirement(doc.id, revalidateTo);
      if (result?.error) setReviewError(result.error);
    });
  }

  return (
    // Horizontal only from lg. The name block, the upload form and the
    // Accept/reason/Reject/delete cluster need ~600px between them, and at
    // 768px the sidebar leaves the content column narrower than it is at
    // 767px — so switching at sm overflowed exactly where room is tightest.
    <div className="flex flex-col gap-2 py-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-[180px] flex-1">
        <p className="text-sm text-ink">
          {number && <span className="mr-1.5 font-mono text-xs text-muted">{number}</span>}
          {doc.name ?? doc.category ?? "Document"}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <Badge tone={DOCUMENT_STATUS_TONE[doc.status] ?? "neutral"}>{DOCUMENT_STATUS_LABELS[doc.status] ?? doc.status.replace("_", " ")}</Badge>
          {doc.deadline && <span className="text-xs text-muted">Due {formatDateOnly(doc.deadline)}</span>}
          {doc.fileUrl && (
            <a
              href={doc.fileUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-primary px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
            >
              👁️ View file
            </a>
          )}
        </div>
        {doc.status === "rejected" && doc.rejected_reason && (
          <p className="mt-1 text-xs text-danger">Reason: {doc.rejected_reason}</p>
        )}

        {/* All three were recorded from the start and none was ever shown, so
            nobody could tell whether a document had arrived an hour ago or last
            month. Only lines with something behind them render: an unfilled
            requirement says nothing rather than "Uploaded by nobody". */}
        <div className="mt-1 flex flex-col gap-0.5 text-xs text-muted">
          {uploadedLine({ at: doc.uploaded_at, byRole: doc.uploaded_by_role, audience: "staff" }) && (
            <span>{uploadedLine({ at: doc.uploaded_at, byRole: doc.uploaded_by_role, audience: "staff" })}</span>
          )}
          {reviewedLine(doc.verified_at, doc.status, "staff") && (
            <span>{reviewedLine(doc.verified_at, doc.status, "staff")}</span>
          )}
          {/* Only for a requirement somebody added by hand — for the seeded
              ones "Added" is just when the checklist was provisioned, which
              tells nobody anything. */}
          {!doc.template_id && !doc.uploaded_at && addedLine(doc.created_at, "Requirement added") && (
            <span>{addedLine(doc.created_at, "Requirement added")}</span>
          )}
        </div>
        {/* What was sent before this, and why it came back. A replacement used
            to overwrite what it replaced, so the thing staff rejected — the
            evidence of why — was gone. */}
        <DocumentHistory versions={doc.history ?? []} audience="staff" />
      </div>

      {showUploadForm ? (
        <form action={formAction} className="flex flex-wrap items-center gap-2">
          <input type="file" name="file" accept={ACCEPTED_DOCUMENT_ACCEPT} className="max-w-full text-xs" />
          <Button type="submit" pending={pending} size="sm">
            Upload
          </Button>
          {isVerified && (
            <button type="button" onClick={() => setShowReplace(false)} className="text-xs text-muted hover:underline">
              Cancel
            </button>
          )}
        </form>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setShowReplace(true)}>
          Replace document
        </Button>
      )}

      <div className="flex flex-wrap items-center gap-1">
        <Button type="button" variant="success" size="sm" onClick={() => review("verified")} disabled={!doc.file_path || reviewPending}>
          Accept
        </Button>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="reason" className="w-24" />
        <Button type="button" variant="danger" size="sm" onClick={() => review("rejected")} disabled={!doc.file_path || reviewPending}>
          Reject
        </Button>
        {canManage && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={remove}
            disabled={reviewPending}
            title="Remove this requirement from the checklist"
          >
            🗑️
          </Button>
        )}
      </div>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      {reviewError && <p className="text-xs text-danger">{reviewError}</p>}
    </div>
  );
}

// One per section, with the section fixed rather than chosen from a dropdown.
// It used to be a single form at the foot of the page whose category had to be
// picked from a list of raw keys, which meant scrolling away from the section
// you were looking at and then naming it again from memory.
function AddRequirementForm({
  studentId,
  applicationId,
  revalidateTo,
  category,
  categoryLabel,
}: {
  studentId: string;
  applicationId: string | null;
  revalidateTo: string;
  category: string;
  categoryLabel: string;
}) {
  const action = addDocumentRequirement.bind(null, studentId, applicationId, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="my-3 text-xs font-medium text-primary hover:underline"
      >
        + Add requirement
      </button>
    );
  }

  return (
    <form action={formAction} className="my-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
      <input type="hidden" name="category" value={category} />
      <label className="flex flex-col gap-1 text-xs text-muted">
        Requirement for {categoryLabel}
        <Input name="name" placeholder="e.g. Police clearance certificate" required autoFocus className="w-64" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Due (optional)
        <Input name="deadline" type="date" className="w-auto" />
      </label>
      <Button type="submit" variant="primary" size="sm" pending={pending}>
        Add
      </Button>
      <button type="button" onClick={() => setOpen(false)} className="pb-2 text-xs text-muted hover:underline">
        Cancel
      </button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}

export function DocumentChecklist({
  docs,
  studentId,
  applicationId = null,
  revalidateTo,
  emptyMessage = "No documents required yet.",
  canManage = false,
  sections,
  emptySections = "all",
}: {
  docs: DocRow[];
  studentId: string;
  applicationId?: string | null;
  revalidateTo: string;
  emptyMessage?: string;
  /** Super Admin / Processing: may add and delete requirements. */
  canManage?: boolean;
  /**
   * Which sections to show even when they hold nothing, so there is somewhere
   * to add a requirement. "all" suits a student's Documents tab, where the
   * whole checklist is the subject. An application's page passes just the one
   * or two sections its extras belong in — every empty section rendered there
   * would be nine headings and nothing under them.
   */
  emptySections?: "all" | string[];
  /**
   * The sections this student's destinations ask for, in the order the
   * builder put them. Falls back to the built-in order when not supplied, so
   * the student portal and any caller that has not been updated still render.
   */
  sections?: { key: string; label: string }[];
}) {
  // Collapsed is the default state, so this map holds only the sections
  // somebody has opened during this visit.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const grouped = new Map<string, DocRow[]>();
  for (const doc of docs) {
    const cat = doc.category ?? "other";
    (grouped.get(cat) ?? grouped.set(cat, []).get(cat)!).push(doc);
  }
  // Section order and labels come from the builder when the caller supplies
  // them, so a section created in Setup shows up here under its own name
  // instead of falling through to the hardcoded list.
  const order: { key: string; label: string }[] =
    sections && sections.length > 0
      ? sections
      : CATEGORY_ORDER.map((c) => ({ key: c as string, label: CATEGORY_LABELS[c] ?? c }));

  const known = new Set(order.map((o) => o.key));
  const uncategorized = docs.filter((d) => !d.category || !known.has(d.category));

  // Only the sections that will actually render, so the numbering runs 1..n
  // without gaps.
  const visibleSections = order.flatMap((entry) => {
    const catDocs =
      entry.key === "other" ? [...(grouped.get("other") ?? []), ...uncategorized] : (grouped.get(entry.key) ?? []);
    // An empty section is still shown to whoever can add to it — that is where
    // the "Add requirement" button lives, and a section with nothing in it is
    // exactly the one that needs something adding.
    const showWhenEmpty = canManage && (emptySections === "all" || emptySections.includes(entry.key));
    if (catDocs.length === 0 && !showWhenEmpty) return [];
    return [{ key: entry.key, label: entry.label, docs: catDocs }];
  });

  // A requirement filed under a section this student's destinations do not
  // carry would otherwise be invisible. "other" already absorbs those, but if
  // "other" itself is not in the order, add it rather than lose the rows.
  if (uncategorized.length > 0 && !visibleSections.some((v) => v.key === "other")) {
    visibleSections.push({ key: "other", label: CATEGORY_LABELS.other ?? "Other", docs: uncategorized });
  }

  // Derived from what is open rather than tracked separately, so the button
  // cannot say "Collapse all" while a section is already shut.
  const allExpanded = visibleSections.length > 0 && visibleSections.every((s) => openSections[s.key]);

  return (
    <div>
      {/* Gated on what will render, not on whether any document exists.
          Checking docs.length short-circuited the emptySections mechanism
          entirely: an application with nothing on it yet — every new one —
          showed "No documents required yet" and no section, so the
          "+ Add requirement" button that only lives inside a section could
          never be reached, and a university's own document ask could not be
          added until some other document happened to exist first. */}
      {visibleSections.length === 0 ? (
        <EmptyState>{emptyMessage}</EmptyState>
      ) : (
        <>
          <ExpandAllToggle
            allExpanded={allExpanded}
            onToggle={() =>
              setOpenSections(allExpanded ? {} : Object.fromEntries(visibleSections.map((s) => [s.key, true])))
            }
          />

          {/* Sections are numbered by the order they actually appear, not by
              their position in CATEGORY_ORDER — a student with no attestation
              documents should read 1, 2, 3 rather than 1, 3, 4. */}
          <div className="flex flex-col gap-3">
            {visibleSections.map((section, i) => {
              const n = i + 1;
              return (
                <DocumentSectionShell
                  key={section.key}
                  number={n}
                  label={section.label}
                  total={section.docs.length}
                  approved={section.docs.filter((d) => d.status === "verified").length}
                  outstanding={section.docs.filter((d) => d.status === "missing").length}
                  rejected={section.docs.filter((d) => d.status === "rejected").length}
                  open={openSections[section.key] ?? false}
                  onToggle={() => setOpenSections((prev) => ({ ...prev, [section.key]: !prev[section.key] }))}
                >
                  <div className="flex flex-col divide-y divide-border">
                    {section.docs.map((doc, j) => (
                      <UploadRow
                        key={doc.id}
                        doc={doc}
                        studentId={studentId}
                        revalidateTo={revalidateTo}
                        number={`${n}.${j + 1}`}
                        canManage={canManage}
                      />
                    ))}
                    {section.docs.length === 0 && (
                      <p className="py-3 text-xs text-muted">Nothing required here yet.</p>
                    )}
                  </div>
                  {canManage && (
                    <AddRequirementForm
                      studentId={studentId}
                      applicationId={applicationId}
                      revalidateTo={revalidateTo}
                      category={section.key}
                      categoryLabel={section.label}
                    />
                  )}
                </DocumentSectionShell>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
