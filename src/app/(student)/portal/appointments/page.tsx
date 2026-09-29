import { createClient } from "@/lib/supabase/server";
import { AlarmClock, CalendarClock, CalendarDays, CalendarRange, History } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PortalPageHeader } from "@/components/studentPortal/PortalPageHeader";
import { PortalStat, PortalStats } from "@/components/studentPortal/PortalStat";
import { PortalEmpty } from "@/components/studentPortal/PortalEmpty";
import { formatDateOnly } from "@/lib/formatDate";
import { loadAppointments, daysUntil, type PortalAppointment } from "@/lib/portalAppointments";
import { interviewTimes, platformLabel, interviewStatusLabel } from "@/lib/interviews";
import { addedLine, changedLine } from "@/lib/activityStamp";

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
  const next = upcoming[0] ?? null;
  const daysToNext = next ? daysUntil(next.date) : null;

  return (
    <div className="flex w-full flex-col gap-6" data-portal-page>
      <PortalPageHeader
        icon={CalendarDays}
        title="Appointments"
        description="Dates your counsellor has booked for you. Anything that changes here is updated by them."
      >
        {appointments.length > 0 && (
          <PortalStats className="xl:grid-cols-3">
            <PortalStat
              icon={AlarmClock}
              value={daysToNext === null ? "—" : daysToNext === 0 ? "Today" : daysToNext}
              label={daysToNext === null ? "nothing booked ahead" : daysToNext === 0 ? "your next appointment" : `day${daysToNext === 1 ? "" : "s"} to your next`}
              tone={daysToNext !== null && daysToNext <= 7 ? "warning" : "default"}
              hint={next ? next.label : undefined}
            />
            <PortalStat icon={CalendarRange} value={upcoming.length} label="coming up" tone="info" />
            <PortalStat icon={History} value={past.length} label="past" />
          </PortalStats>
        )}
      </PortalPageHeader>

      {appointments.length === 0 ? (
        <Card>
          <PortalEmpty icon={CalendarDays} title="No appointments booked yet">
            Once your counsellor books one — a visa appointment, an interview — it will appear here with a countdown.
          </PortalEmpty>
        </Card>
      ) : (
        // Coming up and past side by side on a wide screen.
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
          {upcoming.length > 0 && (
            <Card>
              <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
                <CalendarClock aria-hidden className="h-5 w-5 text-primary shrink-0" /> Coming up
              </h3>
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
              <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
                <History aria-hidden className="h-5 w-5 text-muted shrink-0" /> Past
              </h3>
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

  // A calendar leaf: the day a student has to turn up on, readable at a glance.
  const [, month, day] = appointment.date.split("-");
  const monthName = formatDateOnly(`2000-${month}-01`, { month: "short" });
  return (
    <div className="flex items-start gap-4 py-3.5 text-sm">
      <span
        aria-hidden
        className={`flex w-14 shrink-0 flex-col overflow-hidden rounded-xl border text-center ${muted ? "border-border opacity-70" : "border-primary/30 shadow-sm"}`}
      >
        <span className={`py-0.5 text-[10px] font-semibold uppercase tracking-wider ${muted ? "bg-border text-muted" : "bg-[var(--brand-soft)] text-[var(--brand-strong)]"}`}>{monthName}</span>
        <span className="bg-card py-1 text-xl font-bold leading-tight text-ink">{Number(day)}</span>
      </span>
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <div className="min-w-0">
        <p className={`font-medium ${muted ? "text-muted" : "text-ink"}`}>{appointment.label}</p>
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
            {/* When HMARK put this interview on the record, and — when the row
                has since been edited — when the details last moved. Without the
                second line a rescheduled interview looks exactly like the
                original, and a student has no way to tell the time changed. */}
            {(() => {
              const added = addedLine(interview.addedAt, "Added by HMARK");
              const changed = changedLine(interview.addedAt, interview.changedAt, "Last updated");
              if (!added && !changed) return null;
              return (
                <p className="flex flex-col gap-0.5 text-xs text-muted">
                  {added && <span>{added}</span>}
                  {changed && <span>{changed}</span>}
                </p>
              );
            })()}
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
    </div>
  );
}
