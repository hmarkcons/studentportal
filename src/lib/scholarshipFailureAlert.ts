// Telling somebody when the scholarship research has stopped working.
//
// The research runs unattended at 06:00 and its failures are recorded but not
// surfaced: nine failed runs sat in the history for days while the API key had
// no credit, and nothing said so. A usage alert on the Anthropic account covers
// the opposite problem — spending too much — and would never have fired here.
//
// The rule is deliberately not "email on every failure". One failure is
// ordinary: a regional site is down, a PDF is malformed, a page moved. What is
// worth a person's attention is a run of them, because that means the whole
// thing is broken rather than one source being awkward — a dead key, no credit,
// a changed response format.

/** Consecutive failures before anybody is told. Below this it is just weather. */
export const FAILURE_STREAK = 3;

/**
 * How many recent runs the decision looks at.
 *
 * This doubles as the reminder cadence, which is worth stating rather than
 * leaving to be discovered. An alert stamps every failure it saw, so silence
 * holds while a stamped one is still in view — and once this many newer
 * failures have piled up on an outage nobody fixed, the window no longer
 * contains a stamped run and it speaks up again. At one cron a day that is a
 * nudge roughly every nine days.
 *
 * Deliberate: reporting an unresolved outage exactly once means a key that
 * dies the day somebody goes on leave is never mentioned again.
 */
export const RECENT_RUNS = FAILURE_STREAK * 3;

export type RunRow = {
  id: string;
  status: string;
  /** PostgREST hands these back as ISO strings; a direct pg client hands back Date. */
  finished_at: string | Date | null;
  error: string | null;
  failure_notified_at: string | Date | null;
  body?: string | null;
};

/**
 * The day part of a timestamp, whatever shape it arrived in.
 *
 * Worth the defensiveness: this runs inside an unattended cron, and the whole
 * point of the alert is that it speaks up when things are broken. A throw in
 * here would take the alert down silently and leave nobody to say so — the
 * failure this exists to prevent, caused by the thing meant to prevent it.
 */
export function isoDay(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  const text = String(value);
  return text.length >= 10 ? text.slice(0, 10) : null;
}

export type AlertDecision =
  | { alert: false; reason: string; streak: number }
  | { alert: true; streak: number; runs: RunRow[]; lastError: string | null };

/**
 * Whether the recent run history warrants telling someone.
 *
 * `runs` must be newest first and already filtered to finished runs.
 *
 * Quiet while it is already known: the streak is only reported if none of its
 * runs carries a stamp. Otherwise a key left dead over a weekend would send the
 * same mail every morning, which is how people learn to filter a sender.
 *
 * Two things end the silence. A success breaks the streak, so the next outage
 * is a fresh one. And an outage nobody fixes eventually pushes every stamped
 * run out of the caller's window — see RECENT_RUNS — so it is raised again as
 * a reminder rather than forgotten.
 */
export function decideFailureAlert(runs: RunRow[], streakNeeded = FAILURE_STREAK): AlertDecision {
  const streakRuns: RunRow[] = [];
  for (const run of runs) {
    if (run.status !== "failed") break;
    streakRuns.push(run);
  }

  if (streakRuns.length < streakNeeded) {
    return {
      alert: false,
      reason: `${streakRuns.length} consecutive failure(s), fewer than the ${streakNeeded} worth reporting`,
      streak: streakRuns.length,
    };
  }

  const alreadyTold = streakRuns.find((r) => r.failure_notified_at);
  if (alreadyTold) {
    return {
      alert: false,
      reason: `already reported for this run of failures (at ${alreadyTold.failure_notified_at})`,
      streak: streakRuns.length,
    };
  }

  return {
    alert: true,
    streak: streakRuns.length,
    runs: streakRuns,
    lastError: streakRuns[0]?.error ?? null,
  };
}

/** Kept short: an error from a provider can be a wall of JSON. */
export function summariseError(error: string | null, limit = 300): string {
  if (!error) return "no error was recorded";
  const collapsed = error.replace(/\s+/g, " ").trim();
  return collapsed.length > limit ? `${collapsed.slice(0, limit)}…` : collapsed;
}

/**
 * The mail itself.
 *
 * Says what stopped, for how long, what the last error was, and the one thing
 * the reader can do about it — rather than only that something is wrong.
 */
export function buildScholarshipFailureEmail(decision: Extract<AlertDecision, { alert: true }>) {
  const { streak, runs, lastError } = decision;
  const bodies = [...new Set(runs.map((r) => r.body).filter(Boolean))] as string[];
  const since = isoDay(runs[runs.length - 1]?.finished_at) ?? "an earlier run";

  const subject = `Scholarship research has failed ${streak} times in a row`;

  const lines = [
    `The scholarship call checks have failed ${streak} times in a row, the oldest on ${since}.`,
    "",
    `Last error: ${summariseError(lastError)}`,
    "",
    bodies.length ? `Bodies affected: ${bodies.slice(0, 8).join(", ")}${bodies.length > 8 ? ", …" : ""}` : "",
    "",
    "Most often this is the Anthropic API key: expired, revoked, or the account",
    "out of credit. Setup → Scholarship Bodies → \"Test the key\" answers that in",
    "one call and says which it is.",
    "",
    "Nothing is wrong with the stored data. A failed check writes no proposal,",
    "and a proposal is never applied without somebody accepting it, so the",
    "guides are exactly as they were — only no longer being refreshed.",
  ].filter((l) => l !== "" || true);

  return { subject, text: lines.join("\n") };
}
