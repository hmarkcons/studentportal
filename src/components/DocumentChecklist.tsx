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

// Section order/labels for the grouped checklist view. "interview" has no
// document rows of its own (it's a separate scheduling feature rendered via
// the `interviewSection` prop) but still occupies its place in the order.
const CATEGORY_ORDER = [
  "admission",
  "interview",
  "attestation",
  "visa",
  "scholarship_documents",
  "italian_translations",
  "visa_sticker",
  "travel",
  "enrollment",
  "scholarship",
  "other",
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  admission: "Admission Documents",
  attestation: "Attestation",
  visa: "Visa Application Requirements",
  scholarship_documents: "Scholarship Documents",
  italian_translations: "Italian Translations",
  visa_sticker: "Visa Sticker",
  travel: "Travel",
  enrollment: "Enrollment",
  scholarship: "Scholarship",
  other: "Other",
};

function UploadRow({ doc, studentId, revalidateTo }: { doc: DocRow; studentId: string; revalidateTo: string }) {
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
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-[180px] flex-1">
        <p className="text-sm text-ink">{doc.name ?? doc.category ?? "Document"}</p>
        <div className="mt-1 flex items-center gap-2">
          <Badge tone={DOCUMENT_STATUS_TONE[doc.status] ?? "neutral"}>{doc.status.replace("_", " ")}</Badge>
          {doc.deadline && <span className="text-xs text-muted">Due {formatDateOnly(doc.deadline)}</span>}
          {doc.fileUrl && (
            <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
              View file
            </a>
          )}
        </div>
        {doc.status === "rejected" && doc.rejected_reason && (
          <p className="mt-1 text-xs text-danger">Reason: {doc.rejected_reason}</p>
        )}
      </div>

      {showUploadForm ? (
        <form action={formAction} className="flex items-center gap-2">
          <input type="file" name="file" accept={ACCEPTED_DOCUMENT_ACCEPT} className="text-xs" />
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

      <div className="flex items-center gap-1">
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

  return (
    <div>
      {docs.length === 0 && !interviewSection ? (
        <EmptyState>{emptyMessage}</EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          {CATEGORY_ORDER.map((cat) => {
            if (cat === "interview") {
              return interviewSection ? (
                <div key="interview">
                  <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Interview</h4>
                  {interviewSection}
                </div>
              ) : null;
            }
            const catDocs = cat === "other" ? [...(grouped.get("other") ?? []), ...uncategorized] : (grouped.get(cat) ?? []);
            if (catDocs.length === 0) return null;
            return (
              <div key={cat}>
                <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{CATEGORY_LABELS[cat] ?? cat}</h4>
                <div className="flex flex-col divide-y divide-border">
                  {catDocs.map((doc) => (
                    <UploadRow key={doc.id} doc={doc} studentId={studentId} revalidateTo={revalidateTo} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <AddRequirementForm studentId={studentId} applicationId={applicationId} revalidateTo={revalidateTo} />
    </div>
  );
}
