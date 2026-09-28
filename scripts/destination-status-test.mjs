// A registered student's per-country status bars (src/lib/destinationStatus.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { stageTone, destinationStages, destinationStatusRows, destinationHeadline } from "../src/lib/destinationStatus.ts";

const ITALY = [
  { key: "admission_docs", label: "Admission Docs", type: "checkbox", options: ["Completed"] },
  { key: "admission", label: "Admission", type: "select", options: ["In process", "Issued"] },
  { key: "university_and_program", label: "University & Program", type: "checkbox", options: ["Selection Finalized"] },
  { key: "visa_status", label: "Visa Status", type: "select", options: ["Granted", "Rejected"] },
  { key: "travel", label: "Travel", type: "date", options: [] },
];

test("a value says whether the stage is done, under way, stopped or skipped", () => {
  assert.equal(stageTone("Completed"), "done");
  assert.equal(stageTone("Selection Finalized"), "done");
  assert.equal(stageTone("Granted"), "done");
  assert.equal(stageTone("In process"), "progress");
  assert.equal(stageTone("Unpaid"), "progress");
  assert.equal(stageTone("Pending"), "progress");
  assert.equal(stageTone("Parked"), "progress");
  assert.equal(stageTone("Rejected"), "blocked");
  assert.equal(stageTone("Fail"), "blocked");
  assert.equal(stageTone("Skip"), "skipped");
  assert.equal(stageTone("Not required"), "skipped");
  assert.equal(stageTone(""), null);
  assert.equal(stageTone(null), null);
});

test("the first empty stage is next, the rest ahead", () => {
  const s = destinationStages(ITALY, { admission_docs: "Completed", admission: "In process" });
  assert.deepEqual(s.map((x) => x.state), ["done", "progress", "next", "ahead", "ahead"]);
});

test("a travel date is spelled out", () => {
  const s = destinationStages(ITALY, { travel: "2099-09-01" });
  assert.equal(s.find((x) => x.key === "travel").display, "Sep 1, 2099");
});

test("primary first, then each backup in the order added, then a country only applied to", () => {
  const rows = destinationStatusRows(
    [
      { destinationId: "de", isBackup: true, createdAt: "2099-01-02", values: null, name: "Germany (Public)", code: "DE", stages: ITALY },
      { destinationId: "hu", isBackup: true, createdAt: "2099-01-01", values: null, name: "Hungary (Public)", code: "HU", stages: ITALY },
      { destinationId: "it", isBackup: false, createdAt: "2099-01-03", values: { admission_docs: "Completed" }, name: "Italy (Public)", code: "IT", stages: ITALY },
    ],
    [
      { destinationId: "it", name: "Italy (Public)", code: "IT", stages: ITALY, university: "Messina" },
      { destinationId: "fr", name: "France (Public)", code: "FR", stages: ITALY, university: "Sorbonne" },
    ]
  );
  assert.deepEqual(rows.map((r) => [r.destinationId, r.role]), [["it", "primary"], ["hu", "backup"], ["de", "backup"], ["fr", "applied"]]);
  assert.equal(rows[0].summary, "Messina");
  assert.equal(rows[1].summary, "No application yet");
});

test("progress counts done and skipped stages, not ones under way", () => {
  const [row] = destinationStatusRows(
    [{ destinationId: "it", isBackup: false, values: { admission_docs: "Completed", admission: "In process" }, name: "Italy", code: "IT", stages: ITALY }],
    []
  );
  assert.equal(row.done, 1);
  assert.equal(row.total, 5);
  assert.equal(row.percent, 20);
  assert.equal(row.current.key, "admission");
  assert.equal(destinationHeadline(row), "Now: Admission — In process");
});

test("a refusal stops the bar and says so", () => {
  const [row] = destinationStatusRows(
    [{ destinationId: "it", isBackup: false, values: { admission_docs: "Completed", admission: "Issued", university_and_program: "Selection Finalized", visa_status: "Rejected" }, name: "Italy", code: "IT", stages: ITALY }],
    []
  );
  assert.equal(row.current.key, "visa_status");
  assert.equal(destinationHeadline(row), "Visa Status: Rejected");
});

test("every stage done reads as complete; no stages reads as not set up", () => {
  const all = Object.fromEntries(ITALY.map((s) => [s.key, s.type === "date" ? "2099-09-01" : s.options.at(-1) === "Rejected" ? "Granted" : s.options.at(-1)]));
  const [done] = destinationStatusRows([{ destinationId: "it", isBackup: false, values: all, name: "Italy", code: "IT", stages: ITALY }], []);
  assert.equal(done.current, null);
  assert.equal(done.percent, 100);
  assert.equal(destinationHeadline(done), "Every step is complete");
  const [bare] = destinationStatusRows([{ destinationId: "x", isBackup: true, values: null, name: "X", code: null, stages: [] }], []);
  assert.equal(bare.percent, 0);
  assert.match(destinationHeadline(bare), /counsellor will show each step/);
});
