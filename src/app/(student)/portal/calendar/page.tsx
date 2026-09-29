import { AlarmClock, CalendarDays, CalendarRange } from "lucide-react";
import { getStudentUser } from "@/lib/auth/session";
import { karachiToday } from "@/lib/calendarDates";
import { dayDelta, karachiClock, parseDateParam, parseView, timeOf } from "@/lib/calendarLayout";
import { recordEvent, type CalendarEvent } from "@/lib/calendarItems";
import { loadPortalSummary } from "@/lib/portalSummary";
import { loadAppointments } from "@/lib/portalAppointments";
import { loadStudentApplications } from "@/lib/studentApplications";
import { loadCycleDocuments } from "@/lib/studentCycleDocuments";
import { sortRounds } from "@/lib/programRounds";
import { formatFee } from "@/lib/applicationFee";
import { platformLabel } from "@/lib/interviews";
import { daysLeftLabel } from "@/lib/studentJourney";
import { PortalPageHeader } from "@/components/studentPortal/PortalPageHeader";
import { PortalStat, PortalStats } from "@/components/studentPortal/PortalStat";
import { CalendarApp } from "@/app/(staff)/calendar/CalendarApp";
import { STUDENT_KINDS } from "@/app/(staff)/calendar/kinds";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

// Everything dated that concerns the student, from the same places the
// dashboard's "Coming up" reads it — their appointments and interviews, their
// application rounds' deadlines, instalments due, documents to upload by a
// date, scholarship deadlines and an expiring passport — laid out as a
// calendar. Nothing here is theirs to change: each item says where it comes
// from and links to the page that has it. Past items stay, so a student can
// look back at when their biometrics were.
export default async function PortalCalendarPage(props: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const { view: viewParam, date: dateParam } = await props.searchParams;
  const { supabase, userId } = await getStudentUser();

  const { data: student } = await supabase.from("students").select("id").eq("auth_user_id", userId ?? "").maybeSingle();
  if (!student) return null;

  const [apps, summary, appointments, cycleDocs, { data: scholarships }] = await Promise.all([
    loadStudentApplications(supabase, student.id),
    loadPortalSummary(supabase, student.id),
    // Every appointment, past ones too — the summary keeps only those to come.
    loadAppointments(supabase, student.id),
    loadCycleDocuments(supabase, student.id),
    supabase.from("student_scholarships").select("id, name, status, application_deadline").eq("student_id", student.id),
  ]);

  const today = karachiToday();
  const events: CalendarEvent[] = [];

  appointments.forEach((a, i) => {
    if (a.interview) {
      const at = Date.parse(a.interview.at);
      const clock = Number.isNaN(at) ? null : karachiClock(at);
      events.push(
        recordEvent({
          id: `interview-${a.interview.id}`,
          kind: "interview",
          date: clock?.date ?? a.date,
          time: clock ? timeOf(clock.minutes) : null,
          endTime: clock ? timeOf(Math.min(clock.minutes + 60, 1439)) : null,
          title: a.label,
          location: [platformLabel(a.interview.platform, a.interview.platformOther), a.where].filter(Boolean).join(" · "),
          notes: a.interview.details,
          href: "/portal/appointments",
          hrefLabel: "Open Appointments for the link and details",
          origin: "Shown in Pakistan time. Your counsellor books and changes it.",
        })
      );
      return;
    }
    events.push(
      recordEvent({
        id: `appointment-${i}-${a.date}`,
        kind: "appointment",
        date: a.date,
        title: a.label,
        location: [a.country, a.where].filter(Boolean).join(" · "),
        href: "/portal/appointments",
        hrefLabel: "Open Appointments",
        origin: "Booked by your counsellor. If it changes, they update it here.",
      })
    );
  });

  for (const { app, uni, program } of apps) {
    // The round this application is for, or else the next one still open —
    // the dashboard's own choice, so the two show the same date.
    const rounds = sortRounds(program?.rounds ?? []);
    const round = rounds.find((r) => r.id === app.round_id) ?? rounds.find((r) => r.application_deadline && r.application_deadline >= today);
    if (!round?.application_deadline) continue;
    events.push(
      recordEvent({
        id: `deadline-${app.id}`,
        kind: "deadline",
        date: round.application_deadline,
        title: `Applications close — ${uni?.name ?? "University"}`,
        notes: program?.name ?? null,
        href: `/portal/applications/${app.id}`,
        hrefLabel: "Open the application",
        origin: "Your processing officer files the application before this date.",
      })
    );
  }

  const money = summary.money;
  (money?.unpaid ?? []).forEach((i, n) => {
    if (!i.dueDate) return;
    events.push(
      recordEvent({
        id: `payment-${n}-${i.dueDate}`,
        kind: "payment",
        date: i.dueDate,
        title: `Instalment ${i.installmentNo || ""} — ${formatFee(i.amount, money!.currency)}`.replace("Instalment  —", "Instalment —"),
        href: "/portal/payments",
        hrefLabel: "Open Payments",
        origin: i.dueDate < today ? "Overdue — it stays on the calendar until it is paid." : "Due on this date.",
      })
    );
  });

  for (const d of cycleDocs.docs) {
    if (!d.deadline || (d.status !== "missing" && d.status !== "rejected")) continue;
    const template = one(d.template as never) as { name?: string } | null;
    events.push(
      recordEvent({
        id: `document-${d.id}`,
        kind: "document",
        date: d.deadline,
        title: `Upload ${d.custom_name ?? template?.name ?? "a document"}`,
        href: "/portal/documents",
        hrefLabel: "Open Documents",
        origin: d.status === "rejected" ? "It was sent back — upload a new copy by this date." : "Upload it by this date.",
      })
    );
  }

  for (const s of scholarships ?? []) {
    if (!s.application_deadline || s.status === "accepted" || s.status === "rejected") continue;
    events.push(
      recordEvent({
        id: `scholarship-${s.id}`,
        kind: "scholarship",
        date: s.application_deadline,
        title: `Scholarship deadline — ${s.name}`,
        href: "/portal/scholarship",
        hrefLabel: "Open Scholarship",
      })
    );
  }

  if (summary.passport.expiry && (summary.passport.state === "expiring" || summary.passport.state === "expired")) {
    events.push(
      recordEvent({
        id: "passport",
        kind: "passport",
        date: summary.passport.expiry,
        title: "Your passport expires",
        href: "/portal/profile",
        hrefLabel: "Open your profile",
        origin: "Renew it before your visa appointment — a visa needs months of validity left.",
      })
    );
  }

  const ahead = events.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));
  const next = ahead[0] ?? null;
  const within30 = ahead.filter((e) => dayDelta(today, e.date) <= 30).length;
  const daysToNext = next ? dayDelta(today, next.date) : null;

  return (
    <div className="flex w-full flex-col gap-6" data-portal-page>
      <PortalPageHeader
        icon={CalendarDays}
        title="Calendar"
        description="Your appointments, interviews, deadlines and instalments in one place, by day, week, month or year. Your HMARK team keeps it up to date."
      >
        <PortalStats className="xl:grid-cols-3">
          <PortalStat
            icon={AlarmClock}
            value={daysToNext === null ? "—" : daysToNext === 0 ? "Today" : daysToNext}
            label={daysToNext === null ? "nothing coming up" : daysToNext === 0 ? "the next date" : `day${daysToNext === 1 ? "" : "s"} to the next`}
            hint={next ? `${next.title}, ${daysLeftLabel(daysToNext ?? 0)}` : undefined}
            tone={daysToNext !== null && daysToNext <= 7 ? "warning" : "default"}
          />
          <PortalStat icon={CalendarRange} value={within30} label="in the next 30 days" tone="info" />
          <PortalStat icon={CalendarDays} value={events.length} label={events.length === 1 ? "date on your calendar" : "dates on your calendar"} />
        </PortalStats>
      </PortalPageHeader>

      <CalendarApp
        basePath="/portal/calendar"
        navigation="client"
        view={parseView(viewParam, "month")}
        referenceDate={parseDateParam(dateParam) ?? today}
        todayStr={today}
        events={events}
        loadedRange={{ start: "0000-01-01", end: "9999-12-31" }}
        kinds={STUDENT_KINDS}
        storageKey="calendar.hidden.student"
        heading="Your calendar"
      />
    </div>
  );
}
