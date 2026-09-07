"use client";

import { useState } from "react";
import { verifySignedAgreement, rejectAgreementArtifact } from "@/lib/actions/agreements";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

// Staff sign-off for an e-signed submission. The document and the consent
// video are reviewed separately: either can be wrong on its own, and sending a
// student back to redo both when only the video was unusable is needless work
// for them.
export function VerifySignedAgreement({
  agreementId,
  studentId,
  submitted,
  videoUrl,
  documentStatus = "pending",
  videoStatus = "pending",
  documentNote,
  videoNote,
}: {
  agreementId: string;
  studentId: string;
  submitted: boolean;
  videoUrl: string | null;
  documentStatus?: string;
  videoStatus?: string;
  documentNote?: string | null;
  videoNote?: string | null;
}) {
  const [pending, setPending] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [docOk, setDocOk] = useState(false);
  const [videoOk, setVideoOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<"document" | "video" | null>(null);
  const [reason, setReason] = useState("");

  async function verify() {
    setPending(true);
    setError(null);
    const result = await verifySignedAgreement(agreementId, studentId, emailVerified, docOk, videoOk);
    if (result?.error) setError(result.error);
    setPending(false);
  }

  async function reject(kind: "document" | "video") {
    setPending(true);
    setError(null);
    const result = await rejectAgreementArtifact(agreementId, studentId, kind, reason);
    if (result?.error) setError(result.error);
    else {
      setRejecting(null);
      setReason("");
    }
    setPending(false);
  }

  // Nothing submitted yet — but a previous rejection is worth showing, since
  // it explains why this student is being asked again.
  if (!submitted) {
    return (
      <div className="mt-2 flex flex-col gap-2">
        <p className="text-xs text-muted">
          E-signature (outside Karachi) — the student submits the signed agreement and their consent video from their
          portal.
        </p>
        {documentStatus === "rejected" && (
          <p className="text-xs text-danger">Agreement sent back: {documentNote ?? "no reason recorded"}</p>
        )}
        {videoStatus === "rejected" && (
          <p className="text-xs text-danger">Video sent back to re-record: {videoNote ?? "no reason recorded"}</p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-medium text-ink">Student submitted an e-signed agreement — review before approving.</p>
        <Badge tone={documentStatus === "approved" ? "success" : documentStatus === "rejected" ? "danger" : "warning"}>
          Agreement: {documentStatus}
        </Badge>
        <Badge tone={videoStatus === "approved" ? "success" : videoStatus === "rejected" ? "danger" : "warning"}>
          Video: {videoStatus}
        </Badge>
      </div>

      {videoUrl ? (
        <video src={videoUrl} controls playsInline preload="metadata" className="w-full max-w-sm rounded-md bg-black" />
      ) : (
        <p className="text-xs text-danger">No consent video found on this submission.</p>
      )}

      {rejecting ? (
        <div className="flex flex-col gap-2 rounded-md bg-warning-bg p-2">
          <p className="text-xs font-medium text-warning">
            {rejecting === "video"
              ? "Ask the student to record the video again"
              : "Send the signed agreement back to the student"}
          </p>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              rejecting === "video"
                ? "e.g. Face not visible / audio unclear / you did not state the date"
                : "e.g. Signature missing on page 3"
            }
          />
          <p className="text-xs text-warning">
            The file stays on record — the student simply uploads a replacement, and sees this reason.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="danger" size="sm" pending={pending} onClick={() => reject(rejecting)}>
              Send back
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setRejecting(null); setReason(""); }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setRejecting("video")}>
            Ask to re-record video
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setRejecting("document")}>
            Reject agreement
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-1 border-t border-border pt-2">
        <label className="flex items-center gap-1.5 text-xs text-ink">
          <input type="checkbox" checked={docOk} onChange={(e) => setDocOk(e.target.checked)} />
          The signed agreement is correct
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink">
          <input type="checkbox" checked={videoOk} onChange={(e) => setVideoOk(e.target.checked)} disabled={!videoUrl} />
          I have watched the video and it meets the requirement
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" checked={emailVerified} onChange={(e) => setEmailVerified(e.target.checked)} />
          Email verified
        </label>
      </div>

      <div>
        <Button
          type="button"
          variant="primary"
          size="sm"
          pending={pending}
          onClick={verify}
          disabled={!videoUrl || !docOk || !videoOk}
        >
          Approve &amp; mark signed
        </Button>
        {(!docOk || !videoOk) && (
          <p className="mt-1 text-xs text-muted">Tick both boxes to approve, or send one back above.</p>
        )}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
