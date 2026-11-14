// Automations (Phase 6, 0364): journeys of emails that start by themselves
// when something happens in the portal — a new lead, an application reaching
// a stage, documents still owed, a visa appointment or an interview coming
// up — each email a step, sent a number of days after it started (or before
// the appointment), and only if the person did, or did not, open or click the
// one before.
//
// No portal imports, so the unit tests load it under plain Node.

export const TRIGGERS = {
  new_lead: { label: "A new lead enquires", countdown: false, hint: "A welcome series: days after they enquire. Stops when they register, say they are not interested, or unsubscribe." },
  application_stage: { label: "An application reaches a stage", countdown: false, hint: "Days after the application reaches one of the stages chosen — e.g. offer letter received → the visa checklist." },
  missing_documents: { label: "A student still owes documents", countdown: false, hint: "Reminders days after a registered student is found owing documents. Stops as soon as nothing is owed." },
  visa_appointment: { label: "A visa appointment is coming up", countdown: true, hint: "Days before the student's visa appointment. Stops if the appointment passes or is removed." },
  interview: { label: "An interview is coming up", countdown: true, hint: "Days before an application's interview. Stops if the interview passes or is cancelled." },
} as const;

export type Trigger = keyof typeof TRIGGERS;

export function isTrigger(v: unknown): v is Trigger {
  return typeof v === "string" && v in TRIGGERS;
}

export const STEP_CONDITIONS = {
  always: "Always",
  opened_previous: "Only if they opened the email before",
  not_opened_previous: "Only if they did not open the email before",
  clicked_previous: "Only if they clicked in the email before",
  not_clicked_previous: "Only if they did not click in the email before",
} as const;

export type StepCondition = keyof typeof STEP_CONDITIONS;

export type JourneyStep = { day: number; condition: StepCondition; subject: string; preheader: string | null; template_version_id: string | null };

export const MAX_STEPS = 10;
const DAY = 86_400_000;

/** When a step falls due: days after the start, or — for an appointment or interview — days before it (day ≤ 0). */
export function stepDueAt(anchorAt: string | Date, day: number): Date {
  return new Date(new Date(anchorAt).getTime() + day * DAY);
}

/**
 * What to do with a step now. A countdown step whose moment passed more than
 * a day ago is skipped, never sent late ("your appointment is in 7 days" two
 * days before it); and once the appointment itself has passed, the journey is
 * over for them.
 */
export function stepAction({ anchorAt, day, countdown, now }: { anchorAt: string; day: number; countdown: boolean; now: Date }): "wait" | "send" | "skip" | "over" {
  const due = stepDueAt(anchorAt, day).getTime();
  if (countdown && now.getTime() >= new Date(anchorAt).getTime()) return "over";
  if (now.getTime() < due) return "wait";
  if (countdown && now.getTime() - due > DAY) return "skip";
  return "send";
}

/** Whether a step's condition is met by what the person did with the step before (null: there was none, or it was not sent). */
export function conditionMet(condition: StepCondition, previous: { opened: boolean; clicked: boolean } | null): boolean {
  switch (condition) {
    case "always":
      return true;
    case "opened_previous":
      return Boolean(previous?.opened);
    case "not_opened_previous":
      return previous !== null && !previous.opened;
    case "clicked_previous":
      return Boolean(previous?.clicked);
    case "not_clicked_previous":
      return previous !== null && !previous.clicked;
  }
}

/** A journey's steps as posted from the editor, checked, in order of when they go. */
export function validateSteps(raw: unknown, trigger: Trigger): { steps: JourneyStep[] } | { error: string } {
  let input: unknown = raw;
  if (typeof raw === "string") {
    try {
      input = JSON.parse(raw);
    } catch {
      return { error: "The steps could not be read." };
    }
  }
  if (!Array.isArray(input)) return { error: "The steps could not be read." };
  if (!input.length) return { error: "Add at least one email." };
  if (input.length > MAX_STEPS) return { error: `A journey has at most ${MAX_STEPS} emails.` };
  const countdown = TRIGGERS[trigger].countdown;
  const steps: JourneyStep[] = [];
  for (const [i, s] of (input as Record<string, unknown>[]).entries()) {
    const n = i + 1;
    const day = Number(s?.day);
    if (!Number.isInteger(day)) return { error: `Email ${n}: give a whole number of days.` };
    if (countdown ? day > 0 || day < -60 : day < 0 || day > 365) {
      return { error: countdown ? `Email ${n}: days before — 0 (the day itself) to 60 before.` : `Email ${n}: days after — 0 (at once) to 365.` };
    }
    const condition = (s.condition ?? "always") as StepCondition;
    if (!(condition in STEP_CONDITIONS)) return { error: `Email ${n}: choose when it goes.` };
    if (i === 0 && condition !== "always") return { error: "The first email has no email before it, so it always goes." };
    const subject = String(s.subject ?? "").trim();
    if (!subject) return { error: `Email ${n}: write a subject line.` };
    if (subject.length > 200) return { error: `Email ${n}: keep the subject to 200 characters.` };
    const preheader = String(s.preheader ?? "").trim() || null;
    if (preheader && preheader.length > 250) return { error: `Email ${n}: keep the preview text to 250 characters.` };
    const template = String(s.template_version_id ?? "").trim();
    if (!/^[0-9a-f-]{36}$/.test(template)) return { error: `Email ${n}: choose a template.` };
    steps.push({ day, condition, subject, preheader, template_version_id: template });
  }
  for (let i = 1; i < steps.length; i++) {
    if (steps[i].day < steps[i - 1].day) return { error: `Email ${i + 1} goes before email ${i} — put them in the order they go.` };
    // An email that depends on whether the one before was opened gives people a day to open it.
    if (steps[i].condition !== "always" && steps[i].day - steps[i - 1].day < 1) {
      return { error: `Email ${i + 1} depends on email ${i}, so it goes at least a day after it.` };
    }
  }
  return { steps };
}

/** "3 days after", "at once", "7 days before", "on the day". */
export function stepWhen(day: number, trigger: Trigger): string {
  if (TRIGGERS[trigger].countdown) return day === 0 ? "on the day" : `${-day} day${day === -1 ? "" : "s"} before`;
  return day === 0 ? "at once" : `${day} day${day === 1 ? "" : "s"} after`;
}
