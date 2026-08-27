"use client";

import { useActionState, useState, useTransition } from "react";
import { uploadDocument, reviewDocument, addDocumentRequirement, deleteDocumentRequirement } from "@/lib/actions/documents";
import { Badge } from "@/components/ui/Badge";
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
          {doc.deadline && <span className="text-xs text-muted">Due {new Date(doc.deadline).toLocaleDateString()}</span>}
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
          <button type="submit" disabled={pending} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-bg disabled:opacity-50">
            Upload
          </button>
          {isVerified && (
            <button
              type="button"
              onClick={() => setShowReplace(false)}
              className="text-xs text-muted hover:underline"
            >
              Cancel
            </button>
          )}
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowReplace(true)}
          className="rounded-md border border-border px-2 py-1 text-xs text-muted hover:bg-bg"
        >
          Replace document
        </button>
      )}

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => review("verified")}
          disabled={!doc.file_path || reviewPending}
          className="rounded-md border border-success px-2 py-1 text-xs text-success disabled:opacity-40"
        >
          Accept
        </button>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="reason"
          className="w-24 rounded-md border border-border px-2 py-1 text-xs"
        />
        <button
          type="button"
          onClick={() => review("rejected")}
          disabled={!doc.file_path || reviewPending}
          className="rounded-md border border-danger px-2 py-1 text-xs text-danger disabled:opacity-40"
        >
          Reject
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={reviewPending}
          className="rounded-md border border-border px-2 py-1 text-xs text-muted hover:bg-bg disabled:opacity-40"
          title="Remove this document from the checklist"
        >
          🗑️
        </button>
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
      <input name="name" placeholder="Document name" required className="rounded-md border border-border px-2 py-1.5 text-sm" />
      <select name="category" className="rounded-md border border-border px-2 py-1.5 text-sm">
        {[
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
        ].map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <input name="deadline" type="date" className="rounded-md border border-border px-2 py-1.5 text-sm" />
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-ink disabled:opacity-50">
        Add requirement
      </button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}

export function DocumentChecklist({
  docs,
  studentId,
  applicationId = null,
  revalidateTo,
}: {
  docs: DocRow[];
  studentId: string;
  applicationId?: string | null;
  revalidateTo: string;
}) {
  return (
    <div>
      {docs.length === 0 ? (
        <p className="text-sm text-muted">No documents required yet.</p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {docs.map((doc) => (
            <UploadRow key={doc.id} doc={doc} studentId={studentId} revalidateTo={revalidateTo} />
          ))}
        </div>
      )}
      <AddRequirementForm studentId={studentId} applicationId={applicationId} revalidateTo={revalidateTo} />
    </div>
  );
}
