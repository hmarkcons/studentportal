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
