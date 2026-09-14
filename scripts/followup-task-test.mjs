import test from "node:test";
import assert from "node:assert/strict";
import {
  CHASE_AFTER_DAYS,
  WINBACK_AFTER_DAYS,
  GHOST_CHASE_SOURCE,
  WINBACK_SOURCE,
  SYSTEM_TASK_SOURCES,
  followUpDueDate,
  planFollowUp,
} from "../src/lib/followUpTasks.ts";

const ON = "2026-09-14";

test("a chase is soon and a win-back is not", () => {
  assert.equal(CHASE_AFTER_DAYS, 3);
  assert.equal(WINBACK_AFTER_DAYS, 14);
  assert.ok(WINBACK_AFTER_DAYS > CHASE_AFTER_DAYS, "calling someone days after they said no is pressure");
});

test("due dates are calendar arithmetic, not milliseconds", () => {
  assert.equal(followUpDueDate("2026-09-14", 3), "2026-09-17");
  assert.equal(followUpDueDate("2026-09-14", 14), "2026-09-28");
  assert.equal(followUpDueDate("2026-12-30", 3), "2027-01-02");
  assert.equal(followUpDueDate("2028-02-27", 3), "2028-03-01", "2028 is a leap year");
  // Across the dates other countries change their clocks.
  assert.equal(followUpDueDate("2026-03-27", 3), "2026-03-30");
  assert.equal(followUpDueDate("2026-10-23", 3), "2026-10-26");
});

test("a malformed date yields no due date rather than a wrong one", () => {
  for (const bad of ["", "  ", "14/09/2026", "2026-09", "soon", null, undefined]) {
    assert.equal(followUpDueDate(bad, 3), "", String(bad));
  }
});

test("a ghosted student gets a chase, urgent and in three days", () => {
  const p = planFollowUp("ghost", "Kamran Aslam Butt", ON);
  assert.equal(p.source, GHOST_CHASE_SOURCE);
  assert.equal(p.title, "Chase Kamran — gone quiet");
  assert.equal(p.dueDate, "2026-09-17");
  assert.equal(p.priority, "urgent");
});

test("a withdrawn student gets a win-back, not urgent and in two weeks", () => {
  const p = planFollowUp("withdrawn", "Kamran Aslam Butt", ON);
  assert.equal(p.source, WINBACK_SOURCE);
  assert.equal(p.title, "Win back Kamran — withdrew");
  assert.equal(p.dueDate, "2026-09-28");
  assert.equal(p.priority, "medium", "they made a decision; this is not an emergency");
});

test("a registered student gets nothing", () => {
  for (const status of ["registered", null, undefined, "", "something_else"]) {
    assert.equal(planFollowUp(status, "Kamran", ON), null, String(status));
  }
});

test("the two read differently, so neither is mistaken for the other", () => {
  const chase = planFollowUp("ghost", "Kamran", ON);
  const winback = planFollowUp("withdrawn", "Kamran", ON);
  assert.notEqual(chase.title, winback.title);
  assert.notEqual(chase.source, winback.source);
  // A chase is about reaching them at all.
  assert.match(chase.description, /call/i);
  assert.match(chase.description, /WhatsApp/);
  assert.match(chase.description, /emergency contact/);
  // A win-back is about why they left.
  assert.match(winback.description, /what actually changed/);
  assert.match(winback.description, /fees, family, a different country/);
  assert.doesNotMatch(winback.description, /emergency contact/, "that would be pursuing, not asking");
});

test("both say how to bring the student back", () => {
  // The two are worded differently on purpose, so this checks the reassurance
  // is there rather than that both use the same sentence: nothing is lost by
  // coming back, which is what makes the phone call easy to make.
  for (const status of ["ghost", "withdrawn"]) {
    const p = planFollowUp(status, "Kamran", ON);
    assert.match(p.description, /Start the process again/, status);
    assert.match(p.description, /document/i, status);
    assert.match(p.description, /applications/, status);
  }
});

test("both say when to stop, so neither becomes a loop", () => {
  // A ghosted student who is not coming back gets moved to Withdrawn.
  assert.match(planFollowUp("ghost", "Kamran", ON).description, /set them to Withdrawn so they stop being chased/);
  // A withdrawn student who is firm is left alone.
  const winback = planFollowUp("withdrawn", "Kamran", ON).description;
  assert.match(winback, /mark this done and leave them alone/);
  assert.match(winback, /one conversation is a service, three is a nuisance/);
});

test("the title falls back readably when there is no name", () => {
  for (const blank of ["", "   ", null, undefined]) {
    assert.equal(planFollowUp("ghost", blank, ON).title, "Chase this student — gone quiet", String(blank));
    assert.equal(planFollowUp("withdrawn", blank, ON).title, "Win back this student — withdrew", String(blank));
  }
});

test("a description never opens with an empty name", () => {
  assert.match(planFollowUp("ghost", null, ON).description, /^This student was marked as ghosted/);
  assert.match(planFollowUp("withdrawn", null, ON).description, /^This student withdrew/);
});

test("extra spacing in a name does not leak into the title", () => {
  assert.equal(planFollowUp("ghost", "  Kamran   Aslam  ", ON).title, "Chase Kamran — gone quiet");
});

test("the date the status changed is stated, so the task ages honestly", () => {
  assert.match(planFollowUp("ghost", "Kamran", "2026-09-14").description, /on 2026-09-14/);
  assert.match(planFollowUp("withdrawn", "Kamran", "2026-09-14").description, /withdrew on 2026-09-14/);
});

test("the source tags are the ones the migration indexes on", () => {
  assert.equal(GHOST_CHASE_SOURCE, "ghost_chase");
  assert.equal(WINBACK_SOURCE, "winback");
  assert.deepEqual([...SYSTEM_TASK_SOURCES], ["ghost_chase", "winback"]);
});

test("every system source is reachable from planFollowUp", () => {
  // Or a source would exist that nothing opens and the close logic would be
  // clearing a kind of task that never appears.
  const produced = new Set(
    ["ghost", "withdrawn"].map((s) => planFollowUp(s, "Kamran", ON).source)
  );
  for (const source of SYSTEM_TASK_SOURCES) {
    assert.ok(produced.has(source), `nothing opens ${source}`);
  }
});
