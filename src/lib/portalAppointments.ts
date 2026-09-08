// A student's appointments, read from the documentation tracker.
//
// Shared by the Appointments tab and the dashboard summary, which both need
// the same list — the dashboard just shows the next one. Keeping it in one
// place means "which date fields are appointments" is answered once.

import { listTrackerDefinitions } from "@/lib/actions/countryTracker";
import type { SupabaseClient } from "@supabase/supabase-js";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export type PortalAppointment = {
  label: string;
  country: string;
  /** Universities in that country, for context under the label. */
  where: string;
  /** Date-only, as stored. */
  date: string;
};

/** Whole days from today to a date-only value, both read in UTC. */
export function daysUntil(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d);
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / 86_400_000);
}

/**
 * Every appointment on file, oldest first.
 *
 * One application per country: the tracker is per country, so two programmes
 * at the same university would otherwise list the same appointment twice.
 */
export async function loadAppointments(supabase: SupabaseClient, studentId: string): Promise<PortalAppointment[]> {
  const { data: applications } = await supabase
    .from("applications")
    .select("id, university:universities(name, destination:destinations(country_code, display_name))")
    .eq("student_id", studentId);

  const byCountry = new Map<string, { code: string; name: string; appId: string; universities: string[] }>();
  for (const a of applications ?? []) {
    const uni = one(a.university as never) as { name?: string; destination?: unknown } | null;
    const dest = uni?.destination
      ? (one(uni.destination as never) as { country_code?: string; display_name?: string } | null)
      : null;
    if (!dest?.country_code) continue;
    const existing = byCountry.get(dest.country_code);
    if (existing) {
      if (uni?.name && !existing.universities.includes(uni.name)) existing.universities.push(uni.name);
    } else {
      byCountry.set(dest.country_code, {
        code: dest.country_code,
        name: dest.display_name ?? dest.country_code,
        appId: a.id,
        universities: uni?.name ? [uni.name] : [],
      });
    }
  }

  const codes = Array.from(byCountry.keys());
  if (codes.length === 0) return [];
  const defsByCountry = await listTrackerDefinitions(codes);

  const appointments: PortalAppointment[] = [];
  await Promise.all(
    Array.from(byCountry.values()).map(async (c) => {
      const fields = (defsByCountry[c.code] ?? []).filter((f) => f.isAppointment);
      if (fields.length === 0) return;

      const { data: extras } = await supabase
        .from("application_country_extra")
        .select("field_key, field_value")
        .eq("application_id", c.appId)
        .in("field_key", fields.map((f) => f.key));

      for (const e of extras ?? []) {
        const value = (e.field_value ?? "").trim();
        // Only a real date can be counted down to; anything else is skipped
        // rather than rendered as "Invalid Date".
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) continue;
        const field = fields.find((f) => f.key === e.field_key);
        appointments.push({
          label: field?.label ?? e.field_key,
          country: c.name,
          where: c.universities.join(" · "),
          date: value,
        });
      }
    })
  );

  return appointments.sort((a, b) => a.date.localeCompare(b.date));
}
