// A registered student's applications: submitted first, in the order they
// were submitted, then the rest (src/lib/applicationSubmissionOrder.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { firstSubmittedAt, isSubmitted, submittedFirst } from "../src/lib/applicationSubmissionOrder.ts";

const ITALY = ["documents_pending", "documents_verified", "application_submitted", "under_review", "acceptance_letter", "pre_enrolled"];

test("submitted means at or past Application Submitted, never a closing result", () => {
  assert.equal(isSubmitted("documents_verified", ITALY), false);
  assert.equal(isSubmitted("application_submitted", ITALY), true);
  assert.equal(isSubmitted("acceptance_letter", ITALY), true);
  assert.equal(isSubmitted("pre_enrolled", ITALY), true);
  assert.equal(isSubmitted("rejected", ITALY), false);
  assert.equal(isSubmitted("withdrawn", ITALY), false);
  assert.equal(isSubmitted(null, ITALY), false);
});

test("the submission time is the first step at or past Application Submitted", () => {
  const app = { stage: "under_review", pipeline: ITALY, createdAt: "2026-10-01T00:00:00Z" };
  const history = [
    { stage: "documents_pending", enteredAt: "2026-10-01T00:00:00Z" },
    { stage: "application_submitted", enteredAt: "2026-11-14T15:50:00Z" },
    { stage: "acceptance_letter", enteredAt: "2026-11-14T23:15:00Z" },
    // Put back to Application Submitted later: still first submitted on the 14th at 15:50.
    { stage: "application_submitted", enteredAt: "2026-11-14T23:29:00Z" },
  ];
  assert.equal(firstSubmittedAt(app, history), "2026-11-14T15:50:00Z");
  // Set straight to a later stage: that step is when it went in.
  assert.equal(firstSubmittedAt(app, [{ stage: "under_review", enteredAt: "2026-11-02T00:00:00Z" }]), "2026-11-02T00:00:00Z");
  // No history at all: from when it was made.
  assert.equal(firstSubmittedAt(app, []), "2026-10-01T00:00:00Z");
  // Not submitted: no time.
  assert.equal(firstSubmittedAt({ ...app, stage: "documents_verified" }, history), null);
  assert.equal(firstSubmittedAt({ ...app, stage: "rejected" }, history), null);
});

test("submitted first, the first submitted on top; then the rest in their own order", () => {
  const apps = [
    { id: "pending-a", at: null, submitted: false, rank: 1 },
    { id: "late", at: "2026-11-10T00:00:00Z", submitted: true, rank: 5 },
    { id: "rejected", at: null, submitted: false, rank: 9 },
    { id: "early", at: "2026-11-01T00:00:00Z", submitted: true, rank: 7 },
    { id: "pending-b", at: null, submitted: false, rank: 2 },
    { id: "middle", at: "2026-11-05T00:00:00Z", submitted: true, rank: 3 },
  ];
  const order = submittedFirst(apps, (a) => ({ submitted: a.submitted, at: a.at }), (a, b) => a.rank - b.rank).map((a) => a.id);
  assert.deepEqual(order, ["early", "middle", "late", "pending-a", "pending-b", "rejected"]);
});

test("one just submitted on the page goes last among the submitted; one taken back goes among the rest", () => {
  const apps = [
    { id: "old", at: "2026-11-01T00:00:00Z", submitted: true, rank: 2 },
    { id: "just-now", at: null, submitted: true, rank: 1 },
    { id: "taken-back", at: "2026-10-01T00:00:00Z", submitted: false, rank: 3 },
  ];
  const order = submittedFirst(apps, (a) => ({ submitted: a.submitted, at: a.at }), (a, b) => a.rank - b.rank).map((a) => a.id);
  assert.deepEqual(order, ["old", "just-now", "taken-back"]);
});
