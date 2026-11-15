// A registered student's applications, staff's and the student's own lists
// alike (2026-11-15): the submitted ones first, the first submitted at the
// top and the last at the end of them; then every other one, in the order
// that list already kept. "Submitted" is the dashboard's Applied step — at or
// past the destination's Application Submitted, so an offer or a visa stage
// counts and a rejection or withdrawal does not.
//
// No portal imports, so the unit tests load it under plain Node.
import { applicationSubmitted } from "./studentJourney.ts";

export type StageEntry = { stage: string; enteredAt: string };

/** Sorts after any real date: a submission the page has not been told the time of yet — one made just now. */
const JUST_NOW = "￿";

/** Whether an application counts as submitted, at the stage it is at now. */
export function isSubmitted(stage: string | null | undefined, pipeline: readonly string[]): boolean {
  return applicationSubmitted({ stage: stage ?? null, stages: pipeline, finalized: false, university: "" });
}

/**
 * When an application was first submitted: the first time its stage history
 * shows it at or past Application Submitted. Null while it is not submitted
 * (or no longer is). One submitted before history was kept counts from when
 * it was made.
 */
export function firstSubmittedAt(
  app: { stage: string | null | undefined; pipeline: readonly string[]; createdAt: string },
  history: readonly StageEntry[]
): string | null {
  if (!isSubmitted(app.stage, app.pipeline)) return null;
  const from = app.pipeline.indexOf("application_submitted");
  const times = history.filter((h) => app.pipeline.indexOf(h.stage) >= from).map((h) => h.enteredAt).sort();
  return times[0] ?? app.createdAt;
}

/**
 * Submitted first, in the order they were submitted; then the rest in
 * `rest`'s order. `submittedAt` is read as it stands: a row that is
 * submitted with no time yet (just moved there on the page) goes last among
 * the submitted, and one that no longer is goes back among the rest.
 */
export function submittedFirst<T>(
  items: readonly T[],
  submission: (item: T) => { submitted: boolean; at: string | null | undefined },
  rest: (a: T, b: T) => number
): T[] {
  const key = (t: T) => {
    const s = submission(t);
    return s.submitted ? (s.at ?? JUST_NOW) : null;
  };
  return [...items].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka !== null && kb !== null) return ka < kb ? -1 : ka > kb ? 1 : rest(a, b);
    if (ka !== null) return -1;
    if (kb !== null) return 1;
    return rest(a, b);
  });
}
