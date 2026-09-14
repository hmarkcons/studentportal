// The task a counsellor gets when one of their students stops.
//
// Two reasons a student stops, and they are not the same errand:
//
//   * Ghosted — they went quiet. Chase them, soon, because silence is usually
//     circumstance rather than decision.
//   * Withdrawn — they decided to stop. A win-back, later, because calling
//     someone three days after they told you no is how a consultancy earns a
//     reputation.
//
// Wording and timing live here rather than in the action, because these land
// on somebody's calendar next to their own reminders and have to read like a
// colleague wrote them.

export const GHOST_CHASE_SOURCE = "ghost_chase";
export const WINBACK_SOURCE = "winback";

/** Every source this system opens, so they can be told from a person's own. */
export const SYSTEM_TASK_SOURCES = [GHOST_CHASE_SOURCE, WINBACK_SOURCE] as const;
export type FollowUpSource = (typeof SYSTEM_TASK_SOURCES)[number];

/**
 * Three days for a chase: whoever marked the student ghosted has almost always
 * just tried to reach them, and a task due the same afternoon is one they tick
 * off without doing anything.
 */
export const CHASE_AFTER_DAYS = 3;

/**
 * Fourteen for a win-back. A student who has just withdrawn has made a
 * decision, and the worst time to reopen it is while they still feel the
 * reasons. Two weeks is long enough that a call is a courtesy rather than
 * pressure, and short enough that they have not signed with someone else.
 */
export const WINBACK_AFTER_DAYS = 14;

/** The office's day, not the server's. */
export function karachiToday(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
}

/** Calendar arithmetic, so a clock change cannot move a due date by a day. */
export function followUpDueDate(from: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((from ?? "").trim());
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** First name only — it is a note to self, not a letter. */
function firstName(fullName: string | null | undefined): string {
  const trimmed = (fullName ?? "").trim();
  if (!trimmed) return "this student";
  return trimmed.split(/\s+/)[0];
}

function fullOrFallback(fullName: string | null | undefined): string {
  return (fullName ?? "").trim() || "This student";
}

export type FollowUpPlan = {
  source: FollowUpSource;
  title: string;
  description: string;
  dueDate: string;
  priority: "urgent" | "medium" | "low";
};

/**
 * What to open for a student who has stopped, or null if they have not.
 *
 * One function for both, because the two must stay distinguishable: a chase
 * that reads like a win-back gets ignored, and a win-back that reads like a
 * chase gets somebody's number blocked.
 */
export function planFollowUp(
  registrationStatus: string | null | undefined,
  fullName: string | null | undefined,
  on: string
): FollowUpPlan | null {
  if (registrationStatus === "ghost") {
    return {
      source: GHOST_CHASE_SOURCE,
      title: `Chase ${firstName(fullName)} — gone quiet`,
      description: [
        `${fullOrFallback(fullName)} was marked as ghosted on ${on}.`,
        "Try a call, then WhatsApp, then their emergency contact if there is one.",
        "If they want to carry on, use “Start the process again” on their dashboard —",
        "their documents and last intake's applications are all still there.",
        "If they are definitely not continuing, set them to Withdrawn so they stop being chased.",
      ].join(" "),
      dueDate: followUpDueDate(on, CHASE_AFTER_DAYS) || on,
      priority: "urgent",
    };
  }

  if (registrationStatus === "withdrawn") {
    return {
      source: WINBACK_SOURCE,
      title: `Win back ${firstName(fullName)} — withdrew`,
      description: [
        `${fullOrFallback(fullName)} withdrew on ${on}.`,
        "Find out what actually changed before offering anything — fees, family, a different country,",
        "or another consultancy. If they are open to it, “Start the process again” on their dashboard",
        "keeps every document and last intake's applications, so coming back costs them nothing.",
        "If they are firm, mark this done and leave them alone:",
        "one conversation is a service, three is a nuisance.",
      ].join(" "),
      dueDate: followUpDueDate(on, WINBACK_AFTER_DAYS) || on,
      priority: "medium",
    };
  }

  // Registered, or anything else: there is nothing to follow up.
  return null;
}
