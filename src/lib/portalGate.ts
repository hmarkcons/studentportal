// Students signing outside Karachi sign electronically, and that agreement is
// only usable once they have both attached the signed document and recorded
// the consent video. Until they have, the rest of the portal is held back so
// the task cannot be scrolled past — see src/proxy.ts, which enforces it, and
// the student layout, which trims the menu to match.

/** Routes a gated student may still reach. */
export const GATE_ALLOWED_PREFIXES = [
  "/portal/agreement",
  // Kept open deliberately: demanding an upload while removing every way to
  // ask for help is a trap, and support tickets are how a stuck student
  // reaches their counselor.
  "/portal/support",
];

export type AgreementGate = {
  locked: boolean;
  /** Present when locked — what the student still owes. */
  needsDocument: boolean;
  needsVideo: boolean;
};

export type GateAgreementRow = {
  status: string | null;
  signing_method: string | null;
  signed_file_path: string | null;
  video_recording_path: string | null;
};

/**
 * A student is gated when they hold an e-signature agreement that is still
 * awaiting their submission. Once both pieces are attached the portal opens up
 * immediately — waiting for staff verification would leave the student locked
 * out for reasons they cannot act on.
 */
export function evaluateAgreementGate(agreements: GateAgreementRow[]): AgreementGate {
  const outstanding = agreements.filter(
    (a) => a.signing_method === "e_signature" && a.status !== "signed" && (!a.signed_file_path || !a.video_recording_path)
  );

  if (outstanding.length === 0) return { locked: false, needsDocument: false, needsVideo: false };

  return {
    locked: true,
    needsDocument: outstanding.some((a) => !a.signed_file_path),
    needsVideo: outstanding.some((a) => !a.video_recording_path),
  };
}

export function isGateAllowedPath(pathname: string): boolean {
  return GATE_ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
