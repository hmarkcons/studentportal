import test from "node:test";
import assert from "node:assert/strict";
import {
  trackerSuggestion,
  trackerSuggestions,
  ieltsBand,
  admissionTests,
  scholarshipDocsStatus,
} from "../src/lib/trackerPrefill.ts";

// The fields as they actually stand on Italy's tracker.
const ELIGIBLE = { key: "eligible_fields", type: "text", options: null };
const IELTS = { key: "ielts_score", type: "select", options: ["5.0", "5.5", "6.0", "6.5", "7.0", "7.5", "8.0", "8.5", "9.0"] };
const TESTS = { key: "test_status", type: "multi_select", options: ["IMAT", "TOLC", "CEnT-S", "SAT", "Other"] };
const SCH = { key: "scholarship_docs_status", type: "select", options: ["Completed", "Pending", "In process", "Apostille in progress", "Translation in progress"] };
const REFUSAL = { key: "visa_refusal_reason", type: "textarea", options: null };

test("the course of interest fills the eligible fields", () => {
  const s = trackerSuggestion(ELIGIBLE, { courseOfInterest: "Environmental management / Env. Sciences" });
  assert.equal(s.value, "Environmental management / Env. Sciences");
  assert.match(s.from, /course of interest/);
});

test("a finalised course beats the one they first asked about", () => {
  const s = trackerSuggestion(ELIGIBLE, {
    courseOfInterest: "IT",
    finalizedCourseOfInterest: "MSc Data Science",
  });
  assert.equal(s.value, "MSc Data Science");
  assert.match(s.from, /finalised/);
});

test("nothing on the profile suggests nothing", () => {
  assert.equal(trackerSuggestion(ELIGIBLE, {}), null);
  assert.equal(trackerSuggestion(ELIGIBLE, { courseOfInterest: "   " }), null);
});

// ------------------------------------------------------------------- IELTS
test("a bare 6 becomes the band the dropdown spells", () => {
  // Scores are stored as free text; production holds "6", not "6.0".
  assert.equal(ieltsBand("6", IELTS.options), "6.0");
  assert.equal(ieltsBand("7.5", IELTS.options), "7.5");
  assert.equal(ieltsBand(" 8 ", IELTS.options), "8.0");
});

test("a score that is not a band is not rounded into one", () => {
  // Rounding 6.25 up to 6.5 would hand the student a band they do not hold.
  assert.equal(ieltsBand("6.25", IELTS.options), null);
  assert.equal(ieltsBand("4.5", IELTS.options), null);
  assert.equal(ieltsBand("banana", IELTS.options), null);
  assert.equal(ieltsBand(null, IELTS.options), null);
});

test("the IELTS row is the one used, not whichever score came first", () => {
  const s = trackerSuggestion(IELTS, {
    testScores: [
      { testType: "cent_s", score: "46" },
      { testType: "ielts", score: "6.5" },
    ],
  });
  assert.equal(s.value, "6.5");
});

// --------------------------------------------------------- admission tests
test("recorded admission tests are ticked", () => {
  assert.deepEqual(admissionTests([{ testType: "cent_s", score: "46" }], TESTS.options), ["CEnT-S"]);
  assert.deepEqual(
    admissionTests([{ testType: "IMAT", score: "40" }, { testType: "sat", score: "1300" }], TESTS.options),
    ["IMAT", "SAT"]
  );
});

test("a language test is never ticked as an admission test", () => {
  // IELTS and Duolingo live in the same table. Ticking Duolingo under
  // "Admission tests" would follow the student to the university's checklist.
  assert.deepEqual(
    admissionTests([{ testType: "ielts", score: "6" }, { testType: "duolingo", score: "115" }], TESTS.options),
    []
  );
});

test("a test the list does not name counts as Other, once", () => {
  assert.deepEqual(
    admissionTests([{ testType: "gre", score: "320" }, { testType: "gmat", score: "700" }], TESTS.options),
    ["Other"]
  );
});

test("ticks come out in the list's own order, not the order they were entered", () => {
  assert.deepEqual(
    admissionTests([{ testType: "sat", score: "1300" }, { testType: "imat", score: "40" }], TESTS.options),
    ["IMAT", "SAT"]
  );
});

test("the multi-select suggestion is the JSON the field stores", () => {
  const s = trackerSuggestion(TESTS, { testScores: [{ testType: "cent_s", score: "46" }] });
  assert.equal(s.value, '["CEnT-S"]');
});

test("no admission test recorded suggests nothing at all", () => {
  assert.equal(trackerSuggestion(TESTS, { testScores: [{ testType: "ielts", score: "6" }] }), null);
  assert.equal(trackerSuggestion(TESTS, {}), null);
});

// --------------------------------------------------- scholarship documents
test("the scholarship status is read off the checklist", () => {
  assert.equal(scholarshipDocsStatus({ required: 3, uploaded: 3, verified: 3 }, SCH.options), "Completed");
  assert.equal(scholarshipDocsStatus({ required: 3, uploaded: 2, verified: 1 }, SCH.options), "In process");
  assert.equal(scholarshipDocsStatus({ required: 3, uploaded: 0, verified: 0 }, SCH.options), "Pending");
});

test("a checklist with nothing required says nothing", () => {
  assert.equal(scholarshipDocsStatus({ required: 0, uploaded: 0, verified: 0 }, SCH.options), null);
  assert.equal(scholarshipDocsStatus(undefined, SCH.options), null);
});

// --------------------------------------------------------- refusal history
test("the refusal history is offered with a warning attached", () => {
  const s = trackerSuggestion(REFUSAL, { visaRefusalHistory: "Refused 2024, insufficient funds" });
  assert.equal(s.value, "Refused 2024, insufficient funds");
  // The field is shown to the student; the history was written for staff.
  assert.match(s.from, /the student sees this/);
});

// ------------------------------------------------------------- the whole set
test("only empty fields are suggested for", () => {
  const source = { courseOfInterest: "IT", testScores: [{ testType: "ielts", score: "6" }] };
  const out = trackerSuggestions([ELIGIBLE, IELTS], { eligible_fields: "Computer Science" }, source);
  assert.equal(out.eligible_fields, undefined, "a field staff filled in is left alone");
  assert.equal(out.ielts_score.value, "6.0");
});

test("an emptied multi-select still counts as empty", () => {
  // Clearing every tick leaves "[]" behind, not "".
  const out = trackerSuggestions([TESTS], { test_status: "[]" }, { testScores: [{ testType: "imat", score: "40" }] });
  assert.equal(out.test_status.value, '["IMAT"]');
});

test("a suggestion identical to what is there is not offered", () => {
  const out = trackerSuggestions([ELIGIBLE], { eligible_fields: "" }, { courseOfInterest: "IT" });
  assert.equal(out.eligible_fields.value, "IT");
  const same = trackerSuggestions([ELIGIBLE], { eligible_fields: "IT" }, { courseOfInterest: "IT" });
  assert.equal(same.eligible_fields, undefined);
});

test("fields with no source are never suggested for", () => {
  // translation_status among them: nothing in the record knows it.
  const out = trackerSuggestions(
    [{ key: "translation_status", type: "select", options: ["In progress", "Completed", "Pending"] }],
    {},
    { courseOfInterest: "IT", testScores: [{ testType: "ielts", score: "6" }] }
  );
  assert.deepEqual(out, {});
});
