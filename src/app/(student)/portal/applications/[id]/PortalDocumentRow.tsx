"use client";

import { useEffect, useRef, useState } from "react";
import { ConfirmedUploadForm } from "@/components/ConfirmedUploadForm";
import { DocumentGuidePanel, DocumentGuideToggle, guideHasMore } from "@/components/DocumentGuide";
import type { ResolvedGuide } from "@/lib/documentGuides";
import { CircleCheck, Eye, Hourglass, ScanSearch, Undo2, Upload, type LucideIcon } from "lucide-react";
import { DocumentHistory, type ArchivedUpload } from "@/components/DocumentHistory";
import { studentUploadDocument } from "@/lib/actions/portal-documents";
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
          {doc.fileUrl && (
            <a
              href={doc.fileUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-primary px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
            >
              <Eye aria-hidden className="h-3.5 w-3.5 shrink-0" />
              View file
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
          <p className="mt-1 text-xs text-danger" data-rejected-reason>
            {doc.rejected_reason
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
          action={action}
          accept={ACCEPTED_DOCUMENT_ACCEPT}
          capture="environment"
          hint="PDF, Word or photo"
          submitLabel={doc.status === "rejected" ? "Replace" : "Upload"}
          replacing={doc.status === "rejected"}
          className="sm:shrink-0"
        />
      )}
    </div>
      {guide && hasMore && guideOpen && <DocumentGuidePanel id={guideId} guide={guide} title={title} />}
    </div>
  );
}
