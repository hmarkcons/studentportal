// Test types, in a plain module rather than inside TestScoresSection.tsx.
//
// The seeding of document requirements needs these labels server-side, and a
// constant exported from a "use client" module cannot be read from server code
// — Next.js proxies non-component exports across that boundary instead of
// returning the real value (see the same note in documentCategories.ts).

export const TEST_TYPES = [
  "ielts",
  "toefl",
  "pte",
  "duolingo",
  "langcert",
  "ib",
  "moi",
  "gre",
  "gmat",
  "sat",
  "cent_s",
  "other",
] as const;

export type TestType = (typeof TEST_TYPES)[number];

export const TEST_TYPE_LABELS: Record<TestType, string> = {
  ielts: "IELTS",
  toefl: "TOEFL",
  pte: "PTE",
  duolingo: "Duolingo",
  langcert: "LangCert",
  ib: "IB",
  moi: "MOI",
  gre: "GRE",
  gmat: "GMAT",
  sat: "SAT",
  cent_s: "CEnT-S",
  other: "Other",
};

/**
 * What a score for each test looks like, shown in the field before anything is
 * typed.
 *
 * Every one of these is scored differently — 7.5 is a good IELTS and a
 * meaningless GRE — and a single "e.g. 7.5" placeholder against all twelve
 * invites the wrong scale to be typed in and stored as text, where nothing can
 * catch it.
 *
 * A range is given only where the scale is unambiguous and stable. GMAT is
 * deliberately an example without one: the classic total runs to 800 and GMAT
 * Focus to 805, and printing a wrong boundary is worse than printing none.
 * MOI is not a score at all — it is a letter from the institution — so it asks
 * for what the letter says.
 */
export const TEST_SCORE_HINTS: Record<TestType, string> = {
  ielts: "e.g. 7.5 (0–9)",
  toefl: "e.g. 95 (0–120)",
  pte: "e.g. 65 (10–90)",
  duolingo: "e.g. 120 (10–160)",
  langcert: "e.g. B2",
  ib: "e.g. 38 (0–45)",
  moi: "e.g. English",
  gre: "e.g. 320 (260–340)",
  gmat: "e.g. 650",
  sat: "e.g. 1350 (400–1600)",
  cent_s: "e.g. 60",
  other: "Score as the certificate states it",
};

export function testScoreHint(testType: string): string {
  return (TEST_SCORE_HINTS as Record<string, string>)[testType] ?? "Score as the certificate states it";
}

/** True when the type needs the test's own name typed in alongside it. */
export function needsCustomName(testType: string): boolean {
  return testType === "other";
}

/**
 * What to call this test on screen and on a document requirement. "Other" is
 * meaningless as a label, so the name staff typed is used instead; a row saved
 * as Other before that field existed falls back to the generic word.
 */
export function testLabel(testType: string, customName?: string | null): string {
  const typed = (customName ?? "").trim();
  if (needsCustomName(testType)) return typed || "Other test";
  return TEST_TYPE_LABELS[testType as TestType] ?? (typed || testType);
}
