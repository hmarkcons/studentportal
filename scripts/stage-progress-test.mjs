import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStageRows, stageDistribution, stageSnapshot } from "../src/lib/stageProgress.ts";
import { canWorkProcessing, seesStagesOnly } from "../src/lib/auth/studentAccess.ts";

const STAGES = [
  { key: "admission_docs", label: "Admission Docs", type: "checkbox", options: ["Completed"] },
  { key: "admission", label: "Admission", type: "select", options: ["In process", "Issued"] },
  { key: "visa_status", label: "Visa Status", type: "select", options: ["Granted", "Rejected"] },
  { key: "travel", label: "Travel", type: "date", options: [] },
];
const OTHER = [{ key: "x", label: "Only stage", type: "checkbox", options: ["Done"] }];

// ------------------------------------------------------------------- rows

test("a country with applications comes first and names its university", () => {
  const rows = buildStageRows(
    [{ destinationId: "it", destinationName: "Italy", stages: STAGES, universityName: "Bologna" }],
    [
      { destinationId: "de", destinationName: "Germany", stages: OTHER, values: {} },
      { destinationId: "it", destinationName: "Italy", stages: STAGES, values: { admission_docs: "Completed" } },
    ]
  );
  assert.deepEqual(
    rows.map((r) => [r.destinationName, r.applicationSummary]),
    [
      ["Italy", "Bologna"],
      ["Germany", "No application yet"],
    ]
  );
  assert.deepEqual(rows[0].values, { admission_docs: "Completed" }, "values come from the registration row");
});

test("several applications in one country are counted, and a country without stages is left out", () => {
  const rows = buildStageRows(
    [
      { destinationId: "it", destinationName: "Italy", stages: STAGES, universityName: "Bologna" },
      { destinationId: "it", destinationName: "Italy", stages: STAGES, universityName: "Padova" },
      { destinationId: "xx", destinationName: "Nowhere", stages: [], universityName: "U" },
    ],
    []
  );
  assert.deepEqual(
    rows.map((r) => [r.destinationName, r.applicationSummary]),
    [["Italy", "2 applications"]]
  );
  assert.deepEqual(rows[0].values, {}, "no registration row means nothing recorded");
});

// --------------------------------------------------------------- snapshot

test("the current stage is the first with nothing recorded", () => {
  const s = stageSnapshot(STAGES, { admission_docs: "Completed", admission: "Issued" });
  assert.equal(s.done, 2);
  assert.equal(s.total, 4);
  assert.equal(s.currentLabel, "Visa Status");
  assert.equal(s.complete, false);
  assert.equal(s.latest, "Admission: Issued");
  assert.equal(s.blocked, false);
});

test("a refusal as the latest value marks the student as stuck", () => {
  const s = stageSnapshot(STAGES, { admission_docs: "Completed", admission: "Issued", visa_status: "Rejected" });
  assert.equal(s.blocked, true);
  assert.equal(s.latest, "Visa Status: Rejected");
});

test("every stage recorded reads as complete; none recorded as not started at the first", () => {
  const all = { admission_docs: "Completed", admission: "Issued", visa_status: "Granted", travel: "2027-09-01" };
  assert.equal(stageSnapshot(STAGES, all).currentLabel, "Complete");
  assert.equal(stageSnapshot(STAGES, all).complete, true);
  const none = stageSnapshot(STAGES, {});
  assert.equal(none.currentLabel, "Admission Docs");
  assert.equal(none.latest, null);
  assert.equal(stageSnapshot([], {}).currentLabel, "Not started");
});

test("students are counted at the stage they are on, the finished ones last", () => {
  const dist = stageDistribution(STAGES, [
    {},
    { admission_docs: "Completed" },
    { admission_docs: "Completed" },
    { admission_docs: "Completed", admission: "Issued", visa_status: "Granted", travel: "2027-09-01" },
  ]);
  assert.deepEqual(dist, [
    { label: "Admission Docs", count: 1 },
    { label: "Admission", count: 2 },
    { label: "Visa Status", count: 0 },
    { label: "Travel", count: 0 },
    { label: "Complete", count: 1 },
  ]);
});

// ------------------------------------------------------------------ access

test("a counsellor on their own sees stages only; any processing role lifts it", () => {
  assert.equal(seesStagesOnly({ role: "counselor", roles: ["counselor"] }), true);
  assert.equal(seesStagesOnly({ role: "counselor", roles: ["counselor", "processing"] }), false);
  assert.equal(seesStagesOnly({ role: "counselor", roles: ["counselor", "management"] }), false);
  assert.equal(seesStagesOnly({ role: "counselor", roles: ["counselor", "finance"] }), false, "finance keeps what it had");
  assert.equal(seesStagesOnly({ role: "marketing", roles: ["marketing"] }), false, "not a counsellor: not this rule");
  assert.equal(seesStagesOnly({ role: "counselor" }), true, "the primary role alone still counts");
});

test("processing work is for processing, management, Super Admin and finance", () => {
  for (const r of ["processing", "management", "super_admin", "finance"]) assert.equal(canWorkProcessing({ role: r, roles: [r] }), true, r);
  for (const r of ["counselor", "marketing", "digital_marketing"]) assert.equal(canWorkProcessing({ role: r, roles: [r] }), false, r);
});
