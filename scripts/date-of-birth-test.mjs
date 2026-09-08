import { test } from "node:test";
import assert from "node:assert/strict";
import { dateOfBirthError, dobMax, DOB_MIN } from "../src/lib/dateOfBirth.ts";

const dayOffset = (n) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

test("accepts a plausible date of birth", () => {
  assert.equal(dateOfBirthError("2001-04-17"), null);
});

test("accepts today, since a bound of today must not exclude it", () => {
  assert.equal(dateOfBirthError(dobMax()), null);
});

test("rejects tomorrow", () => {
  const err = dateOfBirthError(dayOffset(2));
  assert.match(err ?? "", /future/);
});

test("rejects the year that was actually on file", () => {
  // A registered student had 2026-09-21 stored, which is what prompted this.
  const err = dateOfBirthError("2036-09-21");
  assert.match(err ?? "", /future/);
});

test("rejects a year before 1900", () => {
  assert.match(dateOfBirthError("1899-12-31") ?? "", /too far in the past/);
});

test("accepts the lower bound itself", () => {
  assert.equal(dateOfBirthError(DOB_MIN), null);
});

test("rejects a malformed date", () => {
  for (const bad of ["17/04/2001", "2001-4-7", "not a date", "2001-04-17T00:00:00Z"]) {
    assert.match(dateOfBirthError(bad) ?? "", /valid date/, bad);
  }
});

test("treats empty and missing as not-an-error, leaving required-ness to the form", () => {
  for (const empty of ["", "   ", null, undefined]) {
    assert.equal(dateOfBirthError(empty), null);
  }
});

test("dobMax is a yyyy-mm-dd date in Karachi, not the server's timezone", () => {
  assert.match(dobMax(), /^\d{4}-\d{2}-\d{2}$/);
  const karachi = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
  assert.equal(dobMax(), karachi);
});
