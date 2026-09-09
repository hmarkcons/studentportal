import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TICKET_SUBJECT_MAX,
  TICKET_BODY_MAX,
  ticketSubjectError,
  ticketBodyError,
  statusAfterReply,
} from "../src/lib/supportTickets.ts";

// ------------------------------------------------------------- subject
test("a blank subject is refused, whitespace included", () => {
  assert.ok(ticketSubjectError(""));
  assert.ok(ticketSubjectError("   "));
  assert.ok(ticketSubjectError(null));
  assert.ok(ticketSubjectError(undefined));
});

test("the subject limit is the one the edit form already enforced", () => {
  // A ticket used to be creatable with a subject the edit action would then
  // refuse to save, so staff could not shorten what a student had typed.
  assert.equal(ticketSubjectError("x".repeat(TICKET_SUBJECT_MAX)), null);
  assert.ok(ticketSubjectError("x".repeat(TICKET_SUBJECT_MAX + 1)));
});

test("the subject is measured after trimming", () => {
  assert.equal(ticketSubjectError(`  ${"x".repeat(TICKET_SUBJECT_MAX)}  `), null);
});

// ---------------------------------------------------------------- body
test("an empty message is refused, and says which field", () => {
  assert.match(ticketBodyError(""), /what you need help with/);
  assert.match(ticketBodyError("", "reply"), /can't be empty/);
});

test("a body at the limit passes and one over it does not", () => {
  assert.equal(ticketBodyError("x".repeat(TICKET_BODY_MAX)), null);
  const tooLong = ticketBodyError("x".repeat(TICKET_BODY_MAX + 1));
  assert.ok(tooLong);
  // The number is in the message: "too long" with no size leaves someone
  // guessing how much to cut.
  assert.match(tooLong, /5,001/);
  assert.match(tooLong, /5,000/);
});

test("a 200,000-character paste is refused rather than stored", () => {
  // What the database accepted before 0156, then read back and rendered in
  // full on every visit to the ticket.
  assert.ok(ticketBodyError("x".repeat(200_000)));
});

// -------------------------------------------------------------- status
test("a student replying to a resolved ticket reopens it", () => {
  // Otherwise nothing flags it: awaitingStaff treats resolved as nobody's
  // problem, so the student waits on an answer nobody was asked for.
  assert.equal(statusAfterReply("resolved", "student"), "open");
});

test("the first staff reply moves an untouched ticket to in progress", () => {
  assert.equal(statusAfterReply("open", "staff"), "in_progress");
});

test("nothing else moves", () => {
  assert.equal(statusAfterReply("in_progress", "staff"), "in_progress");
  assert.equal(statusAfterReply("in_progress", "student"), "in_progress");
  assert.equal(statusAfterReply("open", "student"), "open");
  // Staff replying on a resolved ticket is a closing remark, not a reopening.
  assert.equal(statusAfterReply("resolved", "staff"), "resolved");
});
