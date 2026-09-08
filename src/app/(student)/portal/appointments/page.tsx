import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { listTrackerDefinitions } from "@/lib/actions/countryTracker";
import { formatDateOnly } from "@/lib/formatDate";

// Appointments come from the documentation tracker, the same place as the Visa
// tab. They used to be read from visa_records, which is the pre-tracker system:
// the form that wrote it is no longer linked from anywhere and the table is
// empty, so this page could only ever say "No appointments scheduled yet"
// while the real date sat in the tracker. Which date fields count is opted in
// per field from Setup › Document trackers, so a country added later needs no
// code change here.

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

/** Whole days between today and a date-only value, both read in UTC. */
function daysUntil(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d);
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / 86_400_000);
}

function CountdownBadge({ dateStr }: { dateStr: string }) {
  const days = daysUntil(dateStr);
  if (days < 0) return <Badge tone="neutral">Past</Badge>;
  if (days === 0) return <Badge tone="danger">Today</Badge>;
  if (days === 1) return <Badge tone="warning">Tomorrow</Badge>;
  if (days <= 7) return <Badge tone="warning">In {days} days</Badge>;
  return <Badge tone="info">In {days} days</Badge>;
}

export default async function PortalAppointmentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: student } = await supabase.from("students").select("id").eq("auth_user_id", user?.id ?? "").maybeSingle();
  if (!student) return null;

  const { data: applications } = await supabase
    .from("applications")
    .select("id, university:universities(name, destination:destinations(country_code, display_name))")
    .eq("student_id", student.id);

  // One application per country: the tracker is per country, and two
  // programmes at the same university would otherwise list the same
  // appointment twice.
  const byCountry = new Map<string, { code: string; name: string; appId: string; universities: string[] }>();
  for (const a of applications ?? []) {
    const uni = one(a.university as never) as { name?: string; destination?: unknown } | null;
    const dest = uni?.destination ? (one(uni.destination as never) as { country_code?: string; display_name?: string } | null) : null;
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
  const defsByCountry = codes.length ? await listTrackerDefinitions(codes) : {};

  type Appointment = { label: string; country: string; where: string; date: string };
  const appointments: Appointment[] = [];

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

  appointments.sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = appointments.filter((a) => daysUntil(a.date) >= 0);
  const past = appointments.filter((a) => daysUntil(a.date) < 0).reverse();

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-1 text-lg font-semibold text-ink">Appointments</h2>
      <p className="mb-4 text-sm text-muted">
        Dates your counsellor has booked for you. Anything that changes here is updated by them.
      </p>

      {appointments.length === 0 ? (
        <Card>
          <EmptyState>
            No appointments booked yet. Once your counsellor books one — a visa appointment, an interview — it will appear
            here with a countdown.
          </EmptyState>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {upcoming.length > 0 && (
            <Card>
              <h3 className="mb-3 text-base font-semibold text-ink">Coming up</h3>
              <div className="flex flex-col divide-y divide-border">
                {upcoming.map((a, i) => (
                  <Row key={`${a.label}-${a.date}-${i}`} appointment={a} />
                ))}
              </div>
            </Card>
          )}

          {/* Kept rather than hidden: a student checking what date their
              biometrics were on should not have to ask. */}
          {past.length > 0 && (
            <Card>
              <h3 className="mb-3 text-base font-semibold text-ink">Past</h3>
              <div className="flex flex-col divide-y divide-border">
                {past.map((a, i) => (
                  <Row key={`${a.label}-${a.date}-${i}`} appointment={a} muted />
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  appointment,
  muted = false,
}: {
  appointment: { label: string; country: string; where: string; date: string };
  muted?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 text-sm">
      <div className="min-w-0">
        <p className={muted ? "text-muted" : "text-ink"}>{appointment.label}</p>
        <p className="text-xs text-muted">
          {appointment.country}
          {appointment.where && ` · ${appointment.where}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {/* Spelled-out month: this is a date a student has to turn up on, and
            11/20/2026 reads as 11 December to most of the world outside the US. */}
        <span className={`whitespace-nowrap ${muted ? "text-muted" : "text-ink"}`}>
          {formatDateOnly(appointment.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
        </span>
        <CountdownBadge dateStr={appointment.date} />
      </div>
    </div>
  );
}
