import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateAgreementGate, isGateAllowedPath, GATE_ALLOWED_PREFIXES } from "../src/lib/portalGate.ts";

const eSig = (over = {}) => ({
  status: "pending_signature",
  signing_method: "e_signature",
  signed_file_path: "s/agreement.pdf",
  video_recording_path: "s/video.mp4",
  approval_undone_at: null,
  ...over,
});

// ------------------------------------------------------- awaiting the student
test("a student who has not sent both pieces is held back", () => {
  const gate = evaluateAgreementGate([eSig({ signed_file_path: null })]);
  assert.equal(gate.locked, true);
  assert.equal(gate.reason, "awaiting_submission");
  assert.equal(gate.needsDocument, true);
  assert.equal(gate.needsVideo, false);
});

test("both pieces attached opens the portal without waiting for staff", () => {
  // Deliberate: making a student wait on a review they cannot influence would
  // lock them out for reasons they cannot act on.
  const gate = evaluateAgreementGate([eSig()]);
  assert.equal(gate.locked, false);
  assert.equal(gate.reason, null);
});

test("a paper agreement never gates anybody", () => {
  const gate = evaluateAgreementGate([
    { status: "pending_signature", signing_method: "paper", signed_file_path: null, video_recording_path: null },
  ]);
  assert.equal(gate.locked, false);
});

// -------------------------------------------------- an approval taken back
test("an approval staff have taken back closes the portal again", () => {
  // Access was granted on the strength of an approval that no longer stands.
  const gate = evaluateAgreementGate([eSig({ approval_undone_at: "2026-09-10T09:00:00Z" })]);
  assert.equal(gate.locked, true);
  assert.equal(gate.reason, "awaiting_reverification");
});

test("...and the student is not asked to send anything again", () => {
  // Both files are still attached; telling them to upload would be wrong.
  const gate = evaluateAgreementGate([eSig({ approval_undone_at: "2026-09-10T09:00:00Z" })]);
  assert.equal(gate.needsDocument, false);
  assert.equal(gate.needsVideo, false);
});

test("a re-approved agreement opens the portal back up", () => {
  // status returns to 'signed' and the undo fields are cleared by the trigger
  // in 0160, so this is what a reinstated approval looks like.
  const gate = evaluateAgreementGate([eSig({ status: "signed", approval_undone_at: null })]);
  assert.equal(gate.locked, false);
});

test("a signed agreement is never gated, undo fields or not", () => {
  // Nothing should be able to lock out a student whose agreement is signed.
  const gate = evaluateAgreementGate([eSig({ status: "signed", approval_undone_at: "2026-09-10T09:00:00Z" })]);
  assert.equal(gate.locked, false);
});

test("a missing upload outranks an undone approval in the message", () => {
  // If both were true, telling the student "we are re-checking" while a file
  // is genuinely missing would leave them waiting on us for something only
  // they can do.
  const gate = evaluateAgreementGate([
    eSig({ video_recording_path: null, approval_undone_at: "2026-09-10T09:00:00Z" }),
  ]);
  assert.equal(gate.reason, "awaiting_submission");
  assert.equal(gate.needsVideo, true);
});

// ------------------------------------------------------------ what stays open
test("the agreement, payments and support stay reachable while gated", () => {
  assert.equal(isGateAllowedPath("/portal/agreement"), true);
  // Money owed does not stop being owed because the agreement is back with
  // staff, and an invoice may already have been raised against it.
  assert.equal(isGateAllowedPath("/portal/payments"), true);
  assert.equal(isGateAllowedPath("/portal/support"), true);
  assert.equal(isGateAllowedPath("/portal/support/abc-123"), true);
});

test("everything else is not", () => {
  for (const p of ["/portal", "/portal/documents", "/portal/visa", "/portal/messages", "/portal/profile"]) {
    assert.equal(isGateAllowedPath(p), false, p);
  }
});

test("a prefix cannot be matched by something that merely starts the same", () => {
  // "/portal/paymentsomething" is not the payments page.
  assert.equal(isGateAllowedPath("/portal/paymentsomething"), false);
  assert.equal(GATE_ALLOWED_PREFIXES.includes("/portal/payments"), true);
});
