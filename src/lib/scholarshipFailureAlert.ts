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

export type RunRow = {
  id: string;
  status: string;
  finished_at: string | null;
  error: string | null;
  failure_notified_at: string | null;
  body?: string | null;
};

export type AlertDecision =
  | { alert: false; reason: string; streak: number }
  | { alert: true; streak: number; runs: RunRow[]; lastError: string | null };

/**
 * Whether the recent run history warrants telling someone.
 *
 * `runs` must be newest first and already filtered to finished runs.
 *
 * Silent once told: the streak is only reported if none of its runs has been
 * reported already. Otherwise a key left dead over a weekend would send the
 * same mail every morning, which is how people learn to filter a sender.
 * A success breaks the streak, so the next outage is a fresh one and does get
 * reported.
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
  const since = runs[runs.length - 1]?.finished_at?.slice(0, 10) ?? "recently";

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
