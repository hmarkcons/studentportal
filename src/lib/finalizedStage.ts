// The step a student reaches when a university is finalized for the visa.
//
// It sits in both pipelines (0301): each country's status bar, right after
// University & Program (after Admission where a country has none), and each
// application's own stages, where the university part ends and before any
// visa step. Italy calls it Pre-Enrolled — the student is pre-enrolled at the
// university the visa is for — and every other country University Finalized.
//
// Nobody sets it by hand. It is reached the moment staff finalize a
// university (the rules in autoStages.ts), and it goes when the university is
// un-finalized or its application deleted (planFinalizedUndo, below). Under it
// the pages show which university, by its short name.
//
// Pure, so it is unit-tested (scripts/finalized-stage-test.mjs).

export type FinalizedStage = { key: string; label: string; done: string };

export const PRE_ENROLLED: FinalizedStage = { key: "pre_enrolled", label: "Pre-Enrolled", done: "Pre-Enrolled" };
export const UNIVERSITY_FINALIZED: FinalizedStage = { key: "university_finalized", label: "University Finalized", done: "Finalized" };

const KEYS = new Set([PRE_ENROLLED.key, UNIVERSITY_FINALIZED.key]);

/** Whether a stage — of a country's bar or of an application — is this one. */
export function isFinalizedStage(key: string | null | undefined): boolean {
  return Boolean(key && KEYS.has(key));
}

/** Which of the two a country has. */
export function finalizedStageFor(countryCode: string | null | undefined): FinalizedStage {
  return (countryCode ?? "").toUpperCase() === "IT" ? PRE_ENROLLED : UNIVERSITY_FINALIZED;
}

/** The finalized stage in an application's pipeline, if its country has one. */
export function finalizedStageIn(pipeline: readonly string[]): string | null {
  return pipeline.find((s) => isFinalizedStage(s)) ?? null;
}

/** Where an application goes back to when its university is un-finalized: the stage before. */
export function stageBeforeFinalized(pipeline: readonly string[]): string | null {
  const at = pipeline.findIndex((s) => isFinalizedStage(s));
  return at > 0 ? pipeline[at - 1] : null;
}

/** An application stage as a person reads it: "under_review" is Under Review. */
export function applicationStageLabel(stage: string): string {
  if (stage === PRE_ENROLLED.key) return PRE_ENROLLED.label;
  if (stage === UNIVERSITY_FINALIZED.key) return UNIVERSITY_FINALIZED.label;
  return stage
    .split("_")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

// ------------------------------------------------------------ short names

/** Longer than this and a name is shortened: two lines under a stage. */
export const SHORT_NAME_MAX = 32;

const UNIVERSITY_WORD = /(?<!\p{L})(?:University|Università|Universita|Universität|Universitat|Université|Universite|Universidad|Universidade|Universiteit|Universitet|Uniwersytet|Univerzita|Universitatea)(?!\p{L})/giu;
const ABBREVIATIONS: [RegExp, string][] = [
  [UNIVERSITY_WORD, "Univ."],
  [/(?<!\p{L})Technical(?!\p{L})/gu, "Tech."],
  [/(?<!\p{L})Technology(?!\p{L})/gu, "Tech."],
  [/(?<!\p{L})Institute(?!\p{L})/gu, "Inst."],
  [/(?<!\p{L})International(?!\p{L})/gu, "Intl."],
  [/(?<!\p{L})Economics(?!\p{L})/gu, "Econ."],
  [/(?<!\p{L})Management(?!\p{L})/gu, "Mgmt."],
  [/(?<!\p{L})Sciences(?!\p{L})/gu, "Sci."],
  [/ and /g, " & "],
];
/** Words a shortened name should not end on. */
const DANGLING = /(?:\s+(?:of|di|de|del|della|degli|des|du|der|für|and|&|in|at|the|la|le|y|e|-|–))+$/iu;

/**
 * The name shown under the stage: the short name staff gave the university
 * in Setup, or, until they give one, a shortened form of its full name.
 */
export function universityShortName(name: string, shortName?: string | null): string {
  const own = (shortName ?? "").trim();
  return own || autoShortName(name);
}

/**
 * A long university name shortened: the part of "Alma Mater Studiorum –
 * Università di Bologna" that names the university, "degli Studi" dropped,
 * then University, Technical, Institute and the like abbreviated — and, if
 * it is still too long, cut at a word with an ellipsis. Short names are left
 * exactly as they are.
 */
export function autoShortName(name: string): string {
  let n = name.trim().replace(/\s+/g, " ");
  if (n.length <= SHORT_NAME_MAX) return n;

  const parts = n.split(/\s+[–—-]\s+/);
  if (parts.length > 1) {
    const named = parts.find((p) => new RegExp(UNIVERSITY_WORD.source, "iu").test(p) || /polit|instit|college|school|academ|hochschule/i.test(p));
    n = (named ?? parts[parts.length - 1]).trim();
    if (n.length <= SHORT_NAME_MAX) return n;
  }

  n = n.replace(/\s+degli Studi(?!\p{L})/iu, "").replace(/(?<!\p{L})Studiorum\s+/iu, "");
  if (n.length <= SHORT_NAME_MAX) return n;

  for (const [pattern, short] of ABBREVIATIONS) {
    n = n.replace(pattern, short);
    if (n.length <= SHORT_NAME_MAX) return n;
  }

  // Still too long: cut at the last word that fits, never mid-word, and not
  // on a dangling "of" or "&".
  const words = n.split(" ");
  let cut = "";
  for (const w of words) {
    const next = cut ? `${cut} ${w}` : w;
    if (next.length > SHORT_NAME_MAX - 1) break;
    cut = next;
  }
  cut = (cut || n.slice(0, SHORT_NAME_MAX - 1)).replace(DANGLING, "").replace(/[.,;:]+$/, "");
  return `${cut}…`;
}

// ---------------------------------------------------------------- undoing

export type UndoApplication = { id: string; destinationId: string | null; stage: string | null; pipeline: readonly string[]; finalized: boolean };
export type UndoCountry = { destinationId: string; values: Record<string, string> };
export type FinalizedUndoPlan = {
  applications: { id: string; from: string; to: string }[];
  countries: { destinationId: string; values: Record<string, string>; cleared: string[] }[];
};

/**
 * What has to come off when a university is no longer finalized.
 *
 * The rules in autoStages.ts only ever move forward, which is right for
 * everything else: nothing staff did is undone by them. This step is the
 * exception, because it is not a thing anybody did — it says which
 * university is finalized, and once none is, it is no longer true. So an
 * application left on it without being finalized goes back to the stage
 * before, and a country's bar loses it when no application there is
 * finalized. Nothing else is touched.
 */
export function planFinalizedUndo(applications: readonly UndoApplication[], countries: readonly UndoCountry[]): FinalizedUndoPlan {
  const plan: FinalizedUndoPlan = { applications: [], countries: [] };
  for (const a of applications) {
    if (a.finalized || !isFinalizedStage(a.stage)) continue;
    const to = stageBeforeFinalized(a.pipeline);
    if (to) plan.applications.push({ id: a.id, from: a.stage!, to });
  }
  const finalizedIn = new Set(applications.filter((a) => a.finalized && a.destinationId).map((a) => a.destinationId as string));
  for (const c of countries) {
    if (finalizedIn.has(c.destinationId)) continue;
    const cleared = Object.keys(c.values).filter((k) => isFinalizedStage(k));
    if (cleared.length === 0) continue;
    const values = { ...c.values };
    for (const k of cleared) delete values[k];
    plan.countries.push({ destinationId: c.destinationId, values, cleared });
  }
  return plan;
}
