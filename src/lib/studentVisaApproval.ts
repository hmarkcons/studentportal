import type { SupabaseClient } from "@supabase/supabase-js";
import { listTrackerDefinitions } from "@/lib/actions/countryTracker";
import { readVisaDecision, type VisaDecision } from "@/lib/visaOutcome";

export type ApprovedDestination = {
  destinationId: string;
  countryCode: string;
  country: string;
  university: string;
};

export type VisaOutcome = ApprovedDestination & { decision: VisaDecision; applicationId: string };

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

/**
 * The countries this student has actually been issued a visa for.
 *
 * Read from the documentation tracker's outcome field — the same source the
 * Visa tab reads — rather than a second flag somebody has to remember to set,
 * so a student cannot be congratulated on one screen and told nothing on
 * another.
 *
 * Shared by the student layout and the Travel & Arrival page on purpose: the
 * menu entry and the page have to answer this identically, or a refused student
 * sees a tab that then tells them it is not for them.
 */
export async function approvedVisaDestinations(
  supabase: SupabaseClient,
  studentId: string
): Promise<ApprovedDestination[]> {
  const outcomes = await visaOutcomes(supabase, studentId);
  return outcomes
    .filter((o) => o.decision === "approved")
    .map(({ destinationId, countryCode, country, university }) => ({ destinationId, countryCode, country, university }));
}

/**
 * Every country this student has a recorded visa decision for, approved or not.
 *
 * The approval gate and the "start the process again" panel have to read the
 * same field the same way, or a student could be refused on one screen and
 * congratulated on another.
 */
export async function visaOutcomes(supabase: SupabaseClient, studentId: string): Promise<VisaOutcome[]> {
  const { data: applications } = await supabase
    .from("applications")
    .select("id, is_finalized, university:universities(name, destination:destinations(id, country_code, display_name))")
    .eq("student_id", studentId);

  // One application per country, preferring the finalised one — the visa
  // belongs to the university the student is actually going to.
  const byCode = new Map<string, { appId: string; finalized: boolean } & ApprovedDestination>();
  for (const a of applications ?? []) {
    const uni = one(a.university as never) as { name?: string; destination?: unknown } | null;
    const dest = uni?.destination
      ? (one(uni.destination as never) as { id?: string; country_code?: string; display_name?: string } | null)
      : null;
    if (!dest?.country_code || !dest.id) continue;
    const existing = byCode.get(dest.country_code);
    if (existing && (existing.finalized || !a.is_finalized)) continue;
    byCode.set(dest.country_code, {
      appId: a.id,
      finalized: Boolean(a.is_finalized),
      destinationId: dest.id,
      countryCode: dest.country_code,
      country: dest.display_name ?? dest.country_code,
      university: uni?.name ?? "",
    });
  }
  if (byCode.size === 0) return [];

  const defs = await listTrackerDefinitions([...byCode.keys()]);

  const outcomes: VisaOutcome[] = [];
  for (const [code, entry] of byCode) {
    const outcomeField = (defs[code] ?? []).find((f) => f.visaRole === "outcome");
    if (!outcomeField) continue;
    const { data: extra } = await supabase
      .from("application_country_extra")
      .select("field_value")
      .eq("application_id", entry.appId)
      .eq("field_key", outcomeField.key)
      .maybeSingle();
    outcomes.push({
      destinationId: entry.destinationId,
      countryCode: entry.countryCode,
      country: entry.country,
      university: entry.university,
      applicationId: entry.appId,
      decision: readVisaDecision(extra?.field_value ?? null),
    });
  }
  return outcomes;
}
