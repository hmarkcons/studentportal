import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SENDABLE_CHANNELS,
  isSendableChannel,
  MESSAGE_MAX_LENGTH,
  messageBodyError,
  BROADCAST_MAX_RECIPIENTS,
  broadcastRecipientsError,
} from "../src/lib/messages.ts";

test("only the channels the app can actually deliver are sendable", () => {
  assert.deepEqual([...SENDABLE_CHANNELS], ["inapp", "internal_note"]);
});

test("a channel the app cannot send by is refused", () => {
  // messages.channel also allows these, and the thread reads them back as
  // though they had been sent that way — but nothing here has a gateway, so a
  // row labelled "email" would claim an email went out when none had.
  for (const c of ["email", "sms", "whatsapp"]) assert.equal(isSendableChannel(c), false, c);
  for (const c of SENDABLE_CHANNELS) assert.equal(isSendableChannel(c), true, c);
});

test("an empty message is refused", () => {
  for (const empty of ["", "   ", null, undefined]) {
    assert.match(messageBodyError(empty) ?? "", /can't be empty/);
  }
});

test("an ordinary message passes", () => {
  assert.equal(messageBodyError("Please upload your transcripts."), null);
});

test("a message at the limit passes, one over does not", () => {
  assert.equal(messageBodyError("x".repeat(MESSAGE_MAX_LENGTH)), null);
  const err = messageBodyError("x".repeat(MESSAGE_MAX_LENGTH + 1));
  assert.match(err ?? "", /the limit is/);
  // The message says how long it actually was, so the sender can judge.
  assert.match(err ?? "", /5,001 characters/);
});

test("whitespace does not count towards the limit", () => {
  assert.equal(messageBodyError(`  ${"x".repeat(MESSAGE_MAX_LENGTH)}  `), null);
});

test("a broadcast needs at least one recipient", () => {
  assert.match(broadcastRecipientsError(0) ?? "", /at least one/);
});

test("an ordinary broadcast passes", () => {
  for (const n of [1, 25, BROADCAST_MAX_RECIPIENTS]) assert.equal(broadcastRecipientsError(n), null, String(n));
});

test("a broadcast past the cap is refused, and says how to proceed", () => {
  const err = broadcastRecipientsError(BROADCAST_MAX_RECIPIENTS + 1);
  assert.match(err ?? "", /past the/);
  assert.match(err ?? "", /smaller groups/);
});

test("the cap is well above any real cohort, so it only catches a mis-click", () => {
  assert.ok(BROADCAST_MAX_RECIPIENTS >= 500);
});
