/**
 * What the record already knows, offered to the tracker rather than retyped.
 *
 * Several tracker fields ask for something the office has already recorded
 * somewhere else — the course the student is applying for, their IELTS band,
 * which admission tests they sat. Typed twice, they disagree within a month,
 * and the tracker is the copy the student is advised from.
 *
 * Nothing here writes anything. Each function returns a suggestion and says
 * where it came from; the tracker shows it beside an empty field and a person
 * clicks to take it. A field somebody has already filled in is never touched
 * and never argued with — the profile can be out of date too, and the counselor
 * in front of the student is the one who knows which.
 */

export type TestScore = {
  testType: string;
  score: string | null;
  customTestName?: string | null;
};

/** One row of student_profiles.visa_refusal_history. */
export type VisaRefusalEntry = {
  country?: string | null;
  /** 'refusal' or 'deportation' — see studentProfileExtras. */
  type?: string | null;
  date?: string | null;
  reason?: string | null;
};

export type PrefillSource = {
  /** leads.course_of_interest */
  courseOfInterest?: string | null;
  /** leads.finalized_course_of_interest, which wins when it is set. */
  finalizedCourseOfInterest?: string | null;
  /**
   * student_profiles.visa_refusal_history, which is jsonb and holds a list —
   * `[{ country, type, date, reason }]` — never a string. It was typed as one
   * and read with `.trim()`, so every student whose tracker has a
   * visa_refusal_reason field crashed the whole dashboard on `[].trim is not a
   * function`. The column defaults to `'[]'`, so this did not need unusual
   * data to happen; it needed the field to exist on their tracker.
   *
   * A string is still accepted because one is what a caller would naturally
   * pass, and because throwing is never the right answer here.
   */
  visaRefusalHistory?: VisaRefusalEntry[] | string | null;
  testScores?: TestScore[];
  /** The scholarship_documents section of this student's checklist. */
  scholarshipDocs?: { required: number; uploaded: number; verified: number };
};

/**
 * The refusal history as a sentence the student can read.
 *
 * Each row is "<Refused by|Deported from> <country> on <date>: <reason>",
 * dropping whatever is missing rather than printing "undefined" at somebody
 * who is already having a bad time with a visa.
 */
export function refusalHistoryText(history: VisaRefusalEntry[] | string | null | undefined): string {
  if (typeof history === "string") return history.trim();
  if (!Array.isArray(history)) return "";

  return history
    .map((entry) => {
      if (!entry || typeof entry !== "object") return "";
      const verb = entry.type === "deportation" ? "Deported from" : "Refused by";
      const country = (entry.country ?? "").trim();
      const date = (entry.date ?? "").trim();
      const reason = (entry.reason ?? "").trim();

      const head = [verb, country].filter(Boolean).join(" ");
      const when = date ? ` on ${date}` : "";
      const why = reason ? `: ${reason}` : "";
      // A row with no country at all says nothing worth putting in front of a
      // student — the form refuses to save one, but old rows predate that.
      return country ? `${head}${when}${why}` : "";
    })
    .filter(Boolean)
    .join("; ");
}

export type Suggestion = {
  /** Exactly what would go in the field. */
  value: string;
  /** Said to the person deciding: where this came from. */
  from: string;
};

/**
 * Language tests are not admission tests.
 *
 * IELTS and Duolingo sit in the same table as IMAT and the TOLC, and ticking
 * "Duolingo" under Admission tests would be wrong in a way that survives to
 * the university's own checklist.
 */
const LANGUAGE_TESTS = new Set(["ielts", "toefl", "duolingo", "pte", "cambridge"]);

/** How a recorded test type spells itself in the Admission tests list. */
const ADMISSION_TEST_LABELS: Record<string, string> = {
  imat: "IMAT",
  tolc: "TOLC",
  cent_s: "CEnT-S",
  cents: "CEnT-S",
  sat: "SAT",
};

function normalise(testType: string) {
  return testType.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/**
 * An IELTS band as the dropdown spells it.
 *
 * Scores are stored as free text, so "6" has to become "6.0" to match an
 * option, and a 6.25 that somebody typed is not rounded into a band the
 * student does not hold — a suggestion that overstates a score is worse than
 * no suggestion.
 */
export function ieltsBand(score: string | null | undefined, options: string[]): string | null {
  if (!score) return null;
  const n = Number(String(score).trim());
  if (!Number.isFinite(n)) return null;
  const formatted = n.toFixed(1);
  return options.includes(formatted) ? formatted : null;
}

/** The admission tests this student has a score recorded for. */
export function admissionTests(scores: TestScore[] | undefined, options: string[]): string[] {
  const found: string[] = [];
  for (const s of scores ?? []) {
    const key = normalise(s.testType);
    if (LANGUAGE_TESTS.has(key)) continue;
    const label = ADMISSION_TEST_LABELS[key];
    if (label && options.includes(label) && !found.includes(label)) {
      found.push(label);
      continue;
    }
    // Something sat that the list does not name. "Other" is the honest answer,
    // and only once however many there are.
    if (!label && options.includes("Other") && !found.includes("Other")) found.push("Other");
  }
  // In the order the list itself is written, not the order the scores happened
  // to be entered, so two students read the same.
  return options.filter((o) => found.includes(o));
}

/**
 * Where the scholarship paperwork has got to, read off the checklist.
 *
 * Only ever a suggestion: "Apostille in progress" and "Translation in
 * progress" are things only the person chasing them knows, and nothing in the
 * checklist can tell those apart from an ordinary pending document.
 */
export function scholarshipDocsStatus(
  docs: PrefillSource["scholarshipDocs"],
  options: string[]
): string | null {
  if (!docs || docs.required === 0) return null;
  if (docs.verified >= docs.required && options.includes("Completed")) return "Completed";
  if (docs.uploaded > 0 && options.includes("In process")) return "In process";
  if (docs.uploaded === 0 && options.includes("Pending")) return "Pending";
  return null;
}

/**
 * The suggestion for one tracker field, or null when the record has nothing
 * to offer for it.
 */
export function trackerSuggestion(
  field: { key: string; type: string; options?: string[] | null },
  source: PrefillSource
): Suggestion | null {
  const options = field.options ?? [];

  switch (field.key) {
    case "eligible_fields": {
      const course = (source.finalizedCourseOfInterest || source.courseOfInterest || "").trim();
      if (!course) return null;
      return {
        value: course,
        from: source.finalizedCourseOfInterest?.trim()
          ? "the finalised course on the profile"
          : "the course of interest on the profile",
      };
    }

    case "ielts_score": {
      const ielts = (source.testScores ?? []).find((s) => normalise(s.testType) === "ielts");
      const band = ieltsBand(ielts?.score, options);
      if (!band) return null;
      return { value: band, from: "the IELTS score on the profile" };
    }

    case "test_status": {
      const tests = admissionTests(source.testScores, options);
      if (tests.length === 0) return null;
      return {
        value: JSON.stringify(tests),
        from: tests.length === 1 ? "the test score on the profile" : "the test scores on the profile",
      };
    }

    case "scholarship_docs_status": {
      const status = scholarshipDocsStatus(source.scholarshipDocs, options);
      if (!status) return null;
      return { value: status, from: "the scholarship documents on the checklist" };
    }

    case "visa_refusal_reason": {
      const history = refusalHistoryText(source.visaRefusalHistory);
      if (!history) return null;
      return {
        value: history,
        // Worth saying out loud on this one: the field is shown to the
        // student and the profile's history was written for staff.
        from: "the refusal history on the profile — check the wording, the student sees this",
      };
    }

    default:
      return null;
  }
}

/**
 * Suggestions for every field that has one and is still empty.
 *
 * Empty is the whole test. A tracker field somebody has filled in is an answer,
 * and second-guessing it beside the input is noise at best.
 */
export function trackerSuggestions(
  fields: { key: string; type: string; options?: string[] | null }[],
  values: Record<string, string>,
  source: PrefillSource
): Record<string, Suggestion> {
  const out: Record<string, Suggestion> = {};
  for (const field of fields) {
    const current = (values[field.key] ?? "").trim();
    // "[]" is what an emptied multi-select leaves behind.
    if (current && current !== "[]") continue;
    const suggestion = trackerSuggestion(field, source);
    // Never suggest what is already there.
    if (suggestion && suggestion.value !== current) out[field.key] = suggestion;
  }
  return out;
}
