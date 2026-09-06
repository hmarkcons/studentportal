"use client";

import { useState } from "react";
import { verifySignedAgreement } from "@/lib/actions/agreements";
import { Button } from "@/components/ui/Button";

// Staff sign-off for an e-signed submission. The student uploads the document
// and consent video from their portal; this is the "watched it, it's them"
// step that actually marks the agreement signed.
export function VerifySignedAgreement({
  agreementId,
  studentId,
  submitted,
  videoUrl,
}: {
  agreementId: string;
  studentId: string;
  submitted: boolean;
  videoUrl: string | null;
}) {
  const [pending, setPending] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verify() {
    setPending(true);
    setError(null);
    const result = await verifySignedAgreement(agreementId, studentId, emailVerified);
    if (result?.error) setError(result.error);
    setPending(false);
  }

  if (!submitted) {
    return (
      <p className="mt-2 text-xs text-muted">
        E-signature (outside Karachi) — the student submits the signed agreement and their consent video from their portal.
        Nothing to verify yet.
      </p>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-md border border-border p-3">
      <p className="text-xs font-medium text-ink">Student submitted an e-signed agreement — verify before marking it signed.</p>
      {videoUrl ? (
        <video src={videoUrl} controls playsInline className="w-full max-w-sm rounded-md bg-black" />
      ) : (
        <p className="text-xs text-danger">No consent video found on this submission.</p>
      )}
      <label className="flex items-center gap-1 text-xs text-muted">
        <input type="checkbox" checked={emailVerified} onChange={(e) => setEmailVerified(e.target.checked)} /> Email verified
      </label>
      <div>
        <Button type="button" variant="primary" size="sm" pending={pending} onClick={verify} disabled={!videoUrl}>
          Verify &amp; mark signed
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
