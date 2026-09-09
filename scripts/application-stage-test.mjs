import { test } from "node:test";
import assert from "node:assert/strict";
import { categorizeApplicationStage } from "../src/lib/applicationStage.ts";

// The real pipelines, copied from destinations.pipeline_stages. The point of
// these tests is that "success" cannot be a fixed stage name: only 6 of the 20
// destinations have an "enrolled" stage at all.
const ITALY = ["documents_pending", "documents_verified", "application_submitted", "under_review", "acceptance_letter"];
const UK = ["documents_pending", "documents_verified", "application_submitted", "under_review", "conditional_offer", "credibility_interview", "unconditional_offer", "tuition_fee_payment", "cas_proofread", "cas_letter"];
const HUNGARY = ["documents_pending", "documents_verified", "application_submitted", "under_review", "conditional_offer_received", "unconditional_offer_received", "offer_accepted", "visa_documentation_in_progress", "visa_filed", "visa_interview_scheduled", "visa_granted", "enrolled"];
const US = ["documents_pending", "documents_verified", "application_submitted", "under_review", "offer_letter", "tuition_fee_(optional)", "i20_letter"];

test("a destination whose pipeline ends before 'enrolled' can still succeed", () => {
  // This is the case that was broken: Siena has a live application at
  // acceptance_letter, and the report counted zero successes for it because
  // Italy's pipeline has no "enrolled" stage.
  assert.equal(categorizeApplicationStage("acceptance_letter", ITALY), "with_offer");
  assert.equal(categorizeApplicationStage("cas_letter", UK), "with_offer");
  assert.equal(categorizeApplicationStage("i20_letter", US), "with_offer");
  assert.equal(categorizeApplicationStage("enrolled", HUNGARY), "with_offer");
});

test("the first offer stage already counts, not just the last", () => {
  assert.equal(categorizeApplicationStage("conditional_offer", UK), "with_offer");
  assert.equal(categorizeApplicationStage("conditional_offer_received", HUNGARY), "with_offer");
  assert.equal(categorizeApplicationStage("offer_letter", US), "with_offer");
});

test("everything up to and including under_review is not yet an offer", () => {
  for (const pipeline of [ITALY, UK, HUNGARY, US]) {
    assert.equal(categorizeApplicationStage("documents_pending", pipeline), "pending");
    assert.equal(categorizeApplicationStage("documents_verified", pipeline), "pending");
    assert.equal(categorizeApplicationStage("application_submitted", pipeline), "submitted");
    assert.equal(categorizeApplicationStage("under_review", pipeline), "submitted");
  }
});

test("rejected, declined and withdrawn are told apart, whatever the pipeline", () => {
  for (const pipeline of [ITALY, UK, HUNGARY, US]) {
    assert.equal(categorizeApplicationStage("rejected", pipeline), "rejected");
    assert.equal(categorizeApplicationStage("declined", pipeline), "not_eligible");
    assert.equal(categorizeApplicationStage("withdrawn", pipeline), "withdrawn");
  }
});

test("an 'enrolled' stage in a pipeline that has none is not treated as an offer", () => {
  // Guards the inverse mistake: hardcoding "enrolled" as success everywhere.
  // Italy never issues it, so a row carrying it is bad data, not a win.
  assert.notEqual(categorizeApplicationStage("enrolled", ITALY), "with_offer");
});

test("an unknown stage falls back to pending rather than being counted as a win", () => {
  assert.equal(categorizeApplicationStage("some_stage_nobody_configured", ITALY), "pending");
  assert.equal(categorizeApplicationStage("", ITALY), "pending");
});

test("an empty pipeline does not manufacture offers", () => {
  // A destination whose pipeline_stages failed to load must not make every
  // application look successful.
  assert.equal(categorizeApplicationStage("acceptance_letter", []), "pending");
});
