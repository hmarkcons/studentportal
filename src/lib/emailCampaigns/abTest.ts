// A/B tests (Phase 6, 0363): which recipients test which version, and which
// version won. Version A is the campaign's own subject and template; B is
// another subject (and preview text), another template, or both.
//
// No portal imports, so the unit tests load it under plain Node.

import { seedOf } from "./simulate.ts";

/** Below this many recipients a test cannot tell the versions apart. */
export const AB_MIN_AUDIENCE = 20;
/** B's links are numbered from here, so they never share a number with A's. */
export const B_LINK_START = 1001;

/**
 * The test group — `percent` of the audience, shuffled by the campaign so the
 * split is fair and repeatable — half to A and half to B; everyone else is
 * held for the winner.
 */
export function splitForTest<K extends string>(keys: K[], { seed, percent }: { seed: string; percent: number }): { A: K[]; B: K[]; held: K[] } {
  const order = [...keys].sort((a, b) => seedOf(`${seed}:${a}`) - seedOf(`${seed}:${b}`) || (a < b ? -1 : 1));
  const test = Math.min(order.length, Math.max(2, Math.round((order.length * percent) / 100)));
  const half = Math.ceil(test / 2);
  return { A: order.slice(0, half), B: order.slice(half, test), held: order.slice(test) };
}

export type VariantStats = { variant: string; sent: number; opened: number; clicked: number };

/** The version more of its test group opened (or clicked); a tie keeps A. */
export function pickWinner(stats: VariantStats[], by: "opens" | "clicks"): { winner: "A" | "B"; rateA: number; rateB: number } {
  const rate = (v: string) => {
    const s = stats.find((x) => x.variant === v);
    if (!s || s.sent <= 0) return 0;
    return (by === "clicks" ? s.clicked : s.opened) / s.sent;
  };
  const rateA = rate("A");
  const rateB = rate("B");
  return { winner: rateB > rateA ? "B" : "A", rateA, rateB };
}

export type AbDraft = {
  ab_enabled: boolean;
  subject: string | null;
  template_version_id: string | null;
  ab_subject_b: string | null;
  ab_template_version_id_b: string | null;
  spread_hours?: number | null;
  send_at_best_hour?: boolean | null;
};

/** What stops an A/B campaign from going, in words. */
export function abProblems(c: AbDraft, audienceCount: number): string[] {
  if (!c.ab_enabled) return [];
  const out: string[] = [];
  const subjectB = c.ab_subject_b?.trim() || null;
  const templateB = c.ab_template_version_id_b || null;
  if (!subjectB && !templateB) out.push("Give version B its own subject line or template.");
  else if ((subjectB ?? c.subject?.trim() ?? "") === (c.subject?.trim() ?? "") && (templateB ?? c.template_version_id) === c.template_version_id) {
    out.push("Version B is the same as version A — change its subject or template.");
  }
  if (c.spread_hours) out.push("An A/B test cannot also be spread over hours — choose one.");
  if (c.send_at_best_hour) out.push("An A/B test cannot also go at each person's hour — choose one.");
  if (audienceCount > 0 && audienceCount < AB_MIN_AUDIENCE) out.push(`An A/B test needs at least ${AB_MIN_AUDIENCE} people to tell the versions apart.`);
  return out;
}
