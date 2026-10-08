import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { karachiToday } from "@/lib/calendarDates";
import { parseDateParam, parseView, shiftDate } from "@/lib/calendarLayout";
import type { CalendarEvent } from "@/lib/calendarItems";
import { autoEvent, deadlineItem, interviewItem } from "@/lib/calendarAuto";
import { loadInterviews, loadPartnerApplications, partnerDeadlines } from "@/lib/calendarAutoLoad";
import { CalendarApp } from "@/app/(staff)/calendar/CalendarApp";
import { PARTNER_KINDS } from "@/app/(staff)/calendar/kinds";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

// The university's own calendar: its applicants' interviews, and the
// deadlines of the applications made to it. Nothing here is the partner's to
// change from the calendar; each item opens the application it belongs to.
// Row-level security keeps both to this university's own applications.
export default async function PartnerCalendarPage(props: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const { view: viewParam, date: dateParam } = await props.searchParams;
  const supabase = await createClient();
  const user = await getCurrentUser();
  const today = karachiToday();

  const [{ data: account }, apps, interviews] = await Promise.all([
    supabase.from("partner_university_accounts").select("university:universities(name)").eq("id", user?.id ?? "").maybeSingle(),
    loadPartnerApplications(supabase),
    // Interviews still to be held; a year back keeps one never marked as held in view.
    loadInterviews(supabase, shiftDate(today, -365), shiftDate(today, 730)).catch(() => []),
  ]);
  const university = (one(account?.university as never) as { name?: string } | null)?.name ?? null;
  // The student's name comes from the partner's own list of applications.
  const nameOf = new Map(apps.map((a) => [a.applicationId, a.studentName]));

  const events: CalendarEvent[] = [];
  for (const r of interviews) {
    const item = interviewItem({ ...r, studentName: r.studentName ?? nameOf.get(r.applicationId) ?? null, studentId: null }, "partner");
    if (item) events.push(autoEvent(item));
  }
  for (const d of partnerDeadlines(apps, university)) {
    const item = deadlineItem(d, "partner");
    if (item) events.push(autoEvent(item));
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">Calendar</h2>
        <p className="text-sm text-muted">
          Your applicants&apos; interviews and the deadlines of the applications made to {university ?? "your university"}, by day, week, month or
          year. Times are Pakistan time. You are reminded the day before, and an hour before an interview.
        </p>
      </div>
      <CalendarApp
        basePath="/partner/calendar"
        navigation="client"
        view={parseView(viewParam, "month")}
        referenceDate={parseDateParam(dateParam) ?? today}
        todayStr={today}
        events={events}
        loadedRange={{ start: "0000-01-01", end: "9999-12-31" }}
        kinds={PARTNER_KINDS}
        storageKey="calendar.hidden.partner"
        heading="Your calendar"
      />
    </div>
  );
}
