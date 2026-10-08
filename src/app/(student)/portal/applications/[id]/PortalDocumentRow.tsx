"use client";

import { useEffect, useRef, useState } from "react";
import { ConfirmedUploadForm } from "@/components/ConfirmedUploadForm";
import { DocumentGuidePanel, DocumentGuideToggle, guideHasMore } from "@/components/DocumentGuide";
import type { ResolvedGuide } from "@/lib/documentGuides";
import { CircleCheck, FileText, Hourglass, ScanSearch, Undo2, Upload, X, type LucideIcon } from "lucide-react";
import { DocumentHistory, type ArchivedUpload } from "@/components/DocumentHistory";
import { studentRemoveDocumentFile, studentUploadDocument } from "@/lib/actions/portal-documents";
import { useButtonAction } from "@/components/useButtonAction";
import type { DocFile } from "@/lib/documentFileNames";
import { formatDateOnly } from "@/lib/formatDate";
import { Badge } from "@/components/ui/Badge";
import { DOCUMENT_STATUS_TONE, DOCUMENT_STATUS_LABELS } from "@/lib/constants";
import { ACCEPTED_DOCUMENT_ACCEPT } from "@/lib/documentUpload";
import { uploadedLine, reviewedLine, type UploaderRole } from "@/lib/activityStamp";

const LONG_DATE: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };

// A glance down the list says which rows are done and which need the student.
const STATUS_ICON: Record<string, { icon: LucideIcon; tile: string }> = {
  verified: { icon: CircleCheck, tile: "bg-success-bg text-success" },
  submitted: { icon: Hourglass, tile: "bg-warning-bg text-warning" },
  under_review: { icon: ScanSearch, tile: "bg-info-bg text-info" },
  rejected: { icon: Undo2, tile: "bg-danger-bg text-danger" },
  missing: { icon: Upload, tile: "bg-primary/10 text-primary" },
};

/**
 * One of the student's files for a requirement: its name as they sent it (and
 * the files it was joined from), whether it is approved, and — sent back —
 * why. Theirs to remove until it is approved (0328).
 */
function StudentFileRow({ file, revalidateTo, readOnly }: { file: DocFile; revalidateTo: string; readOnly: boolean }) {
  const remove = useButtonAction();
  const removable = !readOnly && Boolean(file.id) && file.uploadedByRole === "student" && file.status !== "verified";
  const removeError = remove.state && typeof remove.state === "object" && "error" in remove.state ? ((remove.state as { error?: string }).error ?? null) : null;
  return (
    <li className="flex flex-col gap-0.5 rounded-lg border border-border px-2.5 py-1.5" data-document-file={file.id ?? "legacy"} data-file-status={file.status}>
      <div className="flex flex-wrap items-center gap-2">
        <FileText aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted" />
        {file.url ? (
          <a href={file.url} target="_blank" rel="noreferrer" className="min-w-0 break-all text-xs font-medium text-primary hover:underline" data-file-name>
            {file.name}
          </a>
        ) : (
          <span className="min-w-0 break-all text-xs font-medium text-ink" data-file-name>
            {file.name}
          </span>
        )}
        <Badge tone={DOCUMENT_STATUS_TONE[file.status] ?? "neutral"}>{DOCUMENT_STATUS_LABELS[file.status] ?? file.status.replace("_", " ")}</Badge>
        {removable && (
          <button
            type="button"
            onClick={() => {
              if (!confirm(`Remove "${file.name}"? You can upload it again.`)) return;
              void remove.run(() => studentRemoveDocumentFile(file.id!, revalidateTo), { toast: "File removed." });
            }}
            disabled={remove.pending}
            aria-label={`Remove ${file.name}`}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted hover:bg-bg hover:text-danger disabled:opacity-50"
          >
            <X aria-hidden className="h-3 w-3" />
            Remove
          </button>
        )}
      </div>
      {file.sources && (
        <p className="text-[11px] text-muted" data-file-sources>
          Joined from {file.sources.length} files: {file.sources.join(", ")}
        </p>
      )}
      {file.status === "rejected" && (
        <p className="text-xs text-danger" data-file-reason>
          {file.reason ? `Sent back: ${file.reason}` : "Sent back — ask your counsellor what needs changing."}
        </p>
      )}
      {removeError && <p className="text-xs text-danger">{removeError}</p>}
    </li>
  );
}

export function PortalDocumentRow({
  doc,
  studentId,
  revalidateTo,
  number,
  readOnly = false,
  guide = null,
  guideOpenInitially = false,
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
    /** Its files, each with its name and its own review (0328). */
    files?: DocFile[];
  };
  studentId: string;
  revalidateTo: string;
  /** e.g. "2.3", matching the numbering staff see on the Documents tab. */
  number?: string;
  /** A closed intake: readable, but nothing new can be sent against it. */
  readOnly?: boolean;
  /** How to prepare it, written in the checklist builder (0300). */
  guide?: ResolvedGuide | null;
  /** Opened, and scrolled to, on arrival — the dashboard's to-dos link here. */
  guideOpenInitially?: boolean;
}) {
  const action = studentUploadDocument.bind(null, doc.id, studentId, revalidateTo);
  const files = doc.files ?? [];
  const sentBack = files.some((f) => f.status === "rejected") || doc.status === "rejected";

  // A deadline that has gone is the one thing on this row a student must not
  // skim past, so it is coloured rather than left as ordinary grey text.
  const today = new Date().toISOString().slice(0, 10);
  const overdue = doc.status !== "verified" && doc.deadline && doc.deadline < today;

  // The guide opens under the row, beside the upload it is for. Open on
  // arrival when a link asked for it, and brought into view.
  const hasMore = guideHasMore(guide);
  const [guideOpen, setGuideOpen] = useState(guideOpenInitially && hasMore);
  const rowRef = useRef<HTMLDivElement>(null);
  const guideId = `guide-${doc.id}`;
  useEffect(() => {
    if (guideOpenInitially) rowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [guideOpenInitially]);
  const title = doc.custom_name ?? doc.category ?? "this document";

  return (
    <div ref={rowRef} id={`doc-${doc.id}`} className="flex scroll-mt-24 flex-col gap-3 py-3.5" data-document-row={doc.id}>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
      <span
        aria-hidden
        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${(STATUS_ICON[doc.status] ?? STATUS_ICON.missing).tile}`}
      >
        {(() => {
          const Icon = (STATUS_ICON[doc.status] ?? STATUS_ICON.missing).icon;
          return <Icon className="h-[18px] w-[18px]" />;
        })()}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">
          {number && <span className="mr-1.5 font-mono text-xs font-normal text-muted">{number}</span>}
          {doc.custom_name ?? doc.category ?? "Document"}
        </p>
        {/* The guide's short note, where the student reads the name. */}
        {guide?.note && (
          <p className="mt-0.5 text-[13px] leading-snug text-muted" data-guide-note>
            {guide.note}
          </p>
        )}
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
        </div>
        {/* Every file they sent for it, by the name they sent it under (0328). */}
        {files.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1.5" data-document-files>
            {files.map((f) => (
              <StudentFileRow key={f.id ?? f.path} file={f} revalidateTo={revalidateTo} readOnly={readOnly} />
            ))}
          </ul>
        )}
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
          <p className="mt-1 text-xs text-danger" data-rejected-reason>
            {files.length > 1
              ? "Upload a replacement for what was sent back; the rest stays."
              : doc.rejected_reason
                ? `Sent back: ${doc.rejected_reason}`
                : "Sent back — ask your counsellor what needs changing, then upload a replacement."}
            {/* The moment a student most needs to know what a correct one looks like. */}
            {hasMore && !guideOpen && (
              <>
                {" "}
                <button
                  type="button"
                  onClick={() => setGuideOpen(true)}
                  aria-controls={guideId}
                  className="font-semibold text-primary underline underline-offset-2"
                  data-guide-from-rejection
                >
                  Read how to prepare it before you upload again
                </button>
              </>
            )}
          </p>
        )}
        {hasMore && (
          <div className="mt-1.5">
            <DocumentGuideToggle open={guideOpen} onToggle={() => setGuideOpen((o) => !o)} controls={guideId} />
          </div>
        )}
      </div>
      </div>
      {/* What was sent before, and why it came back. Kept rather than
          overwritten, so it is worth showing the student their own attempt. */}
      <DocumentHistory versions={doc.history ?? []} audience="student" />

      {/* Asks before it sends: a document cannot be taken back once it is
          in, and if it is sent back the original stays on the record as the
          rejected version. */}
      {doc.status !== "verified" && !readOnly && (
        <ConfirmedUploadForm
          multiple
          action={action}
          accept={ACCEPTED_DOCUMENT_ACCEPT}
          capture="environment"
          hint="PDF, Word or photo"
          submitLabel={sentBack ? "Replace" : files.length > 0 ? "Add another file" : "Upload"}
          replacing={sentBack}
          removable
          className="sm:shrink-0"
        />
      )}
    </div>
      {guide && hasMore && guideOpen && <DocumentGuidePanel id={guideId} guide={guide} title={title} />}
    </div>
  );
}
