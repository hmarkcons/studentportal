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
