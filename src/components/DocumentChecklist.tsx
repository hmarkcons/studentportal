"use client";

import { useActionState, useState, useTransition } from "react";
import { uploadDocument, reviewDocument, addDocumentRequirement, deleteDocumentRequirement } from "@/lib/actions/documents";
import { formatDateOnly } from "@/lib/formatDate";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { DOCUMENT_STATUS_TONE } from "@/lib/constants";
import { ACCEPTED_DOCUMENT_ACCEPT } from "@/lib/documentUpload";
import { CATEGORY_ORDER, CATEGORY_LABELS } from "@/lib/documentCategories";

export type DocRow = {
  id: string;
  category: string | null;
  status: string;
  file_path: string | null;
  deadline: string | null;
  rejected_reason: string | null;
  fileUrl?: string | null;
  name?: string | null;
};

const REQUIREMENT_CATEGORIES = [
  "admission",
  "interview",
  "attestation",
  "visa",
  "scholarship",
  "scholarship_documents",
  "italian_translations",
  "visa_sticker",
  "travel",
  "enrollment",
  "other",
];

function UploadRow({
  doc,
  studentId,
  revalidateTo,
  number,
}: {
  doc: DocRow;
  studentId: string;
  revalidateTo: string;
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
          <Badge tone={DOCUMENT_STATUS_TONE[doc.status] ?? "neutral"}>{doc.status.replace("_", " ")}</Badge>
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
        <Button type="button" variant="outline" size="sm" onClick={remove} disabled={reviewPending} title="Remove this document from the checklist">
          🗑️
        </Button>
      </div>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      {reviewError && <p className="text-xs text-danger">{reviewError}</p>}
    </div>
  );
}

function AddRequirementForm({
  studentId,
  applicationId,
  revalidateTo,
}: {
  studentId: string;
  applicationId: string | null;
  revalidateTo: string;
}) {
  const action = addDocumentRequirement.bind(null, studentId, applicationId, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
      <Input name="name" placeholder="Document name" required className="w-auto" />
      <Select name="category" className="w-auto">
        {REQUIREMENT_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Select>
      <Input name="deadline" type="date" className="w-auto" />
      <Button type="submit" variant="primary" size="sm" pending={pending}>
        Add requirement
      </Button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}

export function DocumentChecklist({
  docs,
  studentId,
  applicationId = null,
  revalidateTo,
  emptyMessage = "No documents required yet.",
  interviewSection = null,
}: {
  docs: DocRow[];
  studentId: string;
  applicationId?: string | null;
  revalidateTo: string;
  emptyMessage?: string;
  interviewSection?: React.ReactNode;
}) {
  const grouped = new Map<string, DocRow[]>();
  for (const doc of docs) {
    const cat = doc.category ?? "other";
    (grouped.get(cat) ?? grouped.set(cat, []).get(cat)!).push(doc);
  }
  const uncategorized = docs.filter((d) => !d.category || !(CATEGORY_ORDER as readonly string[]).includes(d.category));

  // Build the sections that will actually render, in CATEGORY_ORDER, so the
  // numbering below can run 1..n over them without gaps.
  const visibleSections = CATEGORY_ORDER.flatMap((cat) => {
    if (cat === "interview") {
      return interviewSection ? [{ key: "interview", label: "Interview", docs: [] as DocRow[] }] : [];
    }
    const catDocs = cat === "other" ? [...(grouped.get("other") ?? []), ...uncategorized] : (grouped.get(cat) ?? []);
    if (catDocs.length === 0) return [];
    return [{ key: cat as string, label: CATEGORY_LABELS[cat] ?? cat, docs: catDocs }];
  });

  return (
    <div>
      {docs.length === 0 && !interviewSection ? (
        <EmptyState>{emptyMessage}</EmptyState>
      ) : (
        // Sections are numbered by the order they actually appear, not by
        // their position in CATEGORY_ORDER — a student with no attestation
        // documents should read 1, 2, 3 rather than 1, 3, 4.
        <div className="flex flex-col gap-5">
          {visibleSections.map((section, i) => {
            const n = i + 1;
            return (
              <section key={section.key} className="overflow-hidden rounded-lg border border-border">
                <header className="flex items-baseline gap-2 border-b border-border bg-bg px-4 py-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-ink">
                    {n}
                  </span>
                  <h3 className="text-base font-semibold text-ink">{section.label}</h3>
                  {section.docs.length > 0 && (
                    <span className="ml-auto shrink-0 text-xs text-muted">
                      {section.docs.filter((d) => d.status === "verified").length}/{section.docs.length} verified
                    </span>
                  )}
                </header>
                <div className="px-4">
                  {section.key === "interview" ? (
                    <div className="py-3">{interviewSection}</div>
                  ) : (
                    <div className="flex flex-col divide-y divide-border">
                      {section.docs.map((doc, j) => (
                        <UploadRow
                          key={doc.id}
                          doc={doc}
                          studentId={studentId}
                          revalidateTo={revalidateTo}
                          number={`${n}.${j + 1}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
      <AddRequirementForm studentId={studentId} applicationId={applicationId} revalidateTo={revalidateTo} />
    </div>
  );
}
