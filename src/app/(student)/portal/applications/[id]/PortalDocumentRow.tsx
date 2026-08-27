"use client";

import { useActionState } from "react";
import { studentUploadDocument } from "@/lib/actions/portal-documents";
import { Badge } from "@/components/ui/Badge";
import { DOCUMENT_STATUS_TONE } from "@/lib/constants";
import { ACCEPTED_DOCUMENT_ACCEPT } from "@/lib/documentUpload";

export function PortalDocumentRow({
  doc,
  studentId,
  revalidateTo,
}: {
  doc: {
    id: string;
    category: string | null;
    custom_name: string | null;
    status: string;
    rejected_reason: string | null;
    fileUrl?: string | null;
    deadline: string | null;
  };
  studentId: string;
  revalidateTo: string;
}) {
  const action = studentUploadDocument.bind(null, doc.id, studentId, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm text-ink">{doc.custom_name ?? doc.category ?? "Document"}</p>
        <div className="mt-1 flex items-center gap-2">
          <Badge tone={DOCUMENT_STATUS_TONE[doc.status] ?? "neutral"}>{doc.status.replace("_", " ")}</Badge>
          {doc.deadline && <span className="text-xs text-muted">Due {new Date(doc.deadline).toLocaleDateString()}</span>}
          {doc.fileUrl && (
            <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
              View file
            </a>
          )}
        </div>
        {doc.status === "rejected" && doc.rejected_reason && <p className="mt-1 text-xs text-danger">Reason: {doc.rejected_reason}</p>}
      </div>
      {doc.status !== "verified" && (
        <form action={formAction} className="flex items-center gap-2">
          <input type="file" name="file" accept={ACCEPTED_DOCUMENT_ACCEPT} capture="environment" className="text-xs" />
          <button type="submit" disabled={pending} className="rounded-md border border-primary px-2 py-1 text-xs font-medium text-primary disabled:opacity-50">
            Upload
          </button>
        </form>
      )}
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </div>
  );
}
