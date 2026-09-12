import test from "node:test";
import assert from "node:assert/strict";
import { formatIntake, parseIntake, intakeError, intakeYearChoices, isIntakeMode } from "../src/lib/intake.ts";

const ONE = ["September/Fall"];
const TWO = ["Spring/Summer", "Fall/Winter"];

test("a single-intake destination writes the season and the year", () => {
  assert.equal(formatIntake("single", ONE, ["September/Fall"], "2027"), "September/Fall 2027");
});

test("two ticked intakes share one year, written once", () => {
  assert.equal(formatIntake("multi", TWO, ["Spring/Summer", "Fall/Winter"], "2027"), "Spring/Summer & Fall/Winter 2027");
});

test("seasons come out in the destination's order, not the order they were ticked", () => {
  assert.equal(formatIntake("multi", TWO, ["Fall/Winter", "Spring/Summer"], "2027"), "Spring/Summer & Fall/Winter 2027");
});

test("free text is passed through untouched", () => {
  assert.equal(formatIntake("free_text", [], [], "", "  January 2027  "), "January 2027");
});

test("nothing is written from an incomplete choice", () => {
  assert.equal(formatIntake("single", ONE, ["September/Fall"], ""), "");
  assert.equal(formatIntake("multi", TWO, [], "2027"), "");
});

test("a value this widget wrote reads straight back", () => {
  assert.deepEqual(parseIntake("September/Fall 2027", ONE), { seasons: ["September/Fall"], year: "2027", freeText: "September/Fall 2027" });
  assert.deepEqual(parseIntake("Spring/Summer & Fall/Winter 2027", TWO).seasons, ["Spring/Summer", "Fall/Winter"]);
});

test("reading back tolerates the separators people actually type", () => {
  for (const sep of ["&", ",", "and", "+"]) {
    const parsed = parseIntake(`Spring/Summer ${sep} Fall/Winter 2027`, TWO);
    assert.deepEqual(parsed.seasons, ["Spring/Summer", "Fall/Winter"], sep);
    assert.equal(parsed.year, "2027", sep);
  }
  assert.deepEqual(parseIntake("fall/winter 2027", TWO).seasons, ["Fall/Winter"]);
});

test("what is already in the column survives as free text rather than vanishing", () => {
  // The two real values in production. Neither matches a configured season,
  // and losing a student's intake because it was spelled unusually would be
  // worse than showing it in a box.
  for (const legacy of ["Fall 27", "Fall 2027"]) {
    const parsed = parseIntake(legacy, TWO);
    assert.deepEqual(parsed.seasons, []);
    assert.equal(parsed.freeText, legacy);
  }
});

test("a half-recognised value is not silently truncated", () => {
  // "Fall/Winter" matches, "Whenever" does not — taking only the half that
  // parsed would quietly drop the rest of what somebody wrote.
  const parsed = parseIntake("Fall/Winter & Whenever 2027", TWO);
  assert.deepEqual(parsed.seasons, []);
  assert.equal(parsed.freeText, "Fall/Winter & Whenever 2027");
});

test("an empty value is empty, not a stray year", () => {
  assert.deepEqual(parseIntake(null, TWO), { seasons: [], year: "", freeText: "" });
  assert.deepEqual(parseIntake("   ", TWO), { seasons: [], year: "", freeText: "" });
});

test("what has to be filled in before it can be saved", () => {
  assert.equal(intakeError("free_text", [], "", ""), null);
  assert.match(intakeError("multi", [], "", ""), /year/i);
  assert.match(intakeError("multi", [], "2027", ""), /at least one/i);
  assert.match(intakeError("single", [], "2027", ""), /Setup/);
  assert.match(intakeError("single", ["September/Fall"], "27", ""), /four digits/);
  assert.equal(intakeError("single", ["September/Fall"], "2027", ""), null);
});

test("the years offered run one back and four ahead", () => {
  const years = intakeYearChoices(new Date("2026-09-13T00:00:00Z"));
  assert.deepEqual(years, ["2025", "2026", "2027", "2028", "2029", "2030"]);
});

test("only the three modes are modes", () => {
  assert.ok(isIntakeMode("single") && isIntakeMode("multi") && isIntakeMode("free_text"));
  assert.ok(!isIntakeMode("whenever"));
});

test("a round trip through both directions is stable", () => {
  const written = formatIntake("multi", TWO, ["Fall/Winter", "Spring/Summer"], "2028");
  const read = parseIntake(written, TWO);
  assert.equal(formatIntake("multi", TWO, read.seasons, read.year), written);
});
