import { test } from "node:test";
import assert from "node:assert/strict";
import {
  describeChange,
  findNearMiss,
  isBlank,
  isNearMiss,
  mergeRow,
  nameTokens,
  normalizeName,
  osaDistance,
  renderCell,
} from "../src/lib/importMerge.ts";

// ------------------------------------------------------------------- names

test("the same name written two ways normalizes to one key", () => {
  assert.equal(normalizeName("  Sapienza   University of Rome "), "sapienza university of rome");
  assert.equal(normalizeName("SAPIENZA UNIVERSITY OF ROME"), normalizeName("Sapienza University of Rome"));
});

test("institution boilerplate and accents drop out of the identifying tokens", () => {
  assert.deepEqual(nameTokens("Università di Bologna"), ["bologna"]);
  assert.deepEqual(nameTokens("University of Bologna"), ["bologna"]);
  assert.deepEqual(nameTokens("Bologna University"), ["bologna"]);
});

test("words that really do distinguish institutions are kept", () => {
  // Dropping these would make the two read as the same place.
  assert.ok(nameTokens("Technical University of Munich").includes("technical"));
  assert.ok(nameTokens("Politecnico di Milano").includes("politecnico"));
  assert.ok(nameTokens("Imperial College London").includes("college"));
  assert.equal(isNearMiss("Technical University of Munich", "University of Munich"), false);
});

test("a transposition counts as one mistake, not two", () => {
  // The whole reason for OSA over plain Levenshtein: under Levenshtein this is
  // 2, the same as Padua to Pavia, and the two cases must not be equal.
  assert.equal(osaDistance("sapeinza", "sapienza"), 1);
  assert.equal(osaDistance("padua", "pavia"), 2);
});

test("an abbreviation is a near miss", () => {
  assert.ok(isNearMiss("Sapienza Univ. of Rome", "Sapienza University of Rome"));
});

test("word order and punctuation alone are a near miss", () => {
  assert.ok(isNearMiss("Politecnico Milano", "Politecnico di Milano"));
  assert.ok(isNearMiss("Milano, Politecnico", "Politecnico di Milano"));
});

test("a typo in the distinctive word is a near miss", () => {
  assert.ok(isNearMiss("Sapeinza University of Rome", "Sapienza University of Rome"));
  assert.ok(isNearMiss("University of Milan", "University of Milano"));
});

test("two genuinely different universities are NOT a near miss", () => {
  // Both real, both Italian, two letters apart. Holding one back as a probable
  // duplicate of the other would block a legitimate import every time.
  assert.equal(isNearMiss("University of Padua", "University of Pavia"), false);
  assert.equal(isNearMiss("University of Milan", "University of Turin"), false);
  assert.equal(isNearMiss("Technical University of Munich", "Technical University of Berlin"), false);
});

test("an exact match is a match, not a near miss", () => {
  assert.equal(isNearMiss("Sapienza University of Rome", "sapienza  university of rome"), false);
});

test("extra words are a different name, not a typo", () => {
  assert.equal(isNearMiss("Mathematics", "Mathematics and Physics"), false);
  assert.equal(isNearMiss("Computer Science", "Computer Science and Engineering"), false);
});

test("a plural is a near miss, a different subject is not", () => {
  assert.ok(isNearMiss("Computer Science", "Computer Sciences"));
  assert.equal(isNearMiss("Civil Engineering", "Chemical Engineering"), false);
});

test("findNearMiss names which stored row it nearly hit", () => {
  const stored = ["University of Padua", "Sapienza University of Rome", "Politecnico di Milano"];
  assert.equal(findNearMiss("Sapienza Univ. of Rome", stored), "Sapienza University of Rome");
  assert.equal(findNearMiss("University of Bologna", stored), null);
});

test("a name with nothing but boilerplate matches nothing", () => {
  assert.deepEqual(nameTokens("The University of"), []);
  assert.equal(isNearMiss("The University", "University of Padua"), false);
});

// ------------------------------------------------------------------ blanks

test("every shape of empty cell is blank", () => {
  assert.ok(isBlank(undefined));
  assert.ok(isBlank(null));
  assert.ok(isBlank(""));
  assert.ok(isBlank("   "));
  assert.ok(isBlank([]));
});

test("false is not blank", () => {
  // An interview_required cell reading "no" has to be able to turn a stored
  // "yes" off. Treating false as blank would make that impossible.
  assert.equal(isBlank(false), false);
  assert.equal(isBlank(0), false);
});

// ------------------------------------------------------------------- merge

const stored = {
  name: "Sapienza University of Rome",
  city: "Rome",
  region: "Lazio",
  type: "public",
  levels_offered: ["bachelors", "masters"],
  tuition_fee: 3000,
  interview_required: true,
};

test("a filled cell that differs is a change", () => {
  const { patch, changes } = mergeRow(stored, { city: "Milan" });
  assert.deepEqual(patch, { city: "Milan" });
  assert.deepEqual(changes, [{ field: "city", from: "Rome", to: "Milan" }]);
});

test("an empty cell leaves the stored value alone", () => {
  // The rule the whole feature turns on: a partial sheet must not wipe
  // everything it does not mention.
  const { patch, changes } = mergeRow(stored, { city: "Milan", region: "", type: undefined, levels_offered: [] });
  assert.deepEqual(patch, { city: "Milan" });
  assert.equal(changes.length, 1);
});

test("a cell that matches what is stored is not a change", () => {
  // An UPDATE writing a column back to its own value still lands in the audit
  // log, so re-importing an unchanged sheet has to be a genuine no-op.
  const { patch, changes } = mergeRow(stored, { city: "Rome", region: "Lazio", type: "public" });
  assert.deepEqual(patch, {});
  assert.deepEqual(changes, []);
});

test("a number compares numerically, not as text", () => {
  assert.deepEqual(mergeRow(stored, { tuition_fee: 3000 }).changes, []);
  assert.deepEqual(mergeRow({ ...stored, tuition_fee: "3000" }, { tuition_fee: 3000 }).changes, []);
  assert.equal(mergeRow(stored, { tuition_fee: 3500 }).changes.length, 1);
});

test("a list is replaced wholesale, not merged", () => {
  const { patch } = mergeRow(stored, { levels_offered: ["masters", "phd"] });
  assert.deepEqual(patch, { levels_offered: ["masters", "phd"] });
});

test("a list in the same order is not a change", () => {
  assert.deepEqual(mergeRow(stored, { levels_offered: ["bachelors", "masters"] }).changes, []);
});

test("an explicit no turns a stored yes off", () => {
  const { patch, changes } = mergeRow(stored, { interview_required: false });
  assert.deepEqual(patch, { interview_required: false });
  assert.deepEqual(changes, [{ field: "interview_required", from: true, to: false }]);
});

test("a field the stored row has never had is added", () => {
  const sparse = { name: "X", city: "Rome", region: null };
  const { patch, changes } = mergeRow(sparse, { region: "Lazio" });
  assert.deepEqual(patch, { region: "Lazio" });
  assert.deepEqual(changes, [{ field: "region", from: null, to: "Lazio" }]);
});

// ------------------------------------------------------------------ report

test("a change reads as old to new", () => {
  assert.equal(describeChange({ field: "city", from: "Rome", to: "Milan" }), "city Rome → Milan");
});

test("an absent value reads as a dash rather than null", () => {
  assert.equal(renderCell(null), "—");
  assert.equal(renderCell([]), "—");
  assert.equal(renderCell(""), "—");
  assert.equal(renderCell(["a", "b"]), "a; b");
  assert.equal(renderCell(false), "no");
  assert.equal(renderCell(0), "0");
});
