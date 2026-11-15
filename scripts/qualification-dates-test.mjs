// An education level's start and completion dates (0367), as the Academics
// form sends them (src/lib/qualifications.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { readQualificationDates } from "../src/lib/qualifications.ts";

test("both optional: blank is null", () => {
  assert.deepEqual(readQualificationDates("", ""), { start_date: null, completion_date: null });
  assert.deepEqual(readQualificationDates("  ", ""), { start_date: null, completion_date: null });
  assert.deepEqual(readQualificationDates("2018-09-01", ""), { start_date: "2018-09-01", completion_date: null });
  assert.deepEqual(readQualificationDates("", "2022-06-30"), { start_date: null, completion_date: "2022-06-30" });
});

test("a completion ahead of today is fine — studies under way", () => {
  assert.deepEqual(readQualificationDates("2025-09-01", "2029-06-30"), { start_date: "2025-09-01", completion_date: "2029-06-30" });
});

test("the same day is allowed; a completion before the start is not", () => {
  assert.deepEqual(readQualificationDates("2020-01-15", "2020-01-15"), { start_date: "2020-01-15", completion_date: "2020-01-15" });
  assert.match(readQualificationDates("2022-06-30", "2018-09-01").error, /before the start/);
});

test("anything that is not a real date is refused", () => {
  assert.match(readQualificationDates("2021-02-30", "").error, /start date is not a date/);
  assert.match(readQualificationDates("", "30/06/2022").error, /completion date is not a date/);
  assert.match(readQualificationDates("1899-01-01", "").error, /start date/);
  assert.match(readQualificationDates("", "2024-13-01").error, /completion date/);
});
