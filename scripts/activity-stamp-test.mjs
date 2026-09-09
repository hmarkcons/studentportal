import { test } from "node:test";
import assert from "node:assert/strict";
import { formatStamp, actorName, uploadedLine, addedLine, reviewedLine, changedLine } from "../src/lib/activityStamp.ts";

// 2026-11-12T09:32:00Z is 2:32 PM in Karachi (UTC+5).
const ISO = "2026-11-12T09:32:00Z";

test("the time is shown in Karachi, not UTC", () => {
  // The office both sides are talking to, so the same wording means the same
  // moment to a counsellor and to a student reading it abroad.
  const s = formatStamp(ISO);
  assert.match(s, /Nov 12, 2026/);
  assert.match(s, /2:32 PM/);
});

test("a moment late in the Karachi evening keeps the Karachi date", () => {
  // 2026-11-12T20:00Z is 1:00 AM on the 13th in Karachi. Formatting in UTC
  // would show the 12th.
  assert.match(formatStamp("2026-11-12T20:00:00Z"), /Nov 13, 2026/);
});

test("nothing in, nothing out", () => {
  for (const bad of [null, undefined, "", "not a date"]) assert.equal(formatStamp(bad), "");
});

// -------------------------------------------------------------- who did it
test("staff see a colleague's name; a student and a university see HMARK", () => {
  assert.equal(actorName("staff", "staff", "Sohaib Ur Rehman"), "Sohaib Ur Rehman");
  assert.equal(actorName("staff", "student", "Sohaib Ur Rehman"), "HMARK");
  assert.equal(actorName("staff", "partner", "Sohaib Ur Rehman"), "HMARK");
});

test("a student's own upload reads as 'you' to them and 'the student' to others", () => {
  assert.equal(actorName("student", "student"), "you");
  assert.equal(actorName("student", "staff"), "the student");
  assert.equal(actorName("student", "partner"), "the student");
});

test("a university's upload reads as 'your team' to them and 'the university' to others", () => {
  assert.equal(actorName("partner", "partner"), "your team");
  assert.equal(actorName("partner", "staff"), "the university");
  assert.equal(actorName("partner", "student"), "the university");
});

test("a staff upload with no name recorded still reads sensibly to staff", () => {
  assert.equal(actorName("staff", "staff", null), "a colleague");
  assert.equal(actorName("staff", "staff", "   "), "a colleague");
});

test("no recorded role means no claim about who", () => {
  assert.equal(actorName(null, "staff"), "");
});

// ------------------------------------------------------------------ upload
test("an upload reads as a sentence, phrased for the reader", () => {
  assert.equal(uploadedLine({ at: ISO, byRole: "student", audience: "student" }), "Uploaded Nov 12, 2026, 2:32 PM by you");
  assert.equal(uploadedLine({ at: ISO, byRole: "student", audience: "staff" }), "Uploaded Nov 12, 2026, 2:32 PM by the student");
  assert.equal(
    uploadedLine({ at: ISO, byRole: "staff", audience: "staff", staffName: "Muhammad Usman" }),
    "Uploaded Nov 12, 2026, 2:32 PM by Muhammad Usman"
  );
  assert.equal(uploadedLine({ at: ISO, byRole: "partner", audience: "student" }), "Uploaded Nov 12, 2026, 2:32 PM by the university");
});

test("an unfilled requirement says nothing rather than 'uploaded by nobody'", () => {
  assert.equal(uploadedLine({ at: null, byRole: "staff", audience: "staff" }), null);
});

test("an upload with a time but no recorded role still gives the time", () => {
  // 605 requirement rows predate uploaded_by_role being set on every path.
  assert.equal(uploadedLine({ at: ISO, byRole: null, audience: "student" }), "Uploaded Nov 12, 2026, 2:32 PM");
});

// ------------------------------------------------------------------- added
test("an addition reads with its own verb", () => {
  assert.equal(addedLine(ISO), "Added Nov 12, 2026, 2:32 PM");
  assert.equal(addedLine(ISO, "Scheduled"), "Scheduled Nov 12, 2026, 2:32 PM");
  assert.equal(addedLine(null), null);
});

// ---------------------------------------------------------------- reviewed
test("the review verb follows the status, not the column name", () => {
  // verified_at is set whichever way the review went, so calling a rejection
  // "verified" would be worse than saying nothing.
  assert.equal(reviewedLine(ISO, "verified", "student"), "Approved Nov 12, 2026, 2:32 PM");
  assert.equal(reviewedLine(ISO, "rejected", "student"), "Rejected Nov 12, 2026, 2:32 PM");
});

test("a document still awaiting review says nothing about it", () => {
  for (const s of ["submitted", "missing", "under_review", null]) {
    assert.equal(reviewedLine(ISO, s, "staff"), null, String(s));
  }
});

test("staff see who reviewed it; a student sees only that it was", () => {
  assert.equal(reviewedLine(ISO, "verified", "staff", "Abdul Hadi"), "Approved Nov 12, 2026, 2:32 PM by Abdul Hadi");
  assert.equal(reviewedLine(ISO, "verified", "student", "Abdul Hadi"), "Approved Nov 12, 2026, 2:32 PM");
});

// ----------------------------------------------------------------- changed
test("saving the credentials a second after the interview is not a change", () => {
  // Every interview row is written and then updated within the same second by
  // the credentials step. Reporting that as an edit would put a meaningless
  // "Last updated" on every card, including ones nobody has touched since.
  assert.equal(changedLine(ISO, ISO), null);
  assert.equal(changedLine(ISO, "2026-11-12T09:32:30Z"), null);
});

test("a rescheduled interview says when it moved", () => {
  // The same row with a new time: without this line a student comparing the
  // date against what they were told has no way to know it had changed.
  assert.equal(changedLine(ISO, "2026-11-13T09:32:00Z"), "Last changed Nov 13, 2026, 2:32 PM");
  assert.equal(
    changedLine(ISO, "2026-11-13T09:32:00Z", "Last updated"),
    "Last updated Nov 13, 2026, 2:32 PM"
  );
});

test("a missing or unparseable timestamp produces no line", () => {
  assert.equal(changedLine(null, ISO), null);
  assert.equal(changedLine(ISO, null), null);
  assert.equal(changedLine("not a date", ISO), null);
  assert.equal(changedLine(ISO, "not a date"), null);
});
