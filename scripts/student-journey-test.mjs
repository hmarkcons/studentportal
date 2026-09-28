// A registered student's journey on their dashboard, and what is coming up.
import test from "node:test";
import assert from "node:assert/strict";
import { studentJourney, upcomingTimeline, daysLeftLabel } from "../src/lib/studentJourney.ts";

const ITALY = ["documents_pending", "documents_verified", "application_submitted", "under_review", "acceptance_letter"];
const app = (stage, extra = {}) => ({ stage, stages: ITALY, finalized: false, university: "Università di Pavia", ...extra });
const base = {
  studentCode: "HMC-F26-IT-0042",
  agreement: { signed: false, started: false },
  documents: { total: 0, verified: 0, waiting: 0, inReview: 0 },
  applications: [],
  visa: { approved: [], refused: [] },
  travel: null,
};
const states = (j) => j.steps.map((s) => `${s.key}:${s.state}`).join(" ");

test("a student just registered is at the agreement", () => {
  const j = studentJourney(base);
  assert.equal(states(j), "registered:done agreement:current documents:upcoming applied:upcoming admission:upcoming visa:upcoming travel:upcoming");
  assert.equal(j.done, 1);
  assert.equal(j.percent, 14);
  assert.equal(j.next.key, "agreement");
  assert.equal(j.steps[0].detail, "Student ID HMC-F26-IT-0042");
  assert.equal(j.next.detail, "HMARK is preparing it");
});

test("documents are done only when every one is approved, and say what is left", () => {
  const signed = { ...base, agreement: { signed: true, started: true } };
  let j = studentJourney({ ...signed, documents: { total: 12, verified: 8, waiting: 2, inReview: 2 } });
  assert.equal(j.next.key, "documents");
  assert.equal(j.next.detail, "2 documents to upload");
  assert.equal(j.next.progress, 8 / 12);
  j = studentJourney({ ...signed, documents: { total: 12, verified: 10, waiting: 0, inReview: 2 } });
  assert.equal(j.next.detail, "2 being checked");
  j = studentJourney({ ...signed, documents: { total: 12, verified: 12, waiting: 0, inReview: 0 } });
  assert.equal(j.steps[2].state, "done");
  assert.equal(j.steps[2].detail, "All 12 approved");
});

test("no document rows yet is not 'all approved'", () => {
  const j = studentJourney({ ...base, agreement: { signed: true, started: true } });
  assert.equal(j.steps[2].state, "current");
  assert.equal(j.steps[2].detail, "Your list is being prepared");
});

test("steps are ticked as they happen, even out of order, and the first undone is current", () => {
  // Applied before every document is approved — which is how it goes.
  const j = studentJourney({
    ...base,
    agreement: { signed: true, started: true },
    documents: { total: 10, verified: 9, waiting: 1, inReview: 0 },
    applications: [app("under_review")],
  });
  assert.equal(states(j), "registered:done agreement:done documents:current applied:done admission:upcoming visa:upcoming travel:upcoming");
  assert.equal(j.steps[3].detail, "1 application submitted");
  assert.equal(j.steps[4].detail, "Waiting for a decision");
});

test("an application still being prepared is not submitted", () => {
  const j = studentJourney({ ...base, applications: [app("documents_verified")] });
  assert.equal(j.steps[3].state, "upcoming");
  assert.equal(j.steps[3].detail, "HMARK is preparing your applications");
});

test("admission is a stage past review, or a finalised application", () => {
  assert.equal(studentJourney({ ...base, applications: [app("acceptance_letter")] }).steps[4].state === "done", true);
  assert.equal(studentJourney({ ...base, applications: [app("documents_pending", { finalized: true })] }).steps[4].detail, "Offer from Università di Pavia");
  assert.notEqual(studentJourney({ ...base, applications: [app("under_review")] }).steps[4].state, "done");
});

test("a rejected application is not progress", () => {
  const j = studentJourney({ ...base, applications: [app("rejected", { finalized: true })] });
  assert.notEqual(j.steps[3].state, "done");
  assert.notEqual(j.steps[4].state, "done");
});

test("a refused visa stops the journey there, and says so", () => {
  const j = studentJourney({
    ...base,
    agreement: { signed: true, started: true },
    documents: { total: 3, verified: 3, waiting: 0, inReview: 0 },
    applications: [app("acceptance_letter", { finalized: true })],
    visa: { approved: [], refused: ["Italy (Public)"] },
  });
  assert.equal(j.steps[5].state, "blocked");
  assert.match(j.steps[5].detail, /Refused for Italy \(Public\)/);
  assert.equal(j.next.key, "visa");
  assert.equal(j.steps[6].state, "upcoming");
});

test("a granted visa opens travel, which is done when the checklist is", () => {
  const ready = {
    ...base,
    agreement: { signed: true, started: true },
    documents: { total: 3, verified: 3, waiting: 0, inReview: 0 },
    applications: [app("acceptance_letter", { finalized: true })],
    visa: { approved: ["Italy (Public)"], refused: [] },
  };
  let j = studentJourney({ ...ready, travel: { total: 10, done: 3 } });
  assert.equal(j.next.key, "travel");
  assert.equal(j.next.detail, "3 of 10 ready");
  assert.equal(j.next.href, "/portal/travel");
  j = studentJourney({ ...ready, travel: { total: 10, done: 10 } });
  assert.equal(j.percent, 100);
  assert.equal(j.next, null);
});

test("the timeline is soonest first, drops what has passed, and keeps an unpaid instalment", () => {
  const t = upcomingTimeline(
    [
      { date: "2026-10-20", kind: "deadline", label: "Apply by — Pavia" },
      { date: "2026-09-20", kind: "deadline", label: "A closed round" },
      { date: "2026-09-25", kind: "payment", label: "Instalment 2" },
      { date: "2026-10-01", kind: "appointment", label: "Visa appointment" },
      { date: "2027-01-05", kind: "passport", label: "Passport expires" },
    ],
    "2026-09-28"
  );
  assert.deepEqual(t.map((e) => e.label), ["Instalment 2", "Visa appointment", "Apply by — Pavia", "Passport expires"]);
  assert.deepEqual(t.map((e) => e.tone), ["danger", "danger", "warning", "muted"]);
  assert.equal(t[0].daysLeft, -3);
});

test("days left read the way people say them", () => {
  assert.equal(daysLeftLabel(-3), "3 days overdue");
  assert.equal(daysLeftLabel(-1), "1 day overdue");
  assert.equal(daysLeftLabel(0), "today");
  assert.equal(daysLeftLabel(1), "tomorrow");
  assert.equal(daysLeftLabel(12), "in 12 days");
});
