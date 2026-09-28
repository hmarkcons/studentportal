// A registered student's journey, from registration to arrival, as the seven
// steps their dashboard shows — and the dated things coming up along the way.
//
// Each step is decided from the same records the portal's own sections read:
// the agreement from its status, documents from the rows the Documents page
// counts, the applications from their pipeline stage, the visa from the
// tracker's outcome field (studentVisaApproval.ts), travel from the arrival
// checklist. So the dashboard cannot tell a student something a section
// contradicts.
//
// Pure, so it is unit-tested (scripts/student-journey-test.mjs).

export type JourneyStepKey = "registered" | "agreement" | "documents" | "applied" | "admission" | "visa" | "travel";
export type JourneyState = "done" | "current" | "upcoming" | "blocked";

export type JourneyStep = {
  key: JourneyStepKey;
  label: string;
  state: JourneyState;
  /** One line under the step: "8 of 12 approved", "Offer from Pavia". */
  detail: string;
  /** Where the step is acted on, when the student can do anything about it. */
  href?: string;
  /** 0–1, for a step that is partly done (documents, travel). */
  progress?: number;
};

export type JourneyApplication = {
  /** The application's current pipeline stage, e.g. "under_review". */
  stage: string | null;
  /** Its destination's pipeline, in order. */
  stages: readonly string[];
  finalized: boolean;
  university: string;
};

export type JourneyInput = {
  studentCode: string | null;
  agreement: { signed: boolean; started: boolean };
  documents: { total: number; verified: number; waiting: number; inReview: number };
  applications: readonly JourneyApplication[];
  visa: { approved: readonly string[]; refused: readonly string[] };
  /** The arrival checklist; null until a visa opens it. */
  travel: { total: number; done: number } | null;
};

export type Journey = { steps: JourneyStep[]; done: number; percent: number; next: JourneyStep | null };

/** Outcomes an application ends on that are not progress. */
const CLOSED = new Set(["rejected", "declined", "withdrawn"]);

function reached(app: JourneyApplication, stage: string): boolean {
  if (!app.stage || CLOSED.has(app.stage)) return false;
  const target = app.stages.indexOf(stage);
  const at = app.stages.indexOf(app.stage);
  return target !== -1 && at !== -1 && at >= target;
}

/** Past review: an offer, a letter, an acceptance — whatever the destination calls it. */
function admitted(app: JourneyApplication): boolean {
  if (app.stage && CLOSED.has(app.stage)) return false;
  if (app.finalized) return true;
  const review = app.stages.indexOf("under_review");
  const at = app.stage ? app.stages.indexOf(app.stage) : -1;
  return review !== -1 && at > review;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function studentJourney(input: JourneyInput): Journey {
  const { agreement, documents: d, applications, visa, travel } = input;
  const submitted = applications.filter((a) => reached(a, "application_submitted"));
  const offers = applications.filter(admitted);

  type Draft = Omit<JourneyStep, "state"> & { done: boolean; blocked?: boolean };
  const drafts: Draft[] = [
    {
      key: "registered",
      label: "Registered",
      done: true,
      detail: input.studentCode ? `Student ID ${input.studentCode}` : "Welcome to HMARK",
    },
    {
      key: "agreement",
      label: "Agreement",
      done: agreement.signed,
      detail: agreement.signed ? "Signed" : agreement.started ? "Waiting for your signature" : "HMARK is preparing it",
      href: "/portal/agreement",
    },
    {
      key: "documents",
      label: "Documents",
      done: d.total > 0 && d.verified === d.total,
      detail:
        d.total === 0
          ? "Your list is being prepared"
          : d.verified === d.total
            ? `All ${d.total} approved`
            : d.waiting > 0
              ? `${plural(d.waiting, "document")} to upload`
              : d.inReview > 0
                ? `${d.inReview} being checked`
                : `${d.verified} of ${d.total} approved`,
      href: "/portal/documents",
      progress: d.total > 0 ? d.verified / d.total : 0,
    },
    {
      key: "applied",
      label: "Applied",
      done: submitted.length > 0,
      detail:
        submitted.length > 0
          ? `${plural(submitted.length, "application")} submitted`
          : applications.length > 0
            ? "HMARK is preparing your applications"
            : "No application yet",
    },
    {
      key: "admission",
      label: "Admission",
      done: offers.length > 0,
      detail: offers.length > 0 ? `Offer from ${offers[0].university}` : submitted.length > 0 ? "Waiting for a decision" : "After you apply",
    },
    {
      key: "visa",
      label: "Visa",
      done: visa.approved.length > 0,
      blocked: visa.approved.length === 0 && visa.refused.length > 0,
      detail:
        visa.approved.length > 0
          ? `Granted for ${visa.approved[0]}`
          : visa.refused.length > 0
            ? `Refused for ${visa.refused[0]} — talk to your counsellor`
            : offers.length > 0
              ? "Your visa file is under way"
              : "After your admission",
      href: "/portal/visa",
    },
    {
      key: "travel",
      label: "Travel",
      done: Boolean(travel && travel.total > 0 && travel.done === travel.total),
      detail: !travel
        ? "Once your visa is granted"
        : travel.total === 0
          ? "Your arrival guide is on its way"
          : travel.done === travel.total
            ? "Ready to fly"
            : `${travel.done} of ${travel.total} ready`,
      href: travel ? "/portal/travel" : undefined,
      progress: travel && travel.total > 0 ? travel.done / travel.total : 0,
    },
  ];

  // The first step not yet done is where the student is; a refusal stops the
  // journey there rather than pretending travel is next.
  let current = false;
  const steps: JourneyStep[] = drafts.map(({ done, blocked, ...step }) => {
    if (done) return { ...step, state: "done" };
    if (blocked) {
      current = true;
      return { ...step, state: "blocked" };
    }
    if (!current) {
      current = true;
      return { ...step, state: "current" };
    }
    return { ...step, state: "upcoming" };
  });

  const done = steps.filter((s) => s.state === "done").length;
  return {
    steps,
    done,
    percent: Math.round((done / steps.length) * 100),
    next: steps.find((s) => s.state === "current" || s.state === "blocked") ?? null,
  };
}

// ------------------------------------------------------------ what is coming up

export type TimelineKind = "deadline" | "payment" | "appointment" | "document" | "passport" | "scholarship";

export type TimelineInput = { date: string; kind: TimelineKind; label: string; detail?: string; href?: string };

export type TimelineEntry = TimelineInput & {
  /** Negative once it has passed. */
  daysLeft: number;
  tone: "danger" | "warning" | "muted";
};

function dayNumber(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/**
 * The dated things ahead of the student, soonest first.
 *
 * What has passed is dropped — except a payment, which stays, overdue, until
 * it is paid: a missed instalment is exactly what the student must not stop
 * seeing. Inside a week is urgent, inside a month worth planning for.
 */
export function upcomingTimeline(items: readonly TimelineInput[], today: string, limit = 8): TimelineEntry[] {
  const now = dayNumber(today);
  return items
    .map((item) => {
      const daysLeft = dayNumber(item.date) - now;
      const tone: TimelineEntry["tone"] = daysLeft < 7 ? "danger" : daysLeft <= 30 ? "warning" : "muted";
      return { ...item, daysLeft, tone };
    })
    .filter((e) => e.daysLeft >= 0 || e.kind === "payment")
    .sort((a, b) => a.daysLeft - b.daysLeft || a.label.localeCompare(b.label))
    .slice(0, limit);
}

/** "today", "tomorrow", "in 12 days", "3 days overdue". */
export function daysLeftLabel(daysLeft: number): string {
  if (daysLeft < 0) return `${plural(-daysLeft, "day")} overdue`;
  if (daysLeft === 0) return "today";
  if (daysLeft === 1) return "tomorrow";
  return `in ${daysLeft} days`;
}
