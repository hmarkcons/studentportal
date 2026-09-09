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
  /**
   * Present only for an admission interview, which unlike a tracker date has a
   * time, a timezone, a platform and possibly credentials. The page has always
   * told students an interview "will appear here"; until now nothing put one
   * in this list.
   */
  interview?: {
    id: string;
    roundLabel: string;
    at: string;
    timezone: string | null;
    platform: string | null;
    platformOther: string | null;
    status: string;
    details: string | null;
    link: string | null;
    preparation: string | null;
    credentials: {
      username: string | null;
      password: string | null;
      instructions: string | null;
    } | null;
  };
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

  // Interviews sit alongside the tracker dates rather than in a list of their
  // own, so the countdown, the ordering and the dashboard's "next appointment"
  // summary all cover them without knowing they exist.
  //
  // The credentials come from their own table, and row-level security returns
  // them only when staff ticked "show these to the student" — so nothing here
  // has to decide whether to hide them. If the row comes back, it is meant to
  // be seen.
  const { data: interviews } = await supabase
    .from("application_interviews")
    .select(
      "id, round_label, confirmed_datetime, timezone, platform, platform_other, status, interview_details, interview_link, preparation_notes, application:applications!inner(student_id, university:universities(name, destination:destinations(display_name))), credentials:application_interview_credentials(login_username, login_password, login_instructions)"
    )
    .eq("application.student_id", studentId)
    .not("confirmed_datetime", "is", null)
    .neq("status", "cancelled");

  for (const i of interviews ?? []) {
    const at = i.confirmed_datetime as string;
    const app = one(i.application as never) as { university?: unknown } | null;
    const uni = app?.university ? (one(app.university as never) as { name?: string; destination?: unknown } | null) : null;
    const dest = uni?.destination ? (one(uni.destination as never) as { display_name?: string } | null) : null;
    const cred = one(i.credentials as never) as
      | { login_username?: string | null; login_password?: string | null; login_instructions?: string | null }
      | null;

    appointments.push({
      label: `${i.round_label} interview`,
      country: dest?.display_name ?? "",
      where: uni?.name ?? "",
      // The date-only part in Pakistan time, so the countdown counts the day
      // the student will actually attend rather than the university's date.
      date: new Date(at).toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" }),
      interview: {
        id: i.id,
        roundLabel: i.round_label,
        at,
        timezone: i.timezone,
        platform: i.platform,
        platformOther: i.platform_other,
        status: i.status,
        details: i.interview_details,
        link: i.interview_link,
        preparation: i.preparation_notes,
        credentials: cred
          ? {
              username: cred.login_username ?? null,
              password: cred.login_password ?? null,
              instructions: cred.login_instructions ?? null,
            }
          : null,
      },
    });
  }

  return appointments.sort((a, b) => a.date.localeCompare(b.date));
}
