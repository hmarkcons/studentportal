// Tests ticked in a documentation tracker: which options are tests, how a
// high-school mark is read, and when CEnT-S starts ticked.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  admissionTestPreTick,
  highSchoolPercent,
  isTestOptionList,
  testTypeForOption,
  trackerTestField,
  trackerTestFieldType,
} from "../src/lib/trackerTests.ts";

test("a tracker option is read as the test it names", () => {
  assert.equal(testTypeForOption("CEnT-S"), "cent_s");
  assert.equal(testTypeForOption("SAT"), "sat");
  assert.equal(testTypeForOption("IMAT"), "imat");
  assert.equal(testTypeForOption("TOLC"), "tolc");
  assert.equal(testTypeForOption("Other"), "other");
  assert.equal(testTypeForOption("Embassy appointment"), null);
});

test("a field is a test field when it names a test, not just Other", () => {
  assert.equal(isTestOptionList(["IMAT", "TOLC", "CEnT-S", "SAT", "Other"]), true);
  assert.equal(isTestOptionList(["Other"]), false);
  assert.equal(isTestOptionList(["Passport", "Transcript"]), false);
});

test("a ticked test's date and score are posted under its own names, and read back", () => {
  assert.equal(trackerTestField.date("cent_s"), "tracker_test_date__cent_s");
  assert.equal(trackerTestFieldType("tracker_test_score__sat"), "sat");
  assert.equal(trackerTestFieldType("tracker_test_score__nonsense"), null);
  assert.equal(trackerTestFieldType("test_status"), null);
});

test("a high-school mark is read as a percentage, and a GPA is not one", () => {
  assert.equal(highSchoolPercent("65%"), 65);
  assert.equal(highSchoolPercent("65.5 %"), 65.5);
  assert.equal(highSchoolPercent("72"), 72);
  assert.equal(highSchoolPercent("Marks: 69%"), 69);
  assert.equal(highSchoolPercent("3.4"), null, "a GPA");
  assert.equal(highSchoolPercent("A*"), null);
  assert.equal(highSchoolPercent(""), null);
  assert.equal(highSchoolPercent("850/1100"), null, "not a percentage");
});

test("CEnT-S starts ticked for an Italy bachelors student below 70%, and only then", () => {
  const below = admissionTestPreTick({ countryCode: "IT", level: "bachelors", highSchool: "65%" });
  assert.deepEqual(below?.options, ["CEnT-S"]);
  assert.match(below?.reason ?? "", /65% — below 70%/);
  assert.equal(admissionTestPreTick({ countryCode: "IT", level: "bachelors", highSchool: "70%" }), null, "70% is not below 70%");
  assert.equal(admissionTestPreTick({ countryCode: "IT", level: "masters", highSchool: "60%" }), null);
  assert.equal(admissionTestPreTick({ countryCode: "DE", level: "bachelors", highSchool: "60%" }), null);
  assert.equal(admissionTestPreTick({ countryCode: "IT", level: "bachelors", highSchool: null }), null, "no mark, no guess");
});

test("the tests ticked in the trackers, as the tests they are", async () => {
  const { trackerSelectedTests } = await import("../src/lib/trackerTests.ts");
  const fields = [
    { field_key: "test_status", options: ["IMAT", "TOLC", "CEnT-S", "SAT", "Other"] },
    { field_key: "translation_status", options: ["In progress", "Completed"] },
  ];
  const picked = trackerSelectedTests(fields, [
    { field_key: "test_status", field_value: '["IMAT","CEnT-S"]' },
    { field_key: "test_status", field_value: '["IMAT"]' },
    { field_key: "translation_status", field_value: "Completed" },
    { field_key: "test_status", field_value: "" },
  ]);
  assert.deepEqual(picked.map((t) => t.type), ["imat", "cent_s"], "each test once, across applications; other fields ignored");
  assert.deepEqual(trackerSelectedTests(fields, [{ field_key: "test_status", field_value: '["Other"]' }]).map((t) => t.type), ["other"]);
  assert.deepEqual(trackerSelectedTests(fields, []), []);
});

test("a checklist item that is a test is told apart from one that only mentions tests", async () => {
  const { testTypeOfChecklistItem } = await import("../src/lib/trackerTests.ts");
  assert.equal(testTypeOfChecklistItem("CEnT-S"), "cent_s");
  assert.equal(testTypeOfChecklistItem("IMAT result"), "imat");
  assert.equal(testTypeOfChecklistItem("TOLC — score report"), "tolc");
  assert.equal(testTypeOfChecklistItem("SAT score (College Board)"), "sat");
  assert.equal(testTypeOfChecklistItem("English Language Certificate (MOI/IELTS/PTE/TOEFL/Etc.)"), null);
  assert.equal(testTypeOfChecklistItem("Satisfactory bank statement"), null);
  assert.equal(testTypeOfChecklistItem("Other"), null);
  assert.equal(testTypeOfChecklistItem(null), null);
});

test("a ticked test's scorecard is asked for at once, one per test however often it is sat", async () => {
  const { profileDerivedRequirements } = await import("../src/lib/documentChecklist.ts");
  const base = { qualifications: [], travelHistoryCount: 0, visaHistoryCount: 0 };
  const ticked = profileDerivedRequirements({ ...base, testScores: [], trackerTests: [{ type: "imat" }] });
  assert.deepEqual(ticked.map((r) => [r.derivedKey, r.name]), [["test:imat", "IMAT — scorecard"]], "ticked, no score yet");
  const retest = profileDerivedRequirements({
    ...base,
    testScores: [{ id: "a", test_type: "ielts" }, { id: "b", test_type: "ielts" }],
    trackerTests: [{ type: "ielts" }],
  });
  assert.equal(retest.length, 1, "a retest is a second file, not a second requirement");
  const covered = profileDerivedRequirements({ ...base, testScores: [], trackerTests: [{ type: "cent_s" }, { type: "sat" }], coveredTestTypes: new Set(["cent_s"]) });
  assert.deepEqual(covered.map((r) => r.derivedKey), ["test:sat"], "CEnT-S is asked for by the country's own item");
  const others = profileDerivedRequirements({ ...base, testScores: [{ id: "o", test_type: "other", custom_test_name: "NTS GAT" }], trackerTests: [{ type: "other" }] });
  assert.deepEqual(others.map((r) => r.name), ["NTS GAT — scorecard"], "a ticked Other is the one named on the Profile");
});
