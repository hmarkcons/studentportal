import test from "node:test";
import assert from "node:assert/strict";
import {
  cycleTabLabel,
  orderCycles,
  nextIntakeLabel,
  recommendRestart,
  categoryCarriesOver,
  documentCarriesOver,
  resolveCycleDocuments,
  intakeLabel,
  NO_INTAKE,
} from "../src/lib/intakeCycle.ts";

const SINGLE = ["September/Fall"];
const MULTI = ["Spring/Summer", "Fall/Winter"];
const cycle = (over) => ({ id: "c", sequence: 1, intake: null, is_current: true, ...over });

test("a tab heading names the intake, because that is all that separates the tabs", () => {
  assert.equal(cycleTabLabel("Apps", cycle({ intake: "September/Fall 2027" })), "Apps — September/Fall 2027");
  assert.equal(cycleTabLabel("Docs", cycle({ intake: "  " })), `Docs — ${NO_INTAKE}`);
  assert.equal(intakeLabel(null), NO_INTAKE);
});

test("the current intake comes first, then the most recent previous one", () => {
  const ordered = orderCycles([
    { id: "a", sequence: 1, intake: "Fall 2026", is_current: false },
    { id: "c", sequence: 3, intake: "Fall 2028", is_current: true },
    { id: "b", sequence: 2, intake: "Fall 2027", is_current: false },
  ]);
  assert.deepEqual(ordered.map((c) => c.id), ["c", "b", "a"]);
});

test("a single-intake country rolls to the same season next year", () => {
  const now = new Date("2027-03-01T06:00:00Z");
  assert.equal(nextIntakeLabel("September/Fall 2027", "single", SINGLE, now), "September/Fall 2028");
});

test("a two-intake country offers the other half of the same cycle first", () => {
  const now = new Date("2027-03-01T06:00:00Z");
  assert.equal(nextIntakeLabel("Spring/Summer 2027", "multi", MULTI, now), "Fall/Winter 2027");
  // Already on the later half, so the next slot is the FIRST season of next
  // year. Rolling to "Fall/Winter 2028" would skip an intake the student could
  // have taken.
  assert.equal(nextIntakeLabel("Fall/Winter 2027", "multi", MULTI, now), "Spring/Summer 2028");
});

test("a student offered both halves is moved to both, next year", () => {
  const now = new Date("2027-03-01T06:00:00Z");
  assert.equal(
    nextIntakeLabel("Spring/Summer & Fall/Winter 2027", "multi", MULTI, now),
    "Spring/Summer & Fall/Winter 2028"
  );
});

test("an intake recorded years ago never rolls to a year already past", () => {
  const now = new Date("2029-06-01T06:00:00Z");
  assert.equal(nextIntakeLabel("September/Fall 2025", "single", SINGLE, now), "September/Fall 2029");
});

test("a freehand intake is not guessed at", () => {
  const now = new Date("2027-03-01T06:00:00Z");
  // UK writes "January 2027", "May 2027" — picking one would put the student
  // in the wrong intake.
  assert.equal(nextIntakeLabel("January 2027", "free_text", [], now), "");
  // A single-intake country still has an obvious answer even with nothing set.
  assert.equal(nextIntakeLabel(null, "single", SINGLE, now), "September/Fall 2028");
});

test("an open deadline means resume this intake, and says which deadline", () => {
  const r = recommendRestart({
    currentIntake: "September/Fall 2027",
    mode: "single",
    options: SINGLE,
    deadlines: [
      { label: "Pre-enrolment (Universitaly)", date: "2027-06-30" },
      { label: "Politecnico di Torino application", date: "2027-04-01" },
    ],
    now: new Date("2027-03-01T06:00:00Z"),
  });
  assert.equal(r.action, "resume");
  assert.equal(r.intake, "September/Fall 2027");
  assert.match(r.because, /Politecnico di Torino application is still open \(2027-04-01\)/);
  assert.deepEqual(r.openDeadlines.map((d) => d.date), ["2027-04-01", "2027-06-30"]);
});

test("every deadline passed means defer, and names the last one", () => {
  const r = recommendRestart({
    currentIntake: "September/Fall 2027",
    mode: "single",
    options: SINGLE,
    deadlines: [{ label: "Pre-enrolment", date: "2026-12-01" }, { label: "Application", date: "2026-10-01" }],
    now: new Date("2027-03-01T06:00:00Z"),
  });
  assert.equal(r.action, "defer");
  assert.equal(r.intake, "September/Fall 2028");
  assert.match(r.because, /last was 2026-12-01/);
});

test("no recorded deadline admits it knows nothing rather than implying time has run out", () => {
  const r = recommendRestart({
    currentIntake: "September/Fall 2027",
    mode: "single",
    options: SINGLE,
    deadlines: [{ label: "Application", date: null }],
    now: new Date("2027-03-01T06:00:00Z"),
  });
  assert.equal(r.action, "defer");
  assert.match(r.because, /No admission, pre-enrolment or visa deadline is recorded/);
  assert.doesNotMatch(r.because, /passed/);
});

test("a deadline that is today is not still open", () => {
  const r = recommendRestart({
    currentIntake: "September/Fall 2027",
    mode: "single",
    options: SINGLE,
    deadlines: [{ label: "Application", date: "2027-03-01" }],
    // 06:00 UTC is 11:00 in Karachi on the 1st.
    now: new Date("2027-03-01T06:00:00Z"),
  });
  assert.equal(r.action, "defer");
});

test("the visa, the scholarship and their documents do not follow a student into a new intake", () => {
  for (const c of ["visa", "visa_sticker", "scholarship_documents", "scholarship"]) {
    assert.equal(categoryCarriesOver(c), false, c);
  }
  for (const c of ["admission", "attestation", "interview", "italian_translations", "travel", "enrollment", "other", null]) {
    assert.equal(categoryCarriesOver(c), true, String(c));
  }
});

test("only an approved document carries over, and not one flagged to be renewed", () => {
  const renew = new Set(["t-bank"]);
  const doc = (over) => ({ id: "d", cycle_id: "c1", category: "admission", template_id: "t-degree", status: "verified", ...over });
  assert.equal(documentCarriesOver(doc({}), renew), true);
  assert.equal(documentCarriesOver(doc({ template_id: "t-bank" }), renew), false);
  assert.equal(documentCarriesOver(doc({ status: "rejected" }), renew), false);
  assert.equal(documentCarriesOver(doc({ status: "missing" }), renew), false);
  assert.equal(documentCarriesOver(doc({ category: "visa" }), renew), false);
});

test("a new intake inherits last year's approved documents without re-asking", () => {
  const seq = new Map([["c1", 1], ["c2", 2]]);
  const docs = [
    { id: "d1", cycle_id: "c1", category: "admission", template_id: "t-degree", status: "verified" },
    { id: "d2", cycle_id: "c1", category: "admission", template_id: "t-bank", status: "verified" },
    { id: "d3", cycle_id: "c1", category: "visa", template_id: "t-visa-form", status: "verified" },
    { id: "d4", cycle_id: "c2", category: "admission", template_id: "t-bank", status: "missing" },
  ];
  const resolved = resolveCycleDocuments(docs, "c2", seq, new Set(["t-bank"]));
  const ids = resolved.map((r) => r.doc.id);
  assert.deepEqual(ids.sort(), ["d1", "d4"]);
  // The degree came from the earlier intake and says so; the bank statement
  // was asked for again in this one.
  assert.equal(resolved.find((r) => r.doc.id === "d1").inheritedFrom, 1);
  assert.equal(resolved.find((r) => r.doc.id === "d4").inheritedFrom, null);
});

test("an earlier intake's tab never shows a later intake's paperwork", () => {
  const seq = new Map([["c1", 1], ["c2", 2]]);
  const docs = [
    { id: "d1", cycle_id: "c1", category: "admission", template_id: "t-degree", status: "verified" },
    { id: "d2", cycle_id: "c2", category: "admission", template_id: "t-new", status: "verified" },
  ];
  assert.deepEqual(resolveCycleDocuments(docs, "c1", seq, new Set()).map((r) => r.doc.id), ["d1"]);
});

test("a document with no cycle at all is treated as the first intake's", () => {
  const seq = new Map([["c1", 1], ["c2", 2]]);
  const docs = [{ id: "d1", cycle_id: null, category: "admission", template_id: "t-degree", status: "verified" }];
  const resolved = resolveCycleDocuments(docs, "c2", seq, new Set());
  assert.deepEqual(resolved.map((r) => r.doc.id), ["d1"]);
  assert.equal(resolved[0].inheritedFrom, 1);
});

test("a requirement collected twice inherits the most recent approved copy", () => {
  const seq = new Map([["c1", 1], ["c2", 2], ["c3", 3]]);
  const docs = [
    { id: "old", cycle_id: "c1", category: "admission", template_id: "t-degree", status: "verified" },
    { id: "newer", cycle_id: "c2", category: "admission", template_id: "t-degree", status: "verified" },
  ];
  const resolved = resolveCycleDocuments(docs, "c3", seq, new Set());
  assert.deepEqual(resolved.map((r) => r.doc.id), ["newer"]);
  assert.equal(resolved[0].inheritedFrom, 2);
});
