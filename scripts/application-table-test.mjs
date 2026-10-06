// The applications table: its columns and their arranged order, and how a
// stage reads — colour, progress, group — and where an application sorts.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APPLICATION_COLUMNS,
  compareApplications,
  orderedApplicationColumns,
  readApplicationColumnOrder,
  stageGroup,
  stageHue,
  stageLabel,
  stageOptions,
  stageProgress,
} from "../src/lib/applicationTable.ts";

const italy = ["documents_pending", "documents_verified", "application_submitted", "under_review", "acceptance_letter", "pre_enrolled", "visa_filed"];
const usa = ["documents_pending", "application_submitted", "i20_letter", "visa_interview_scheduled", "visa_granted"];

test("a saved order keeps only real columns, each once", () => {
  assert.deepEqual(readApplicationColumnOrder(["stage", "nonsense", "stage", "student"]), ["stage", "student"]);
  assert.equal(readApplicationColumnOrder("stage"), null);
  assert.equal(readApplicationColumnOrder([]), null);
});

test("the arranged order comes first, anything it does not name keeps its place after", () => {
  const all = orderedApplicationColumns(["stage", "student"], "all").map((c) => c.key);
  assert.deepEqual(all.slice(0, 2), ["stage", "student"]);
  assert.equal(all.length, APPLICATION_COLUMNS.filter((c) => c.scope !== "student").length, "every column of this screen, once");
  assert.equal(all.includes("priority"), false, "priority is the student's tab's alone");
  const student = orderedApplicationColumns(null, "student").map((c) => c.key);
  assert.equal(student.includes("student"), false, "no Student column on a student's own tab");
  assert.equal(student[0], "priority");
});

test("the stage list offers the country's stages, then the closing results", () => {
  const keys = stageOptions(italy).map((o) => o.key);
  assert.deepEqual(keys.slice(-3), ["rejected", "declined", "withdrawn"]);
  assert.equal(keys.includes("pre_enrolled"), false, "Pre-Enrolled comes from finalising, not from the list");
  assert.equal(stageOptions(italy, "pre_enrolled").some((o) => o.key === "pre_enrolled"), true, "...unless it is where the application stands");
  assert.equal(stageLabel("declined"), "Not eligible");
  assert.equal(stageLabel("pre_enrolled"), "Pre-Enrolled");
  assert.equal(stageLabel("under_review"), "Under Review");
});

test("an offer or anything after it is accepted; rejection and withdrawal close it", () => {
  assert.equal(stageGroup("documents_pending", italy), "progress");
  assert.equal(stageGroup("under_review", italy), "progress");
  assert.equal(stageGroup("acceptance_letter", italy), "accepted");
  assert.equal(stageGroup("visa_filed", italy), "accepted");
  assert.equal(stageGroup("application_submitted", usa), "progress");
  assert.equal(stageGroup("i20_letter", usa), "accepted", "a country with no Under Review starts at its first offer-like stage");
  assert.equal(stageGroup("rejected", italy), "rejected");
  assert.equal(stageGroup("withdrawn", italy), "closed");
  assert.equal(stageGroup("declined", italy), "closed");
});

test("each kind of stage has its own colour", () => {
  const hues = ["documents_pending", "documents_verified", "application_submitted", "under_review", "conditional_offer", "acceptance_letter", "tuition_fee_payment", "coe", "pre_enrolled", "visa_filed", "visa_granted", "credibility_interview", "legalization_in_process", "rejected", "withdrawn"].map(stageHue);
  assert.deepEqual(hues, ["amber", "lime", "sky", "indigo", "lime", "green", "orange", "cyan", "teal", "blue", "emerald", "fuchsia", "violet", "red", "slate"]);
  assert.ok(new Set(hues).size >= 12, "not three colours: a dozen and more");
});

test("progress is the step along the country's stages; a closing result has none", () => {
  assert.deepEqual(stageProgress("under_review", italy), { step: 4, of: 7 });
  assert.equal(stageProgress("rejected", italy), null);
});

test("offers sort first and rejections last, each student's together", () => {
  const row = (studentName, stage, sortOrder = null, createdAt = "2026-01-01") => ({ studentName, stage, pipeline: italy, sortOrder, createdAt });
  const rows = [
    row("Zara", "rejected"),
    row("Ali", "documents_pending", 2),
    row("Bilal", "acceptance_letter"),
    row("Ali", "under_review", 1),
    row("Ali", "withdrawn"),
    row("Zara", "pre_enrolled"),
  ].sort(compareApplications);
  assert.deepEqual(
    rows.map((r) => `${r.studentName} ${r.stage}`),
    ["Bilal acceptance_letter", "Zara pre_enrolled", "Ali under_review", "Ali documents_pending", "Ali withdrawn", "Zara rejected"]
  );
});
