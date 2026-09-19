import { test } from "node:test";
import assert from "node:assert/strict";
import { pickProcessingOfficer, distributeProcessingOfficers } from "../src/lib/processingHandoff.ts";

// The counselor owns a lead; the Processing Team owns a registered student.
// That handoff was specified but never built — the officer was a dropdown
// nobody filled, so every registered student had none and the deadline
// reminders fell back to emailing the whole team.

const officer = (id, full_name, students) => ({ id, full_name, students });

test("the lightest caseload takes the next student", () => {
  const chosen = pickProcessingOfficer([
    officer("a", "Imran Ali", 7),
    officer("b", "Sara Khan", 2),
    officer("c", "Bilal Ahmed", 5),
  ]);
  assert.equal(chosen, "b");
});

test("a tie breaks on name, so the same inputs always give the same answer", () => {
  // Not arbitrary: a handoff that shuffles with row order is impossible to
  // explain when somebody asks why a student went where they did.
  const byName = pickProcessingOfficer([officer("z", "Zara", 3), officer("a", "Adil", 3)]);
  assert.equal(byName, "a");
  const reversed = pickProcessingOfficer([officer("a", "Adil", 3), officer("z", "Zara", 3)]);
  assert.equal(reversed, "a");
});

test("nobody to hand to means nobody is invented", () => {
  // The reminder fallback already copes with an unowned student; a made-up
  // owner would be worse than none.
  assert.equal(pickProcessingOfficer([]), null);
});

test("a single officer takes everything, which is today's situation", () => {
  assert.equal(pickProcessingOfficer([officer("a", "Imran Ali", 40)]), "a");
});

// ------------------------------------------------------------- a whole batch
test("a batch is spread, not dumped on the lightest one", () => {
  const plan = distributeProcessingOfficers(
    ["s1", "s2", "s3", "s4"],
    [officer("a", "Adil", 0), officer("b", "Bushra", 0)]
  );
  const perOfficer = plan.reduce((acc, p) => ({ ...acc, [p.officerId]: (acc[p.officerId] ?? 0) + 1 }), {});
  assert.deepEqual(perOfficer, { a: 2, b: 2 });
});

test("a batch levels an uneven starting point before sharing out", () => {
  // Adil already holds three; the first two students go to Bushra to catch up.
  const plan = distributeProcessingOfficers(
    ["s1", "s2", "s3"],
    [officer("a", "Adil", 3), officer("b", "Bushra", 1)]
  );
  assert.deepEqual(plan.map((p) => p.officerId), ["b", "b", "a"]);
});

test("every student in the batch is placed", () => {
  const plan = distributeProcessingOfficers(["s1", "s2", "s3", "s4", "s5"], [officer("a", "Adil", 0)]);
  assert.equal(plan.length, 5);
  assert.deepEqual([...new Set(plan.map((p) => p.studentId))].length, 5);
});

test("a batch with nobody to hand to places nobody", () => {
  assert.deepEqual(distributeProcessingOfficers(["s1", "s2"], []), []);
});

test("an empty batch is not an error", () => {
  assert.deepEqual(distributeProcessingOfficers([], [officer("a", "Adil", 0)]), []);
});

test("the caller's officer list is not mutated", () => {
  // distribute counts as it goes; doing that on the caller's objects would
  // corrupt a list reused for a second batch.
  const officers = [officer("a", "Adil", 0), officer("b", "Bushra", 0)];
  distributeProcessingOfficers(["s1", "s2", "s3"], officers);
  assert.deepEqual(officers.map((o) => o.students), [0, 0]);
});
