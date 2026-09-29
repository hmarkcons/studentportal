import { hasRole } from "@/lib/auth/roles";
import { getStaffSession } from "@/lib/auth/session";
import { karachiToday } from "@/lib/calendarDates";
import { parseDateParam, parseView, periodRange } from "@/lib/calendarLayout";
import { personalEvents, recordEvent, reminderEvent, taskEvents, type CalendarEvent } from "@/lib/calendarItems";
import { loadPendingPersonalTasks, loadPendingTasks, one, personalInput, taskInput, type StudentRef } from "@/lib/calendarQueries";
import { readAll } from "@/lib/catalogueReads";
import { applicationDeadline } from "@/lib/applicationDeadline";
import { StaffCalendar } from "./StaffCalendar";

/** A read that is allowed to fail without blanking the calendar — but says it failed. */
async function attempt<T>(what: string, read: () => Promise<T[]>, problems: string[]): Promise<T[]> {
  try {
    return await read();
  } catch (error) {
    problems.push(`${what} (${(error as Error).message})`);
    return [];
  }
}

type ReminderRow = {
  id: string;
  type: string;
  due_date: string;
  due_time: string | null;
  note: string | null;
  resolved: boolean;
  created_by: string | null;
  student: unknown;
};

type ApplicationRow = {
  id: string;
  deadline: string | null;
  program: unknown;
  round: unknown;
  student: unknown;
  university: unknown;
};

type DocumentRow = { id: string; student_id: string; custom_name: string | null; category: string | null; deadline: string; student: unknown };

type AppointmentRow = { field_key: string; field_value: string | null; application: unknown };

export default async function CalendarPage(props: {
  searchParams: Promise<{ view?: string; date?: string; staff?: string }>;
}) {
  const { view: viewParam, date: dateParam, staff: staffParam } = await props.searchParams;
  // Week first, as Google opens.
  const view = parseView(viewParam, "week");

  const { supabase, staff: viewerStaff } = await getStaffSession();
  const viewerId = viewerStaff?.id ?? "";
  const canViewOthers = hasRole(viewerStaff, "management") || hasRole(viewerStaff, "super_admin");
  const targetStaffId = canViewOthers && staffParam ? staffParam : viewerId;
  const viewingSomeoneElse = targetStaffId !== viewerId;

  // Karachi's day, not the server's. toISOString() is UTC, so for the first
  // five hours of every Karachi day the grid highlighted yesterday as today.
  const todayStr = karachiToday();
  const referenceDate = parseDateParam(dateParam) ?? todayStr;
  const range = periodRange(view, referenceDate);
  const problems: string[] = [];

  // Everything that does not depend on anything else, at once: each of these
  // is a round trip to Sydney, and one after another they added up to seconds.
  const [targetStaffRoles, tasks, reminders, appointmentFields, applications, documentDeadlines, personalTasks, staffList] = await Promise.all([
    // Whose calendar is on screen — deadlines are scoped to the student's
    // processing officer, so management browsing someone else's calendar needs
    // that person's roles. All of them, not only the primary (hasRole).
    viewingSomeoneElse
      ? supabase
          .from("staff")
          .select("role, roles")
          .eq("id", targetStaffId)
          .maybeSingle()
          .then((r) => r.data)
      : Promise.resolve(viewerStaff),
    attempt("student tasks", () => loadPendingTasks(supabase, range.end), problems),
    // Resolved reminders are still read — one ticked off stays on the calendar
    // struck through, so it can be reopened, edited or deleted.
    attempt(
      "reminders",
      () =>
        readAll<ReminderRow>((from, to) =>
          supabase
            .from("reminders")
            .select("id, type, due_date, due_time, note, resolved, created_by, student:leads(id, full_name, assigned_counselor_id, contact_number)")
            .not("due_date", "is", null)
            .gte("due_date", range.start)
            .lte("due_date", range.end)
            .order("due_date")
            .order("id")
            .range(from, to) as never
        ),
      problems
    ),
    // Appointments live in the documentation tracker; which date fields count
    // is opted in from Setup > Document trackers (is_appointment).
    supabase
      .from("tracker_definitions")
      .select("country_code, field_key, label")
      .eq("is_appointment", true)
      .then((r) => r.data ?? []),
    // Read once for two things: each application's deadline, and the list a
    // new student task is attached to.
    attempt(
      "application deadlines",
      () =>
        readAll<ApplicationRow>((from, to) =>
          supabase
            .from("applications")
            .select(
              "id, deadline, program:programs(name, application_deadline), round:program_intake_rounds(label, application_deadline), student:leads(id, full_name, processing_officer_id), university:universities(name)"
            )
            .order("created_at", { ascending: false })
            .order("id")
            .range(from, to) as never
        ),
      problems
    ),
    attempt(
      "document deadlines",
      () =>
        readAll<DocumentRow>((from, to) =>
          supabase
            .from("student_documents")
            .select("id, student_id, custom_name, category, deadline, student:leads(full_name, processing_officer_id)")
            .not("deadline", "is", null)
            .neq("status", "verified")
            .gte("deadline", range.start)
            .lte("deadline", range.end)
            .order("id")
            .range(from, to) as never
        ),
      problems
    ),
    targetStaffId ? attempt("personal items", () => loadPendingPersonalTasks(supabase, targetStaffId, range.end), problems) : Promise.resolve([]),
    canViewOthers
      ? supabase
          .from("staff")
          .select("id, full_name")
          .eq("status", "active")
          .order("full_name")
          .then((r) => r.data ?? [])
      : Promise.resolve([] as { id: string; full_name: string }[]),
  ]);

  const appointmentValues = appointmentFields.length
    ? await attempt(
        "visa appointments",
        () =>
          readAll<AppointmentRow>((from, to) =>
            supabase
              .from("application_country_extra")
              .select(
                "field_key, field_value, application:applications(id, student:leads(id, full_name, assigned_counselor_id, processing_officer_id), university:universities(destination:destinations(country_code)))"
              )
              .in("field_key", [...new Set(appointmentFields.map((f) => f.field_key))])
              .gte("field_value", range.start)
              .lte("field_value", range.end)
              .order("application_id")
              .order("field_key")
              .range(from, to) as never
          ),
        problems
      )
    : [];

  const targetIsProcessing = hasRole(targetStaffRoles as never, "processing");

  // Whose work this calendar shows. On your own calendar RLS already limits
  // tasks and appointments to students you may see; on a colleague's, only
  // their students' — otherwise "Sohaib's calendar" held the whole firm's.
  function studentBelongsToTarget(student: StudentRef | null) {
    if (!viewingSomeoneElse) return true;
    if (!student) return false;
    return student.assigned_counselor_id === targetStaffId || student.processing_officer_id === targetStaffId;
  }
  // A deadline belongs to the student's processing officer; with nobody
  // assigned, to the whole processing team, so it is still on someone's calendar.
  function deadlineBelongsToTarget(processingOfficerId: string | null | undefined) {
    return processingOfficerId ? processingOfficerId === targetStaffId : targetIsProcessing;
  }

  const events: CalendarEvent[] = [];

  for (const raw of tasks) {
    const { input, student } = taskInput(raw);
    if (!studentBelongsToTarget(student)) continue;
    events.push(...taskEvents(input, range));
  }

  for (const r of reminders) {
    const student = one(r.student as never) as { id?: string; full_name?: string; assigned_counselor_id?: string | null; contact_number?: string | null } | null;
    // Follow-ups belong to one person — the lead's counsellor, or whoever set
    // the date if nobody is assigned — unlike stall and deadline reminders.
    if (r.type === "follow_up" && (student?.assigned_counselor_id ?? r.created_by) !== targetStaffId) continue;
    events.push(
      reminderEvent({
        id: r.id,
        type: r.type,
        due_date: r.due_date,
        due_time: r.due_time,
        note: r.note,
        resolved: r.resolved,
        studentId: student?.id ?? null,
        studentName: student?.full_name ?? null,
        contactNumber: student?.contact_number ?? null,
      })
    );
  }

  // The label comes from the tracker field, so a country that calls it a
  // "Prefettura appointment" says exactly that.
  const apptLabel = new Map(appointmentFields.map((f) => [f.country_code + ":" + f.field_key, f.label]));
  for (const row of appointmentValues) {
    const value = (row.field_value ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) continue;
    const app = one(row.application as never) as { id?: string; student?: unknown; university?: unknown } | null;
    const student = one(app?.student as never) as StudentRef | null;
    if (!studentBelongsToTarget(student)) continue;
    const uni = one(app?.university as never) as { destination?: unknown } | null;
    const dest = uni?.destination ? (one(uni.destination as never) as { country_code?: string } | null) : null;
    // A field key flagged for a different country is not this application's appointment.
    const label = apptLabel.get(dest?.country_code + ":" + row.field_key);
    if (!label) continue;
    events.push(
      recordEvent({
        id: `appt-${app?.id}-${row.field_key}-${value}`,
        kind: "visa",
        date: value,
        title: `${label} — ${student?.full_name ?? "?"}`,
        subtitle: student?.full_name ?? null,
        studentId: student?.id ?? null,
        studentName: student?.full_name ?? null,
        href: student?.id && app?.id ? `/students/${student.id}/applications/${app.id}/tracker` : null,
        hrefLabel: "Open the documentation tracker",
        origin: "Kept in the documentation tracker. Change the date there and it moves here.",
      })
    );
  }

  for (const a of applications) {
    const program = one(a.program as never) as { name?: string; application_deadline?: string | null } | null;
    const round = one(a.round as never) as { label?: string; application_deadline?: string | null } | null;
    const deadline = applicationDeadline(a.deadline, round?.application_deadline, program?.application_deadline);
    if (!deadline || deadline < range.start || deadline > range.end) continue;
    const student = one(a.student as never) as StudentRef | null;
    if (!deadlineBelongsToTarget(student?.processing_officer_id)) continue;
    // The round, where one is chosen — two rounds of one programme are two dates.
    const what = program?.name ? `${program.name}${round?.label ? ` (${round.label})` : ""} deadline` : "Application deadline";
    events.push(
      recordEvent({
        id: `deadline-${a.id}`,
        kind: "deadline",
        date: deadline,
        title: `${what} — ${student?.full_name ?? "?"}`,
        subtitle: student?.full_name ?? null,
        studentId: student?.id ?? null,
        studentName: student?.full_name ?? null,
        href: student?.id ? `/students/${student.id}/applications/${a.id}` : null,
        hrefLabel: "Open the application",
        origin: "The application's deadline. Change it on the application and it moves here.",
      })
    );
  }

  for (const d of documentDeadlines) {
    const student = one(d.student as never) as StudentRef | null;
    if (!deadlineBelongsToTarget(student?.processing_officer_id)) continue;
    events.push(
      recordEvent({
        id: `docdeadline-${d.id}`,
        kind: "deadline",
        date: d.deadline,
        title: `${d.custom_name ?? d.category ?? "Document"} due — ${student?.full_name ?? "?"}`,
        subtitle: student?.full_name ?? null,
        studentId: d.student_id,
        studentName: student?.full_name ?? null,
        href: `/students/${d.student_id}/documents`,
        hrefLabel: "Open the student's documents",
        origin: "The document's deadline. Change it on the student's documents and it moves here.",
      })
    );
  }

  for (const raw of personalTasks) events.push(...personalEvents(personalInput(raw), range));

  const applicationOptions = applications.map((a) => ({
    id: a.id,
    label: `${(one(a.student as never) as { full_name?: string } | null)?.full_name ?? "Student"} — ${
      (one(a.university as never) as { name?: string } | null)?.name ?? "University"
    }`,
  }));

  return (
    <div className="flex w-full flex-col gap-3">
      {problems.length > 0 && (
        <p className="rounded-md border border-warning bg-warning-bg px-3 py-2 text-sm text-warning" role="alert">
          Some of the calendar could not be loaded, so it may be missing items: {problems.join("; ")}.
        </p>
      )}
      <StaffCalendar
        view={view}
        referenceDate={referenceDate}
        todayStr={todayStr}
        events={events}
        loadedRange={range}
        applicationOptions={applicationOptions}
        staffOptions={staffList}
        canViewOthers={canViewOthers}
        selectedStaffId={targetStaffId}
        viewerStaffId={viewerId}
      />
    </div>
  );
}
