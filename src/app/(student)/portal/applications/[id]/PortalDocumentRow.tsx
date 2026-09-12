"use client";

import { ConfirmedUploadForm } from "@/components/ConfirmedUploadForm";
import { DocumentHistory, type ArchivedUpload } from "@/components/DocumentHistory";
import { studentUploadDocument } from "@/lib/actions/portal-documents";
import { formatDateOnly } from "@/lib/formatDate";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DOCUMENT_STATUS_TONE, DOCUMENT_STATUS_LABELS } from "@/lib/constants";
import { ACCEPTED_DOCUMENT_ACCEPT } from "@/lib/documentUpload";
import { uploadedLine, reviewedLine, type UploaderRole } from "@/lib/activityStamp";

const LONG_DATE: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };

export function PortalDocumentRow({
  doc,
  studentId,
  revalidateTo,
  number,
}: {
  doc: {
    id: string;
    category: string | null;
    custom_name: string | null;
    status: string;
    rejected_reason: string | null;
    fileUrl?: string | null;
    deadline: string | null;
    uploaded_at?: string | null;
    uploaded_by_role?: UploaderRole | null;
    verified_at?: string | null;
    /** Everything previously sent against this requirement (0165). */
    history?: ArchivedUpload[];
  };
  studentId: string;
  revalidateTo: string;
  /** e.g. "2.3", matching the numbering staff see on the Documents tab. */
  number?: string;
}) {
  const action = studentUploadDocument.bind(null, doc.id, studentId, revalidateTo);

  // A deadline that has gone is the one thing on this row a student must not
  // skim past, so it is coloured rather than left as ordinary grey text.
  const today = new Date().toISOString().slice(0, 10);
  const overdue = doc.status !== "verified" && doc.deadline && doc.deadline < today;

  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm text-ink">
          {number && <span className="mr-1.5 font-mono text-xs text-muted">{number}</span>}
          {doc.custom_name ?? doc.category ?? "Document"}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {/* The stored value is "verified"; everyone reads it as Approved,
              which is the word on the button staff press. This row used to
              print the raw status, so students saw "verified" while staff saw
              "Approved" for the same document. */}
          <Badge tone={DOCUMENT_STATUS_TONE[doc.status] ?? "neutral"}>
            {DOCUMENT_STATUS_LABELS[doc.status] ?? doc.status.replace("_", " ")}
          </Badge>
          {doc.deadline && (
            <span className={`text-xs ${overdue ? "font-medium text-danger" : "text-muted"}`}>
              {overdue ? "Was due" : "Due"} {formatDateOnly(doc.deadline, LONG_DATE)}
            </span>
          )}
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
        {/* When it arrived and when it was looked at. A student could not
            previously tell whether the file they sent had reached anyone, or
            how long it had been sitting unreviewed. Staff names are not shown
            here — the student is dealing with HMARK, not one employee. */}
        <div className="mt-1 flex flex-col gap-0.5 text-xs text-muted">
          {uploadedLine({ at: doc.uploaded_at, byRole: doc.uploaded_by_role, audience: "student" }) && (
            <span>{uploadedLine({ at: doc.uploaded_at, byRole: doc.uploaded_by_role, audience: "student" })}</span>
          )}
          {reviewedLine(doc.verified_at, doc.status, "student") && (
            <span>{reviewedLine(doc.verified_at, doc.status, "student")}</span>
          )}
        </div>

        {doc.status === "rejected" && (
          <p className="mt-1 text-xs text-danger">
            {doc.rejected_reason
              ? `Sent back: ${doc.rejected_reason}`
              : "Sent back — ask your counsellor what needs changing, then upload a replacement."}
          </p>
        )}
      </div>
      {/* What was sent before, and why it came back. Kept rather than
          overwritten, so it is worth showing the student their own attempt. */}
      <DocumentHistory versions={doc.history ?? []} audience="student" />

      {/* Asks before it sends: a document cannot be taken back once it is
          in, and if it is sent back the original stays on the record as the
          rejected version. */}
      {doc.status !== "verified" && (
        <ConfirmedUploadForm
          action={action}
          accept={ACCEPTED_DOCUMENT_ACCEPT}
          capture="environment"
          submitLabel={doc.status === "rejected" ? "Replace" : "Upload"}
          replacing={doc.status === "rejected"}
          className="sm:shrink-0"
        />
      )}
    </div>
  );
}
