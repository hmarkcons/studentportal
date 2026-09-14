import test from "node:test";
import assert from "node:assert/strict";
import { trackerValueFilled, parseMultiValue } from "../src/lib/trackerValue.ts";

test("an ordinary answer counts", () => {
  for (const v of ["IMAT", "2026-09-15", "Approved", "0", "false"]) {
    assert.equal(trackerValueFilled(v), true, v);
  }
});

test("nothing counts as nothing", () => {
  for (const v of ["", "   ", "\n", null, undefined]) {
    assert.equal(trackerValueFilled(v), false, JSON.stringify(v));
  }
});

test("an empty multi-select does not count as answered", () => {
  // This is the one that mattered: "[]" is four characters of nothing and used
  // to fill up the tracker's progress badge.
  assert.equal(trackerValueFilled("[]"), false);
  assert.equal(trackerValueFilled(" [] "), false);
  assert.equal(trackerValueFilled('["", "  "]'), false);
  assert.equal(trackerValueFilled("{}"), false);
});

test("a multi-select with something chosen does count", () => {
  assert.equal(trackerValueFilled('["IMAT"]'), true);
  assert.equal(trackerValueFilled('["IMAT","TOLC"]'), true);
  assert.equal(trackerValueFilled('{"a":1}'), true);
});

test("text that merely starts with a bracket still counts", () => {
  // Somebody typed it, so it is an answer.
  assert.equal(trackerValueFilled("[see attached]"), true);
  assert.equal(trackerValueFilled("[TBC"), true);
});

test("a multi-select value reads back as its choices", () => {
  assert.deepEqual(parseMultiValue('["IMAT","TOLC"]'), ["IMAT", "TOLC"]);
  assert.deepEqual(parseMultiValue("[]"), []);
});

test("an answer from when the field was a single select is not lost", () => {
  // The whole point: "CEnT-S" was stored unquoted while this was a plain
  // select. Reading it as nothing would drop a student's recorded test from
  // the form and then overwrite it on the next save.
  assert.deepEqual(parseMultiValue("CEnT-S"), ["CEnT-S"]);
  assert.deepEqual(parseMultiValue("IMAT"), ["IMAT"]);
});

test("blank and missing values read as no choices", () => {
  for (const v of ["", "   ", null, undefined]) {
    assert.deepEqual(parseMultiValue(v), [], JSON.stringify(v));
  }
});

test("blank entries inside a stored array are dropped", () => {
  assert.deepEqual(parseMultiValue('["IMAT","","TOLC"," "]'), ["IMAT", "TOLC"]);
});

test("a JSON scalar reads as one choice, not as nothing", () => {
  assert.deepEqual(parseMultiValue('"IMAT"'), ["IMAT"]);
});
