// The task a counsellor gets when one of their students goes quiet.
//
// Wording and timing kept here rather than in the action, because the task
// lands on somebody's calendar next to their own reminders and has to read
// like a colleague wrote it, not like a system fired.

/**
 * How long after going quiet the chase falls due.
 *
 * Three days, not today: a counsellor marking a student ghosted has almost
 * always just tried to reach them, and a task due the same afternoon is one
 * they will tick off without doing anything. Three days is the next honest
 * attempt.
 */
export const CHASE_AFTER_DAYS = 3;

export const GHOST_CHASE_SOURCE = "ghost_chase";

/** The office's day, not the server's. */
export function karachiToday(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
}

/** Calendar arithmetic, so a clock change cannot move the due date by a day. */
export function chaseDueDate(from: string, days = CHASE_AFTER_DAYS): string {
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

export function chaseTaskTitle(fullName: string | null | undefined): string {
  return `Chase ${firstName(fullName)} — gone quiet`;
}

/**
 * What the counsellor should actually do, spelled out.
 *
 * A title alone ages badly: in three days "chase Ahmed" does not say what was
 * already tried or what happens next, and the counsellor has to open the
 * student to find out. Saying it here means the task is actionable from the
 * calendar.
 */
export function chaseTaskDescription(fullName: string | null | undefined, quietSince: string): string {
  const name = (fullName ?? "").trim() || "This student";
  return [
    `${name} was marked as ghosted on ${quietSince}.`,
    "Try a call, then WhatsApp, then their emergency contact if there is one.",
    "If they want to carry on, use “Start the process again” on their dashboard —",
    "their documents and last intake's applications are all still there.",
    "If they are definitely not continuing, set them to Withdrawn so they stop being chased.",
  ].join(" ");
}
