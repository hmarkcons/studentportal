import { test } from "node:test";
import assert from "node:assert/strict";
import { dateOfBirthError, dobMax, DOB_MIN, DOB_MIN_AGE_YEARS } from "../src/lib/dateOfBirth.ts";

const karachiToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
const shiftYears = (n) => {
  const [y, m, d] = karachiToday().split("-");
  return `${Number(y) + n}-${m}-${d}`;
};

test("accepts a plausible date of birth", () => {
  assert.equal(dateOfBirthError("2001-04-17"), null);
});

test("accepts the oldest date that still meets the minimum age", () => {
  assert.equal(dateOfBirthError(dobMax()), null);
});

test("rejects today, which is what the picker actually defaulted to", () => {
  assert.match(dateOfBirthError(karachiToday()) ?? "", /too recent/);
});

test("rejects a date in the future, and says so specifically", () => {
  assert.match(dateOfBirthError(shiftYears(2)) ?? "", /future/);
});

test("rejects each of the four values that were really on file", () => {
  // Rashid Meer, Saboor Khan, summro, Syed Taimoor Nawaz Ali — every one of
  // these was accepted before, and two of them survived a future-only check.
  for (const dob of ["2026-09-16", "2026-09-21", "2026-09-09", "2026-09-09"]) {
    assert.notEqual(dateOfBirthError(dob), null, dob);
  }
});

test("rejects someone a year under the minimum age", () => {
  assert.match(dateOfBirthError(shiftYears(-(DOB_MIN_AGE_YEARS - 1))) ?? "", /too recent/);
});

test("accepts a school leaver, who is the youngest real applicant", () => {
  assert.equal(dateOfBirthError(shiftYears(-16)), null);
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

test("dobMax is a yyyy-mm-dd date derived from Karachi's day, not the server's", () => {
  assert.match(dobMax(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(dobMax(), shiftYears(-DOB_MIN_AGE_YEARS));
});

test("dobMax is a date that really exists, even ten years back from a leap day", () => {
  // 2018-02-29 does not exist; browsers discard an invalid max and leave the
  // input unbounded, so this must not be built by string arithmetic.
  const [y, m, d] = dobMax().split("-").map(Number);
  const round = new Date(Date.UTC(y, m - 1, d));
  assert.equal(round.getUTCFullYear(), y);
  assert.equal(round.getUTCMonth() + 1, m);
  assert.equal(round.getUTCDate(), d);
});
