import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateOnly } from "@/lib/formatDate";
import { loadAppointments, daysUntil, type PortalAppointment } from "@/lib/portalAppointments";
import { interviewTimes, platformLabel, interviewStatusLabel } from "@/lib/interviews";

// Appointments come from the documentation tracker, the same place as the Visa
// tab. They used to be read from visa_records, which is the pre-tracker system:
// the form that wrote it is no longer linked from anywhere and the table is
// empty, so this page could only ever say "No appointments scheduled yet"
// while the real date sat in the tracker. Which date fields count is opted in
// per field from Setup › Document trackers, so a country added later needs no
// code change here.

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

  // Shared with the dashboard summary, so "which date fields are
  // appointments" is answered in one place.
  const appointments = await loadAppointments(supabase, student.id);
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

function Row({ appointment, muted = false }: { appointment: PortalAppointment; muted?: boolean }) {
  const interview = appointment.interview;
  const times = interview ? interviewTimes(interview.at, interview.timezone) : null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 text-sm">
      <div className="min-w-0">
        <p className={muted ? "text-muted" : "text-ink"}>{appointment.label}</p>
        <p className="text-xs text-muted">
          {appointment.country}
          {appointment.where && ` · ${appointment.where}`}
        </p>

        {interview && (
          <div className="mt-1 flex flex-col gap-1">
            {/* Your own time first, and the university's alongside it. A time
                quoted as "14:00" by a university in Rome is 18:00 here, and
                working that out is not the student's job. */}
            {times && (
              <p className="text-xs">
                <span className="font-medium text-ink">{times.studentTime}</span>
                <span className="text-muted"> your time</span>
                {!times.sameZone && (
                  <span className="text-muted">
                    {" "}
                    · {times.universityTime} {times.universityZoneLabel}
                  </span>
                )}
              </p>
            )}
            <p className="text-xs text-muted">
              {platformLabel(interview.platform, interview.platformOther)} · {interviewStatusLabel(interview.status)}
            </p>
            {interview.link && (
              <a
                href={interview.link}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-primary hover:underline"
              >
                Joining link &rarr;
              </a>
            )}
            {interview.details && <p className="text-xs text-muted">{interview.details}</p>}
            {interview.preparation && (
              <p className="text-xs text-muted">
                <span className="text-ink">To prepare:</span> {interview.preparation}
              </p>
            )}
            {/* Only ever present when staff chose to share it — row-level
                security returns this row to a student on no other terms, so
                there is nothing to hide here. */}
            {interview.credentials && (
              <div className="mt-1 rounded-md border border-border bg-bg px-2 py-1.5 text-xs">
                <p className="font-medium text-ink">Your login for this interview</p>
                {interview.credentials.username && (
                  <p className="text-muted">
                    Username / meeting ID: <span className="font-mono text-ink">{interview.credentials.username}</span>
                  </p>
                )}
                {interview.credentials.password && (
                  <p className="text-muted">
                    Password: <span className="font-mono text-ink">{interview.credentials.password}</span>
                  </p>
                )}
                {interview.credentials.instructions && <p className="text-muted">{interview.credentials.instructions}</p>}
              </div>
            )}
          </div>
        )}
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
