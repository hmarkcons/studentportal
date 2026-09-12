import { test } from "node:test";
import assert from "node:assert/strict";
import { TEST_TYPES, testScoreHint } from "../src/lib/testScores.ts";

// ------------------------------------------------- the database's own list
// A tripwire, not a preference. student_test_scores_test_type_check names the
// same twelve values (migration 0167), and the two lists have already drifted
// once: GMAT and CEnT-S were added to the picker and not to the constraint, so
// choosing either failed at the moment of saving, after the score and the date
// had been typed. If this test fails because you added a test type, the change
// is not finished until a migration widens that constraint too.
test("the test types match the database CHECK constraint", () => {
  assert.deepEqual(
    [...TEST_TYPES],
    ["ielts", "toefl", "pte", "duolingo", "langcert", "ib", "moi", "gre", "gmat", "sat", "cent_s", "other"],
    "add a migration widening student_test_scores_test_type_check before changing this"
  );
});

test("every test carries an example on its own scale", () => {
  // 7.5 is a good IELTS and a meaningless GRE; one placeholder for all twelve
  // invites the wrong scale to be typed in and stored as text.
  for (const t of TEST_TYPES) {
    const hint = testScoreHint(t);
    assert.ok(hint && hint.length > 3, t);
  }
  assert.match(testScoreHint("ielts"), /0–9/);
  assert.match(testScoreHint("toefl"), /0–120/);
  assert.match(testScoreHint("sat"), /400–1600/);
});

test("no range is claimed where the scale is not one number", () => {
  // GMAT's classic total runs to 800 and GMAT Focus to 805 — printing a wrong
  // boundary is worse than printing none. MOI is a letter, not a score.
  assert.ok(!testScoreHint("gmat").includes("–"), testScoreHint("gmat"));
  assert.ok(!testScoreHint("moi").includes("–"), testScoreHint("moi"));
});

test("an unknown test still gets a usable hint", () => {
  assert.ok(testScoreHint("something_new").length > 3);
});
