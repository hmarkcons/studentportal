// Students signing outside Karachi sign electronically, and that agreement is
// only usable once they have both attached the signed document and recorded
// the consent video. Until they have, the rest of the portal is held back so
// the task cannot be scrolled past — see src/proxy.ts, which enforces it, and
// the student layout, which trims the menu to match.
//
// The same gate now also covers an agreement whose approval staff have taken
// back (migration 0160). Normal access is tied to an approved agreement, so
// unapproving one closes the portal again — but not the login: a student who
// cannot reach their agreement page cannot fix whatever was wrong with it,
// which is usually the reason the approval was taken back in the first place.

/** Routes a gated student may still reach. */
export const GATE_ALLOWED_PREFIXES = [
  "/portal/agreement",
  // Money owed does not stop being owed because the agreement is back with
  // staff, and an invoice may already have been raised against it. A student
  // with nothing to pay sees an empty page here, which is harmless; one with
  // an instalment due can still pay it.
  "/portal/payments",
  // Kept open deliberately: demanding an upload while removing every way to
  // ask for help is a trap, and support tickets are how a stuck student
  // reaches their counselor.
  "/portal/support",
];

/** Why the portal is held back, which is not the same message in both cases. */
export type GateReason = "awaiting_submission" | "awaiting_reverification";

export type AgreementGate = {
  locked: boolean;
  reason: GateReason | null;
  /** Present when locked — what the student still owes. */
  needsDocument: boolean;
  needsVideo: boolean;
};

export type GateAgreementRow = {
  status: string | null;
  signing_method: string | null;
  signed_file_path: string | null;
  video_recording_path: string | null;
  approval_undone_at?: string | null;
};

/**
 * A student is gated when they hold an e-signature agreement that is either
 * still awaiting their submission or no longer approved.
 *
 * Once both pieces are attached the portal opens up immediately — waiting for
 * staff verification would leave the student locked out for reasons they
 * cannot act on. An approval that staff have taken back is different: it was
 * open, and it closes again, because access was granted on the strength of an
 * approval that no longer stands.
 */
export function evaluateAgreementGate(agreements: GateAgreementRow[]): AgreementGate {
  const eSignature = agreements.filter((a) => a.signing_method === "e_signature" && a.status !== "signed");

  const awaitingSubmission = eSignature.filter((a) => !a.signed_file_path || !a.video_recording_path);
  if (awaitingSubmission.length > 0) {
    return {
      locked: true,
      reason: "awaiting_submission",
      needsDocument: awaitingSubmission.some((a) => !a.signed_file_path),
      needsVideo: awaitingSubmission.some((a) => !a.video_recording_path),
    };
  }

  // Everything is attached, but an approval was withdrawn and not reinstated.
  // The student has nothing to upload; they are waiting on HMARK.
  const unapproved = eSignature.filter((a) => Boolean(a.approval_undone_at));
  if (unapproved.length > 0) {
    return { locked: true, reason: "awaiting_reverification", needsDocument: false, needsVideo: false };
  }

  return { locked: false, reason: null, needsDocument: false, needsVideo: false };
}

export function isGateAllowedPath(pathname: string): boolean {
  return GATE_ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
