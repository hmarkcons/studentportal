// Where a visa decision comes from, for everything that needs to count them:
// the reports, and the automatic refund entitlement on a private-track
// refusal.
//
// These all used to read visa_records. That is the pre-tracker system — the
// form that wrote it is no longer linked from anywhere and the table holds no
// rows — so the approval-rate reports showed nothing and, more seriously, the
// refund sync found no refusals and silently stopped surfacing entitlements.
//
// The decision now lives where the student's Visa tab reads it: the tracker
// field a country marks visa_role 'outcome'.

import { readVisaDecision, type VisaDecision } from "@/lib/visaOutcome";
import type { SupabaseClient } from "@supabase/supabase-js";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export type VisaDecisionRow = {
  applicationId: string;
  studentId: string | null;
  countryCode: string;
  /** Destination display name, which is how the reports group. */
  destination: string;
  /** "public" | "private" — the refund rule only applies to private. */
  track: string | null;
  decision: VisaDecision;
  /** When the outcome field was last written; the refusal notice date. */
  decidedAt: string | null;
};

/**
 * Every application whose country records a visa outcome, with its decision.
 *
 * Applications in a country with no outcome field are omitted rather than
 * counted as pending — a country that cannot record a decision should not drag
 * down an approval rate.
 */
export async function listVisaDecisions(supabase: SupabaseClient): Promise<VisaDecisionRow[]> {
  const { data: defs } = await supabase
    .from("tracker_definitions")
    .select("country_code, field_key")
    .eq("visa_role", "outcome");

  const keyByCountry = new Map<string, string>((defs ?? []).map((d) => [d.country_code, d.field_key]));
  if (keyByCountry.size === 0) return [];

  const [{ data: apps }, { data: values }] = await Promise.all([
    supabase
      .from("applications")
      .select("id, student_id, university:universities(destination:destinations(country_code, display_name, track))"),
    supabase
      .from("application_country_extra")
      .select("application_id, field_key, field_value, updated_at")
      .in("field_key", [...new Set((defs ?? []).map((d) => d.field_key))]),
  ]);

  // Keyed on both ids: the same field_key can be flagged in several countries,
  // and a value stored under another country's key is not this decision.
  const valueFor = new Map<string, { field_value: string | null; updated_at: string | null }>();
  for (const v of values ?? []) valueFor.set(`${v.application_id}:${v.field_key}`, v);

  return (apps ?? []).flatMap((a) => {
    const uni = one(a.university as never) as { destination?: unknown } | null;
    const dest = uni?.destination
      ? (one(uni.destination as never) as { country_code?: string; display_name?: string; track?: string } | null)
      : null;
    if (!dest?.country_code) return [];

    const key = keyByCountry.get(dest.country_code);
    if (!key) return [];

    const v = valueFor.get(`${a.id}:${key}`);
    return [
      {
        applicationId: a.id,
        studentId: a.student_id ?? null,
        countryCode: dest.country_code,
        destination: dest.display_name ?? dest.country_code,
        track: dest.track ?? null,
        decision: readVisaDecision(v?.field_value ?? null),
        decidedAt: v?.updated_at ?? null,
      },
    ];
  });
}
