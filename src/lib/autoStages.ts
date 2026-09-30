// Stages that move by themselves when something happens — the rules.
//
// A student's progress is recorded twice: each application's stage
// (applications.current_stage, the destination's pipeline) and each country's
// status bar (lead_destinations.dashboard_stage_values, the destination's
// dashboard stages). Both used to be set by hand only, so a document approved,
// a letter received or a visa decided left the bars saying the step was still
// ahead until someone remembered to tick it.
//
// These rules read what is on record and say what the stages should now be.
// They only ever move forward:
//   - an empty step is filled;
//   - a step "under way" ("In process", "Pending", "Unpaid") may become done;
//   - a step already done, skipped or stopped is never touched, and nothing
//     is ever cleared — whatever staff set by hand stands;
//   - an application only moves to a later stage, never from Rejected,
//     Declined or Withdrawn.
// So running them again changes nothing, and running them late catches up.
//
// Pure, so it is unit-tested (scripts/auto-stages-test.mjs); the loading and
// writing is in autoStagesSync.ts.

import type { DashboardStageDef, DashboardStageValues } from "./dashboardPipeline.ts";
import { stageTone } from "./destinationStatus.ts";
import { admittedStage } from "./serviceType.ts";
import { applicationAdmitted, applicationSubmitted } from "./studentJourney.ts";
import { readVisaDecision } from "./visaOutcome.ts";
import { finalizedStageIn, isFinalizedStage } from "./finalizedStage.ts";

export type AutoStageCountry = {
  destinationId: string;
  stages: DashboardStageDef[];
  values: DashboardStageValues;
};

export type AutoStageApplication = {
  id: string;
  destinationId: string | null;
  stage: string | null;
  pipeline: string[];
  finalized: boolean;
};

export type AutoStageDocument = {
  category: string | null;
  status: string;
  applicationId: string | null;
};

export type AutoStageTrackerField = {
  key: string;
  label: string;
  type: string;
  visaRole?: "outcome" | "outcome_reason" | null;
  isAppointment?: boolean;
};

export type AutoStageTracker = {
  destinationId: string;
  fields: AutoStageTrackerField[];
  values: Record<string, string>;
};

export type AutoStageInput = {
  countries: AutoStageCountry[];
  applications: AutoStageApplication[];
  /** The current intake's documents, as the Documents page lists them. */
  documents: AutoStageDocument[];
  trackers: AutoStageTracker[];
};

export type AutoStagePlan = {
  countries: { destinationId: string; values: DashboardStageValues; set: string[] }[];
  applications: { id: string; from: string | null; to: string }[];
};

/** Where a staff member files a letter the university sent (0294). */
export const ACCEPTANCE_SECTION = "acceptance_letters";
/** The letter a partner university uploads through its own portal (0016). */
const PARTNER_OFFER = "offer_letter";

const CLOSED = new Set(["rejected", "declined", "withdrawn"]);
const DONE = /issued|granted|received|complete|finali[sz]ed|done|accepted|booked|submitted|approved|yes|paid/i;
const REFUSED = /reject|refus|declin|fail/i;

/** A section is finished when it has at least one document and every one is approved. */
function sectionApproved(docs: readonly AutoStageDocument[], category: string, inCountry: (d: AutoStageDocument) => boolean) {
  const rows = docs.filter((d) => (d.category ?? "other") === category && inCountry(d));
  return rows.length > 0 && rows.every((d) => d.status === "verified");
}

/** The option a stage records for "done": its single tick, the option that reads as done, else its first. */
function doneValue(stage: DashboardStageDef): string | null {
  if (stage.type === "date") return null;
  const options = stage.options ?? [];
  if (stage.type === "checkbox") return options[0] || "Completed";
  return options.find((o) => DONE.test(o) && !REFUSED.test(o)) ?? null;
}

function refusedValue(stage: DashboardStageDef): string | null {
  return (stage.options ?? []).find((o) => REFUSED.test(o)) ?? null;
}

function progressValue(stage: DashboardStageDef): string | null {
  return (stage.options ?? []).find((o) => stageTone(o) === "progress") ?? null;
}

/**
 * Whether automation may write `next` over what a stage holds now: into an
 * empty step, or over a step under way with a value that finishes it. Never
 * over a step done, skipped or stopped, and never by "starting" one already
 * started.
 */
export function mayAdvance(current: string | undefined, next: string): boolean {
  const now = (current ?? "").trim();
  if (!now) return true;
  if (now === next) return false;
  const was = stageTone(now);
  const will = stageTone(next);
  return was === "progress" && (will === "done" || will === "blocked");
}

/** The first of a country's stages whose key matches. */
function stageBy(stages: readonly DashboardStageDef[], test: (key: string, label: string) => boolean) {
  return stages.find((s) => test(s.key, s.label.toLowerCase()));
}

/** A tracker value that says something has happened: a date, Yes/true, a Booked or a Completed. */
function affirmative(field: AutoStageTrackerField, value: string | undefined): boolean {
  const v = (value ?? "").trim();
  if (!v) return false;
  if (field.type === "boolean") return v === "true" || /^yes$/i.test(v);
  if (field.type === "date") return /^\d{4}-\d{2}-\d{2}$/.test(v);
  return DONE.test(v) && !REFUSED.test(v) && !/pending|waiting|not /i.test(v);
}

/** The pipeline stage an application moves to once the university's letter is in. */
export function acceptanceStage(pipeline: readonly string[]): string | null {
  const named = pipeline.find((s) => /acceptance/.test(s));
  return named ?? admittedStage([...pipeline]);
}

function laterThan(pipeline: readonly string[], current: string | null, target: string): boolean {
  if (current && CLOSED.has(current)) return false;
  const to = pipeline.indexOf(target);
  if (to === -1) return false;
  const at = current ? pipeline.indexOf(current) : -1;
  return to > at;
}

export function planAutoStages(input: AutoStageInput): AutoStagePlan {
  const { documents } = input;
  const plan: AutoStagePlan = { countries: [], applications: [] };

  // ------------------------------------------------------------ applications
  // Worked out first: the country's Admission step reads the stages they end on.
  const nextStage = new Map<string, string>();
  const move = (app: AutoStageApplication, target: string | null) => {
    if (!target) return;
    const current = nextStage.get(app.id) ?? app.stage;
    if (laterThan(app.pipeline, current, target)) nextStage.set(app.id, target);
  };
  const decisionFor = (destinationId: string | null) => {
    const tracker = input.trackers.find((t) => t.destinationId === destinationId);
    const outcome = tracker?.fields.find((f) => f.visaRole === "outcome");
    return outcome ? readVisaDecision(tracker!.values[outcome.key]) : null;
  };
  for (const app of input.applications) {
    if (app.stage && CLOSED.has(app.stage)) continue;
    // Its own documents in, and the shared admission documents, all approved.
    const own = documents.filter((d) => d.applicationId === app.id || (d.applicationId === null && d.category === "admission"));
    if (own.length > 0 && own.every((d) => d.status === "verified")) move(app, "documents_verified");
    // The university's letter is in.
    const letter = documents.some(
      (d) => d.applicationId === app.id && ((d.category === ACCEPTANCE_SECTION && d.status === "verified") || d.category === PARTNER_OFFER)
    );
    if (letter) move(app, acceptanceStage(app.pipeline));
    // The visa, on the application it is for: the finalised one, or the
    // country's only one.
    const sameCountry = input.applications.filter((a) => a.destinationId === app.destinationId);
    const carriesVisa = app.finalized || (sameCountry.length === 1 && !sameCountry.some((a) => a.finalized));
    if (carriesVisa && decisionFor(app.destinationId) === "approved") move(app, "visa_granted");
    // Finalized for the visa: Pre-Enrolled (Italy) or University Finalized.
    // Taken back off by planFinalizedUndo when it is un-finalized — the one
    // step that is not only ever forward, because it is not something done.
    if (app.finalized) move(app, finalizedStageIn(app.pipeline));
  }
  for (const app of input.applications) {
    const to = nextStage.get(app.id);
    if (to && to !== app.stage) plan.applications.push({ id: app.id, from: app.stage, to });
  }
  const stageNow = (app: AutoStageApplication) => nextStage.get(app.id) ?? app.stage;

  // --------------------------------------------------------------- countries
  for (const country of input.countries) {
    const values: DashboardStageValues = { ...country.values };
    const set: string[] = [];
    const write = (stage: DashboardStageDef | undefined, value: string | null | undefined) => {
      if (!stage || !value) return;
      if (!mayAdvance(values[stage.key], value)) return;
      values[stage.key] = value;
      set.push(stage.key);
    };
    const stages = country.stages;
    const apps = input.applications.filter((a) => a.destinationId === country.destinationId);
    const appIds = new Set(apps.map((a) => a.id));
    // A shared document counts for every country; an application's own, for its country.
    const inCountry = (d: AutoStageDocument) => d.applicationId === null || appIds.has(d.applicationId);
    const asJourney = apps.map((a) => ({ stage: stageNow(a), stages: a.pipeline, finalized: a.finalized, university: "" }));
    const tracker = input.trackers.find((t) => t.destinationId === country.destinationId);
    const trackerSays = (test: (f: AutoStageTrackerField) => boolean) =>
      Boolean(tracker?.fields.some((f) => test(f) && affirmative(f, tracker.values[f.key])));
    const decision = decisionFor(country.destinationId);
    const letterIn = documents.some(
      (d) => d.applicationId !== null && appIds.has(d.applicationId) && ((d.category === ACCEPTANCE_SECTION && d.status === "verified") || d.category === PARTNER_OFFER)
    );

    // Documents approved.
    if (sectionApproved(documents, "admission", inCountry)) {
      const s = stageBy(stages, (k) => k === "admission_docs");
      write(s, s && doneValue(s));
    }
    if (sectionApproved(documents, "visa", inCountry) || trackerSays((f) => f.key === "visa_docs_status")) {
      const s = stageBy(stages, (k) => k === "visa_docs");
      write(s, s && doneValue(s));
    }
    if (sectionApproved(documents, "scholarship_documents", inCountry)) {
      const s = stageBy(stages, (k) => k === "scholarship_docs");
      write(s, s && doneValue(s));
    }
    if (sectionApproved(documents, "enrollment", inCountry)) {
      const s = stageBy(stages, (k) => k === "enrollment");
      write(s, s && doneValue(s));
    }

    // Application progress.
    const admission = stageBy(stages, (k) => k === "admission");
    if (admission) {
      if (letterIn || asJourney.some(applicationAdmitted)) write(admission, doneValue(admission));
      else if (asJourney.some(applicationSubmitted)) write(admission, progressValue(admission));
    }
    if (letterIn) {
      const s = stageBy(stages, (k) => k === "acceptance_letter");
      write(s, s && doneValue(s));
    }
    if (apps.some((a) => a.finalized)) {
      const s = stageBy(stages, (k) => k === "university_and_program");
      write(s, s && doneValue(s));
      // And the step after it: Pre-Enrolled, or University Finalized.
      const f = stageBy(stages, (k) => isFinalizedStage(k));
      write(f, f && doneValue(f));
    }

    // The visa tracker. An appointment is a visa one — not an academic
    // interview, and not a place on a waiting list.
    const visaAppointment = (f: AutoStageTrackerField) =>
      (f.isAppointment === true && !/interview/i.test(`${f.key} ${f.label}`)) || f.key === "visa_appointment_status";
    if (trackerSays(visaAppointment)) {
      const s = stageBy(stages, (k, l) => (/^(visa_)?appointment$|^visa_appt$/.test(k) || l === "appointment") && !/wait/.test(l));
      write(s, s && doneValue(s));
    }
    if (decision === "approved" || decision === "refused" || trackerSays((f) => /visa_application_submitted|visa_submitted|visa_lodged/.test(f.key))) {
      const s = stageBy(stages, (k) => k === "visa_app");
      write(s, s && doneValue(s));
    }
    const visaStatus = stageBy(stages, (k) => k === "visa_status");
    if (visaStatus && decision === "approved") write(visaStatus, doneValue(visaStatus));
    if (visaStatus && decision === "refused") write(visaStatus, refusedValue(visaStatus));

    // Travel: a travel or flight date in the tracker becomes the step's date.
    const travel = stageBy(stages, (k) => k === "travel");
    if (travel && travel.type === "date" && tracker) {
      const field = tracker.fields.find((f) => f.type === "date" && /travel|flight|departure/i.test(`${f.key} ${f.label}`));
      const day = field ? (tracker.values[field.key] ?? "").trim() : "";
      if (/^\d{4}-\d{2}-\d{2}$/.test(day)) write(travel, day);
    }

    if (set.length > 0) plan.countries.push({ destinationId: country.destinationId, values, set });
  }

  return plan;
}
