import test from "node:test";
import assert from "node:assert/strict";
import { scholarshipGate, scholarshipGateMessage } from "../src/lib/scholarshipGate.ts";

const row = (over) => ({
  applicationId: "a1",
  destinationId: "d-it",
  preenrollmentFinalized: false,
  hasBody: true,
  ...over,
});

test("nothing is shown until a university is finalised for pre-enrolment", () => {
  const g = scholarshipGate([row({ applicationId: "a1" }), row({ applicationId: "a2" })]);
  assert.deepEqual(g.visible, []);
  assert.equal(g.reason, "not_finalised");
});

test("the finalised one is shown, and only that one", () => {
  const g = scholarshipGate([
    row({ applicationId: "a1", preenrollmentFinalized: true }),
    row({ applicationId: "a2" }),
    row({ applicationId: "a3" }),
  ]);
  assert.deepEqual(g.visible.map((v) => v.applicationId), ["a1"]);
  assert.equal(g.reason, null);
});

test("a student with no applications is told that, not that no body exists", () => {
  const g = scholarshipGate([]);
  assert.equal(g.reason, "no_application");
});

test("a country with no scholarship body is a different answer from an unfinalised one", () => {
  const noBody = scholarshipGate([row({ hasBody: false, preenrollmentFinalized: true })]);
  assert.equal(noBody.reason, "no_body");
  const notFinalised = scholarshipGate([row({ hasBody: true })]);
  assert.equal(notFinalised.reason, "not_finalised");
});

test("an application with no destination cannot open the gate", () => {
  const g = scholarshipGate([row({ destinationId: null, preenrollmentFinalized: true })]);
  assert.equal(g.reason, "no_body");
  assert.deepEqual(g.visible, []);
});

test("finalising in one country does not open another", () => {
  // Italy finalised, Germany not — Germany must stay shut.
  const g = scholarshipGate([
    row({ applicationId: "it", destinationId: "d-it", preenrollmentFinalized: true }),
    row({ applicationId: "de", destinationId: "d-de" }),
  ]);
  assert.deepEqual(g.visible.map((v) => v.applicationId), ["it"]);
});

test("two finalised countries both show", () => {
  const g = scholarshipGate([
    row({ applicationId: "it", destinationId: "d-it", preenrollmentFinalized: true }),
    row({ applicationId: "de", destinationId: "d-de", preenrollmentFinalized: true }),
  ]);
  assert.deepEqual(g.visible.map((v) => v.applicationId), ["it", "de"]);
  assert.equal(g.reason, null);
});

test("a finalised application in a country with no body still shows nothing", () => {
  const g = scholarshipGate([
    row({ applicationId: "uk", destinationId: "d-uk", hasBody: false, preenrollmentFinalized: true }),
  ]);
  assert.equal(g.reason, "no_body");
});

test("every reason has something to say, and says what to do next", () => {
  for (const reason of ["no_application", "no_body", "not_finalised"]) {
    const m = scholarshipGateMessage(reason);
    assert.ok(m.length > 30, reason);
    assert.doesNotMatch(m, /undefined|null/, reason);
  }
  assert.match(scholarshipGateMessage("no_body"), /Setup › Scholarship bodies/);
  assert.match(scholarshipGateMessage("not_finalised"), /Applications tab/);
});

test("the unfinalised message explains why, not just that", () => {
  // Staff who are told only "nothing here" go looking for a bug.
  const m = scholarshipGateMessage("not_finalised");
  assert.match(m, /depends on the region/);
  assert.match(m, /deadlines and income thresholds/);
});

// ------------------------------------------------- the office's decision
// Italy never asks: its DSU is offered to everyone and the body follows the
// finalised university. Every other country does, and "No" means the tab
// has nothing to show for it.

test("a country answered No is gone from the tab", () => {
  const out = scholarshipGate([
    { applicationId: "a", destinationId: "de", preenrollmentFinalized: true, hasBody: true, intent: "No" },
  ]);
  assert.deepEqual(out.visible, []);
  assert.equal(out.reason, "declined");
});

test("declined reads differently from nobody having looked", () => {
  // The whole reason there are three answers rather than two.
  assert.match(scholarshipGateMessage("declined"), /No scholarship is being pursued/);
  assert.match(scholarshipGateMessage("not_finalised"), /until a university is finalised/);
  assert.notEqual(scholarshipGateMessage("declined"), scholarshipGateMessage("not_finalised"));
});

test("Not decided behaves as it always did", () => {
  const out = scholarshipGate([
    { applicationId: "a", destinationId: "de", preenrollmentFinalized: true, hasBody: true, intent: "Not decided" },
  ]);
  assert.equal(out.visible.length, 1);
  assert.equal(out.reason, null);
});

test("Italy, which never asks, is unaffected", () => {
  // No intent at all on the row — Italy does not carry the field.
  const out = scholarshipGate([
    { applicationId: "a", destinationId: "it", preenrollmentFinalized: true, hasBody: true },
  ]);
  assert.equal(out.visible.length, 1);
  assert.equal(out.reason, null);
});

test("declining one country does not hide another", () => {
  const out = scholarshipGate([
    { applicationId: "a", destinationId: "de", preenrollmentFinalized: true, hasBody: true, intent: "No" },
    { applicationId: "b", destinationId: "it", preenrollmentFinalized: true, hasBody: true },
  ]);
  assert.deepEqual(out.visible.map((r) => r.destinationId), ["it"]);
  assert.equal(out.reason, null);
});

test("a declined country is not mistaken for one awaiting pre-enrolment", () => {
  // Declined AND not finalised: the decision is the more useful answer.
  const out = scholarshipGate([
    { applicationId: "a", destinationId: "de", preenrollmentFinalized: false, hasBody: true, intent: "No" },
  ]);
  assert.equal(out.reason, "declined");
});
