// The step a finalized university puts a student on (src/lib/finalizedStage.ts).
import test from "node:test";
import assert from "node:assert/strict";
import {
  applicationStageLabel,
  autoShortName,
  finalizedStageFor,
  finalizedStageIn,
  isFinalizedStage,
  planFinalizedUndo,
  stageBeforeFinalized,
  universityShortName,
  SHORT_NAME_MAX,
} from "../src/lib/finalizedStage.ts";

test("Italy is Pre-Enrolled, every other country University Finalized", () => {
  assert.equal(finalizedStageFor("IT").label, "Pre-Enrolled");
  assert.equal(finalizedStageFor("it").key, "pre_enrolled");
  assert.equal(finalizedStageFor("DE").label, "University Finalized");
  assert.equal(finalizedStageFor(null).key, "university_finalized");
  assert.equal(isFinalizedStage("pre_enrolled"), true);
  assert.equal(isFinalizedStage("university_finalized"), true);
  assert.equal(isFinalizedStage("university_and_program"), false);
  assert.equal(isFinalizedStage(null), false);
});

test("the stage in a pipeline, and the one before it", () => {
  const pipeline = ["documents_pending", "under_review", "acceptance_letter", "pre_enrolled"];
  assert.equal(finalizedStageIn(pipeline), "pre_enrolled");
  assert.equal(stageBeforeFinalized(pipeline), "acceptance_letter");
  assert.equal(finalizedStageIn(["documents_pending"]), null);
  assert.equal(stageBeforeFinalized(["pre_enrolled"]), null);
});

test("stage labels read as words, the new one with its hyphen", () => {
  assert.equal(applicationStageLabel("pre_enrolled"), "Pre-Enrolled");
  assert.equal(applicationStageLabel("university_finalized"), "University Finalized");
  assert.equal(applicationStageLabel("under_review"), "Under Review");
  assert.equal(applicationStageLabel("coe"), "Coe");
});

test("a short name staff gave wins; a short full name is left exactly as it is", () => {
  assert.equal(universityShortName("Università degli Studi di Messina", "UniMe"), "UniMe");
  assert.equal(universityShortName("Università degli Studi di Messina", "  "), "Università di Messina");
  assert.equal(universityShortName("Aalto University", null), "Aalto University");
});

test("a long name is shortened the way a person would", () => {
  // The part of a double name that says which university.
  assert.equal(autoShortName("Alma Mater Studiorum – Università di Bologna"), "Università di Bologna");
  // "degli Studi" goes first.
  assert.equal(autoShortName("Università degli Studi di Milano-Bicocca"), "Università di Milano-Bicocca");
  // Then University and the like are abbreviated.
  assert.equal(autoShortName("Budapest University of Technology and Economics"), "Budapest Univ. of Tech. & Econ.");
});

test("never longer than the limit, never cut mid-word, never ending on a dangling word", () => {
  for (const name of [
    "Alexandru Ioan Cuza University of Iași",
    "Budapest University of Economics and Business",
    "Hochschule für Technik und Wirtschaft Berlin – University of Applied Sciences",
    "Supercalifragilisticexpialidociousuniversityofnowhere",
  ]) {
    const short = autoShortName(name);
    assert.ok(short.length <= SHORT_NAME_MAX, `${short} is ${short.length} long`);
    assert.ok(!/\s(of|di|&|and)…$/.test(short), `${short} ends on a dangling word`);
  }
  assert.equal(autoShortName("Alexandru Ioan Cuza University of Iași"), "Alexandru Ioan Cuza Univ…");
});

test("un-finalizing: the application goes back a stage, the country's step is cleared", () => {
  const pipeline = ["under_review", "acceptance_letter", "pre_enrolled"];
  const plan = planFinalizedUndo(
    [
      { id: "a1", destinationId: "it", stage: "pre_enrolled", pipeline, finalized: false },
      { id: "a2", destinationId: "it", stage: "under_review", pipeline, finalized: false },
    ],
    [{ destinationId: "it", values: { admission: "Issued", pre_enrolled: "Pre-Enrolled" } }]
  );
  assert.deepEqual(plan.applications, [{ id: "a1", from: "pre_enrolled", to: "acceptance_letter" }]);
  assert.deepEqual(plan.countries, [{ destinationId: "it", values: { admission: "Issued" }, cleared: ["pre_enrolled"] }]);
});

test("while a university is still finalized there, nothing comes off", () => {
  const pipeline = ["acceptance_letter", "university_finalized"];
  const plan = planFinalizedUndo(
    [
      { id: "a1", destinationId: "de", stage: "university_finalized", pipeline, finalized: true },
      { id: "a2", destinationId: "fr", stage: "acceptance_letter", pipeline, finalized: false },
    ],
    [
      { destinationId: "de", values: { university_finalized: "Finalized" } },
      { destinationId: "fr", values: { admission: "Issued" } },
    ]
  );
  assert.deepEqual(plan, { applications: [], countries: [] });
});
