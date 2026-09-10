"use client";

import { useState } from "react";
import { undoAgreementApproval } from "@/lib/actions/agreements";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatStamp } from "@/lib/activityStamp";

/**
 * Takes back the approval of an e-signed agreement, its consent video, or both.
 *
 * Approving used to be a one-way door — the review panel disappears the moment
 * the agreement is marked signed — so a wrong approval could only be undone by
 * deleting the whole agreement and regenerating it, discarding the student's
 * signed copy and their recording. Nothing here touches either file.
 */
export function UndoAgreementApproval({
  agreementId,
  studentId,
  documentStatus,
  videoStatus,
  hasInvoice,
}: {
  agreementId: string;
  studentId: string;
  documentStatus: string;
  videoStatus: string;
  /** Warned about rather than blocked: an invoice raised against this
   *  agreement stays valid and untouched, but staff should know it exists
   *  before un-signing what it was raised against. */
  hasInvoice: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"document" | "video" | "both">("both");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const docApproved = documentStatus === "approved";
  const videoApproved = videoStatus === "approved";
  if (!docApproved && !videoApproved) return null;

  async function submit() {
    setPending(true);
    setError(null);
    const result = await undoAgreementApproval(agreementId, studentId, kind, note);
    if (result?.error) setError(result.error);
    else {
      setOpen(false);
      setNote("");
    }
    setPending(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-xs font-medium text-muted hover:text-danger hover:underline"
        title="Put this submission back in front of staff for re-checking"
      >
        Undo approval
      </button>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-md border border-warning bg-warning-bg p-3">
      <p className="text-xs font-medium text-warning">Take the approval back?</p>
      <p className="text-xs text-warning">
        The signed agreement and the video stay exactly where they are — nothing is deleted and the student is not asked
        to send anything again. The submission goes back to awaiting verification, and the student&rsquo;s portal closes
        to everything but their agreement, their payments and Support until it is approved again.
      </p>
      {hasInvoice && (
        <p className="text-xs font-medium text-danger">
          An invoice has already been raised against this agreement. It stays valid and is not touched, but the agreement
          it was raised against will no longer be signed until you approve it again.
        </p>
      )}

      <div className="flex flex-col gap-1">
        {docApproved && videoApproved && (
          <label className="flex items-center gap-1.5 text-xs text-warning">
            <input type="radio" name="undo-kind" checked={kind === "both"} onChange={() => setKind("both")} />
            Both the agreement and the video
          </label>
        )}
        {docApproved && (
          <label className="flex items-center gap-1.5 text-xs text-warning">
            <input type="radio" name="undo-kind" checked={kind === "document"} onChange={() => setKind("document")} />
            Only the signed agreement
          </label>
        )}
        {videoApproved && (
          <label className="flex items-center gap-1.5 text-xs text-warning">
            <input type="radio" name="undo-kind" checked={kind === "video"} onChange={() => setKind("video")} />
            Only the consent video
          </label>
        )}
      </div>

      <label className="flex flex-col gap-1 text-xs text-warning">
        Why (optional — recorded against the agreement, not shown to the student)
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="e.g. Approved in error — need to re-watch the video"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="danger" size="sm" pending={pending} onClick={submit}>
          Undo approval
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

/** Shown once an approval has been taken back, so the record is visible. */
export function UndoneApprovalNote({
  at,
  by,
  note,
}: {
  at: string | null;
  by: string | null;
  note: string | null;
}) {
  if (!at) return null;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-warning">
      <Badge tone="warning">Approval withdrawn</Badge>
      <span>
        {formatStamp(at)}
        {by ? ` by ${by}` : ""}
        {note ? ` — ${note}` : ""}
      </span>
    </p>
  );
}
