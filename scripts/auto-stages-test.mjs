// Stages that move by themselves (src/lib/autoStages.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { planAutoStages, mayAdvance, acceptanceStage } from "../src/lib/autoStages.ts";

const ITALY_STAGES = [
  { key: "admission_docs", label: "Admission Docs", type: "checkbox", options: ["Completed"] },
  { key: "admission", label: "Admission", type: "select", options: ["In process", "Issued"] },
  { key: "university_and_program", label: "University & Program", type: "checkbox", options: ["Selection Finalized"] },
  { key: "visa_docs", label: "Visa Docs", type: "checkbox", options: ["Completed"] },
  { key: "scholarship_docs", label: "Scholarship Docs", type: "checkbox", options: ["Completed"] },
  { key: "appointment", label: "Appointment", type: "checkbox", options: ["Booked"] },
  { key: "visa_app", label: "Visa App", type: "checkbox", options: ["Submitted"] },
  { key: "visa_status", label: "Visa Status", type: "select", options: ["Granted", "Rejected"] },
  { key: "travel", label: "Travel", type: "date", options: [] },
  { key: "enrollment", label: "Enrollment", type: "select", options: ["Completed", "Skip"] },
];
const ITALY_PIPELINE = ["documents_pending", "documents_verified", "application_submitted", "under_review", "acceptance_letter"];
const ITALY_TRACKER_FIELDS = [
  { key: "visa_docs_status", label: "Visa docs status", type: "select" },
  { key: "visa_appointment_status", label: "Visa appointment status", type: "select" },
  { key: "visa_appointment_date", label: "Visa appointment date", type: "date", isAppointment: true },
  { key: "visa_application_submitted", label: "Visa application submitted", type: "boolean" },
  { key: "visa_status", label: "Visa decision", type: "select", visaRole: "outcome" },
];

const base = (over = {}) => ({
  countries: [{ destinationId: "it", stages: ITALY_STAGES, values: {} }],
  applications: [{ id: "a1", destinationId: "it", stage: "documents_pending", pipeline: ITALY_PIPELINE, finalized: false }],
  documents: [],
  trackers: [{ destinationId: "it", fields: ITALY_TRACKER_FIELDS, values: {} }],
  ...over,
});
const countryValues = (plan) => plan.countries.find((c) => c.destinationId === "it")?.values ?? {};
const appTo = (plan, id = "a1") => plan.applications.find((a) => a.id === id)?.to ?? null;

test("forward only: fill an empty step, finish one under way, never undo or re-start", () => {
  assert.equal(mayAdvance(undefined, "Completed"), true);
  assert.equal(mayAdvance("In process", "Issued"), true);
  assert.equal(mayAdvance("Issued", "In process"), false);
  assert.equal(mayAdvance("Completed", "Completed"), false);
  assert.equal(mayAdvance("Rejected", "Granted"), false);
  assert.equal(mayAdvance("Skip", "Completed"), false);
  assert.equal(mayAdvance("In process", "In process"), false);
});

test("admission documents all approved: the country's step completes, the application reaches Documents Verified", () => {
  const plan = planAutoStages(base({
    documents: [
      { category: "admission", status: "verified", applicationId: null },
      { category: "admission", status: "verified", applicationId: "a1" },
    ],
  }));
  assert.equal(countryValues(plan).admission_docs, "Completed");
  assert.equal(appTo(plan), "documents_verified");
});

test("one admission document still missing: nothing moves", () => {
  const plan = planAutoStages(base({
    documents: [
      { category: "admission", status: "verified", applicationId: null },
      { category: "admission", status: "missing", applicationId: null },
    ],
  }));
  assert.equal(countryValues(plan).admission_docs, undefined);
  assert.equal(appTo(plan), null);
});

test("an application submitted puts Admission in process; the letter makes it Issued and moves the application", () => {
  const submitted = planAutoStages(base({
    applications: [{ id: "a1", destinationId: "it", stage: "application_submitted", pipeline: ITALY_PIPELINE, finalized: false }],
  }));
  assert.equal(countryValues(submitted).admission, "In process");

  const letter = planAutoStages(base({
    countries: [{ destinationId: "it", stages: ITALY_STAGES, values: { admission: "In process" } }],
    applications: [{ id: "a1", destinationId: "it", stage: "under_review", pipeline: ITALY_PIPELINE, finalized: false }],
    documents: [{ category: "acceptance_letters", status: "verified", applicationId: "a1" }],
  }));
  assert.equal(countryValues(letter).admission, "Issued");
  assert.equal(appTo(letter), "acceptance_letter");
});

test("the application moves to the letter stage its pipeline names, or else past review", () => {
  assert.equal(acceptanceStage(ITALY_PIPELINE), "acceptance_letter");
  assert.equal(acceptanceStage(["documents_pending", "application_submitted", "under_review", "conditional_offer", "cas_letter"]), "conditional_offer");
});

test("a partner university's offer letter counts as the letter", () => {
  const plan = planAutoStages(base({
    applications: [{ id: "a1", destinationId: "it", stage: "under_review", pipeline: ITALY_PIPELINE, finalized: false }],
    documents: [{ category: "offer_letter", status: "submitted", applicationId: "a1" }],
  }));
  assert.equal(appTo(plan), "acceptance_letter");
});

test("never moves an application backwards, or out of Rejected", () => {
  const ahead = planAutoStages(base({
    applications: [{ id: "a1", destinationId: "it", stage: "under_review", pipeline: ITALY_PIPELINE, finalized: false }],
    documents: [{ category: "admission", status: "verified", applicationId: null }],
  }));
  assert.equal(appTo(ahead), null);
  const rejected = planAutoStages(base({
    applications: [{ id: "a1", destinationId: "it", stage: "rejected", pipeline: ITALY_PIPELINE, finalized: false }],
    documents: [{ category: "acceptance_letters", status: "verified", applicationId: "a1" }],
  }));
  assert.equal(appTo(rejected), null);
});

test("finalising a university ticks University & Program", () => {
  const plan = planAutoStages(base({
    applications: [{ id: "a1", destinationId: "it", stage: "acceptance_letter", pipeline: ITALY_PIPELINE, finalized: true }],
  }));
  assert.equal(countryValues(plan).university_and_program, "Selection Finalized");
  assert.equal(countryValues(plan).admission, "Issued");
});

test("the visa tracker: appointment booked, application submitted, decision recorded", () => {
  const plan = planAutoStages(base({
    trackers: [{ destinationId: "it", fields: ITALY_TRACKER_FIELDS, values: {
      visa_docs_status: "Completed", visa_appointment_date: "2099-03-04", visa_application_submitted: "true", visa_status: "Approved",
    } }],
    applications: [{ id: "a1", destinationId: "it", stage: "acceptance_letter", pipeline: [...ITALY_PIPELINE, "visa_granted"], finalized: true }],
  }));
  const v = countryValues(plan);
  assert.equal(v.visa_docs, "Completed");
  assert.equal(v.appointment, "Booked");
  assert.equal(v.visa_app, "Submitted");
  assert.equal(v.visa_status, "Granted");
  assert.equal(appTo(plan), "visa_granted");
});

test("a refusal is recorded as the refusal, and never replaces a decision staff set", () => {
  const refused = planAutoStages(base({ trackers: [{ destinationId: "it", fields: ITALY_TRACKER_FIELDS, values: { visa_status: "Refused" } }] }));
  assert.equal(countryValues(refused).visa_status, "Rejected");
  const kept = planAutoStages(base({
    countries: [{ destinationId: "it", stages: ITALY_STAGES, values: { visa_status: "Granted" } }],
    trackers: [{ destinationId: "it", fields: ITALY_TRACKER_FIELDS, values: { visa_status: "Refused" } }],
  }));
  assert.equal(countryValues(kept).visa_status, "Granted");
});

test("a pending appointment status and an academic interview are not a booked visa appointment", () => {
  const pending = planAutoStages(base({ trackers: [{ destinationId: "it", fields: ITALY_TRACKER_FIELDS, values: { visa_appointment_status: "Pending" } }] }));
  assert.equal(countryValues(pending).appointment, undefined);
  const fr = planAutoStages(base({
    trackers: [{ destinationId: "it", fields: [{ key: "academic_interview_date", label: "Academic interview date", type: "date", isAppointment: true }], values: { academic_interview_date: "2099-01-01" } }],
  }));
  assert.equal(countryValues(fr).appointment, undefined);
});

test("travel and enrollment: a flight date in the tracker, enrollment documents approved", () => {
  const plan = planAutoStages(base({
    trackers: [{ destinationId: "it", fields: [{ key: "flight_date", label: "Flight date", type: "date" }], values: { flight_date: "2099-09-01" } }],
    documents: [{ category: "enrollment", status: "verified", applicationId: null }],
  }));
  assert.equal(countryValues(plan).travel, "2099-09-01");
  assert.equal(countryValues(plan).enrollment, "Completed");
});

test("a backup country moves on its own record, not the primary's", () => {
  const plan = planAutoStages({
    countries: [
      { destinationId: "it", stages: ITALY_STAGES, values: {} },
      { destinationId: "de", stages: ITALY_STAGES, values: {} },
    ],
    applications: [{ id: "a1", destinationId: "it", stage: "under_review", pipeline: ITALY_PIPELINE, finalized: false }],
    documents: [{ category: "acceptance_letters", status: "verified", applicationId: "a1" }],
    trackers: [],
  });
  assert.equal(plan.countries.find((c) => c.destinationId === "it")?.values.admission, "Issued");
  assert.equal(plan.countries.find((c) => c.destinationId === "de"), undefined);
});

test("running it again on its own result changes nothing", () => {
  const input = base({
    documents: [{ category: "admission", status: "verified", applicationId: null }],
    trackers: [{ destinationId: "it", fields: ITALY_TRACKER_FIELDS, values: { visa_status: "Approved" } }],
  });
  const first = planAutoStages(input);
  const again = planAutoStages({
    ...input,
    countries: [{ destinationId: "it", stages: ITALY_STAGES, values: countryValues(first) }],
    applications: input.applications.map((a) => ({ ...a, stage: appTo(first, a.id) ?? a.stage })),
  });
  assert.deepEqual(again, { countries: [], applications: [] });
});
