// Tests ticked in a documentation tracker, and their dates and scores.
//
// A tracker field whose options are tests — Italy's "Admission tests": IMAT,
// TOLC, CEnT-S, SAT — opens a Test date and a Score beside each test ticked.
// They are the student's own Test scores (student_test_scores), the one place
// a score lives, shown and saved from here so the two never disagree.
//
// And an Italy bachelors student whose high-school marks are below 70% sits
// CEnT-S or SAT, so their tracker starts with CEnT-S ticked, saying why.
//
// Pure, relative imports only, so scripts/tracker-tests-test.mjs reads it
// under plain Node.

import { TEST_TYPES, type TestType } from "./testScores.ts";

/** How a tracker option names a test, each to the test type it is. */
const OPTION_TYPES: Record<string, TestType> = {
  "cent-s": "cent_s",
  cents: "cent_s",
  "cent s": "cent_s",
  sat: "sat",
  imat: "imat",
  tolc: "tolc",
  ielts: "ielts",
  toefl: "toefl",
  pte: "pte",
  duolingo: "duolingo",
  langcert: "langcert",
  gre: "gre",
  gmat: "gmat",
  other: "other",
};

/** The test a tracker option is, or null when it is not one. */
export function testTypeForOption(option: string): TestType | null {
  return OPTION_TYPES[option.trim().toLowerCase().replace(/_/g, " ")] ?? null;
}

/** True when a field's options are tests — at least one named test, not just "Other". */
export function isTestOptionList(options: readonly string[]): boolean {
  return options.some((o) => {
    const t = testTypeForOption(o);
    return t !== null && t !== "other";
  });
}

export function isTestType(value: string): value is TestType {
  return (TEST_TYPES as readonly string[]).includes(value);
}

/** A test's date and score as the tracker shows them — the student's latest of that test. */
export type TrackerTestScore = { score: string | null; date: string | null; name?: string | null };

/** The form fields a ticked test's date and score are posted under. */
export const trackerTestField = {
  date: (type: TestType) => `tracker_test_date__${type}`,
  score: (type: TestType) => `tracker_test_score__${type}`,
  /** "Other" needs the test's own name, as the Test scores table does. */
  otherName: "tracker_test_name__other",
};

/** A posted test field's type, or null when the key is not one. */
export function trackerTestFieldType(key: string): TestType | null {
  const m = /^tracker_test_(?:date|score)__(.+)$/.exec(key);
  return m && isTestType(m[1]) ? m[1] : null;
}

/**
 * A high-school mark as a percentage, from whatever was typed: "65%", "65",
 * "65.5 %", "Marks: 72%". Null when it is not a percentage — a GPA ("3.4"),
 * a grade ("A*"), or nothing — since a 3.4 is not "below 70%".
 */
export function highSchoolPercent(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = /(\d+(?:\.\d+)?)\s*(%)?/.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n > 100) return null;
  // Without a percent sign, a small number is a GPA or a grade point.
  if (!m[2] && n <= 10) return null;
  return n;
}

/**
 * The tests an admission-test field starts with ticked, and why — for an
 * Italy bachelors student below 70% in high school: CEnT-S. Null otherwise.
 */
export function admissionTestPreTick(input: {
  countryCode: string | null | undefined;
  level: string | null | undefined;
  highSchool: string | null | undefined;
}): { options: string[]; reason: string } | null {
  if ((input.countryCode ?? "").toUpperCase() !== "IT") return null;
  if ((input.level ?? "").toLowerCase() !== "bachelors") return null;
  const percent = highSchoolPercent(input.highSchool);
  if (percent === null || percent >= 70) return null;
  return {
    options: ["CEnT-S"],
    reason: `High school ${percent}% — below 70%, so CEnT-S or SAT is required for a bachelors in Italy. CEnT-S is ticked; change it to SAT or tick both.`,
  };
}
