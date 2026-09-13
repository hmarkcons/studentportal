import test from "node:test";
import assert from "node:assert/strict";
import { currentAcademicYear, academicYearStart, guideFreshness, academicYearLabel } from "../src/lib/academicYear.ts";

const on = (iso) => new Date(`${iso}T06:00:00Z`);

test("the academic year turns over in May", () => {
  assert.equal(currentAcademicYear(on("2026-04-30")), "2025/2026");
  assert.equal(currentAcademicYear(on("2026-05-01")), "2026/2027");
  assert.equal(currentAcademicYear(on("2026-09-13")), "2026/2027");
  assert.equal(currentAcademicYear(on("2026-12-31")), "2026/2027");
  assert.equal(currentAcademicYear(on("2027-01-01")), "2026/2027");
  assert.equal(currentAcademicYear(on("2027-05-01")), "2027/2028");
});

test("the turnover is measured on the office's clock, not the server's", () => {
  // 30 April 23:00 UTC is already 1 May in Karachi, and the office's day is
  // the one that decides.
  assert.equal(currentAcademicYear(new Date("2026-04-30T19:00:00Z")), "2026/2027");
  assert.equal(currentAcademicYear(new Date("2026-04-30T18:00:00Z")), "2025/2026");
});

test("a stored year is read however it was written", () => {
  assert.equal(academicYearStart("2026/2027"), 2026);
  assert.equal(academicYearStart("2026/27"), 2026);
  assert.equal(academicYearStart("A.Y. 2026 / 2027"), 2026);
  assert.equal(academicYearStart("2026-2027"), 2026);
  assert.equal(academicYearStart("2026"), 2026);
  assert.equal(academicYearStart(""), null);
  assert.equal(academicYearStart(null), null);
  assert.equal(academicYearStart("next year"), null);
});

test("a guide for this year is current", () => {
  assert.deepEqual(guideFreshness("2026/2027", on("2026-09-13")), { state: "current" });
});

test("a guide for an earlier year is stale, and says how far behind", () => {
  const f = guideFreshness("2025/2026", on("2026-09-13"));
  assert.equal(f.state, "stale");
  assert.equal(f.behindBy, 1);
  assert.equal(f.expected, "2026/2027");
});

test("the same guide goes stale on its own the day the year turns", () => {
  // Nobody edits anything — the calendar does it.
  assert.equal(guideFreshness("2026/2027", on("2027-04-30")).state, "current");
  assert.equal(guideFreshness("2026/2027", on("2027-05-01")).state, "stale");
});

test("a guide for next year is ahead, not a problem", () => {
  // A region that publishes early is the office being on top of it.
  assert.equal(guideFreshness("2027/2028", on("2026-09-13")).state, "ahead");
});

test("a year nobody can read is unknown rather than stale", () => {
  // Calling it stale would send somebody to re-do work that may be fine.
  assert.equal(guideFreshness(null, on("2026-09-13")).state, "unknown");
  assert.equal(guideFreshness("", on("2026-09-13")).state, "unknown");
});

test("the label is built from the starting year", () => {
  assert.equal(academicYearLabel(2026), "2026/2027");
  assert.equal(academicYearLabel(2099), "2099/2100");
});
