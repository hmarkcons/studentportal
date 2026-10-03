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
