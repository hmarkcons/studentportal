import test from "node:test";
import assert from "node:assert/strict";
import {
  CHASE_AFTER_DAYS,
  GHOST_CHASE_SOURCE,
  chaseDueDate,
  chaseTaskTitle,
  chaseTaskDescription,
} from "../src/lib/chaseTask.ts";

test("the chase falls due three days after going quiet", () => {
  assert.equal(CHASE_AFTER_DAYS, 3);
  assert.equal(chaseDueDate("2026-09-14"), "2026-09-17");
});

test("three days later crosses a month and a year correctly", () => {
  assert.equal(chaseDueDate("2026-09-29"), "2026-10-02");
  assert.equal(chaseDueDate("2026-12-30"), "2027-01-02");
  assert.equal(chaseDueDate("2028-02-27"), "2028-03-01", "2028 is a leap year");
  assert.equal(chaseDueDate("2027-02-27"), "2027-03-02");
});

test("a clock change cannot move the due date by a day", () => {
  assert.equal(chaseDueDate("2026-03-27"), "2026-03-30");
  assert.equal(chaseDueDate("2026-10-23"), "2026-10-26");
});

test("a malformed date yields no due date rather than a wrong one", () => {
  for (const bad of ["", "  ", "14/09/2026", "2026-09", "soon", null, undefined]) {
    assert.equal(chaseDueDate(bad), "", String(bad));
  }
});

test("the title uses the first name, because it is a note to self", () => {
  assert.equal(chaseTaskTitle("Ahmed Raza Khan"), "Chase Ahmed — gone quiet");
  assert.equal(chaseTaskTitle("Ahmed"), "Chase Ahmed — gone quiet");
});

test("a missing name still produces a readable title", () => {
  for (const blank of ["", "   ", null, undefined]) {
    assert.equal(chaseTaskTitle(blank), "Chase this student — gone quiet", String(blank));
  }
});

test("extra spacing in a name does not leak into the title", () => {
  assert.equal(chaseTaskTitle("  Ahmed   Raza  "), "Chase Ahmed — gone quiet");
});

test("the description says what to try, and both ways out", () => {
  const d = chaseTaskDescription("Ahmed Raza", "2026-09-14");
  assert.match(d, /Ahmed Raza was marked as ghosted on 2026-09-14\./);
  // What to actually do.
  assert.match(d, /call/i);
  assert.match(d, /WhatsApp/);
  assert.match(d, /emergency contact/);
  // Both endings, so the task cannot become a loop.
  assert.match(d, /Start the process again/);
  assert.match(d, /Withdrawn/);
  // And the reassurance that makes the ask easy.
  assert.match(d, /documents and last intake's applications are all still there/);
});

test("a missing name does not produce a sentence starting with nothing", () => {
  assert.match(chaseTaskDescription(null, "2026-09-14"), /^This student was marked as ghosted/);
});

test("the source tag is the one the migration indexes on", () => {
  assert.equal(GHOST_CHASE_SOURCE, "ghost_chase");
});
