import { getStaffSession } from "@/lib/auth/session";
import { toYMD, parseYMD, getMonthGridDays, getWeekDays, eachDateInRange, expandRecurrence } from "@/lib/calendarDates";
import { CalendarShell } from "./CalendarShell";
import type { CalendarEvent, CalendarRecurrence } from "./types";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

function occurrenceDates(
  dueDate: string,
  endDate: string | null,
  recurrence: string | null,
  recurrenceEndDate: string | null,
  rangeStartStr: string,
  rangeEndStr: string
): string[] {
  if (recurrence && recurrence !== "none") {
    return expandRecurrence(dueDate, recurrence as CalendarRecurrence, recurrenceEndDate, rangeStartStr, rangeEndStr);
  }
  if (endDate && endDate > dueDate) {
    return eachDateInRange(dueDate, endDate).filter((d) => d >= rangeStartStr && d <= rangeEndStr);
  }
  return dueDate >= rangeStartStr && dueDate <= rangeEndStr ? [dueDate] : [];
}

export default async function CalendarPage(props: {
  searchParams: Promise<{ view?: string; date?: string; staff?: string }>;
}) {
  const { view: viewParam, date: dateParam, staff: staffParam } = await props.searchParams;
  const view = viewParam === "week" ? "week" : viewParam === "day" ? "day" : "month";

  const { supabase, staff: viewerStaff } = await getStaffSession();
  const viewerId = viewerStaff?.id ?? "";
  const canViewOthers = viewerStaff?.role === "management" || viewerStaff?.role === "super_admin";
  const targetStaffId = canViewOthers && staffParam ? staffParam : viewerId;

  // Whose calendar is actually on screen — deadlines below are scoped to the
  // student's processing officer, so a management user browsing someone
  // else's calendar needs that person's role, not their own.
  const targetRole =
    targetStaffId === viewerId
      ? viewerStaff?.role ?? null
      : (await supabase.from("staff").select("role").eq("id", targetStaffId).maybeSingle()).data?.role ?? null;
  const targetIsProcessing = targetRole === "processing";

  const today = new Date();
  const todayStr = toYMD(today);
  const referenceDate = dateParam ? parseYMD(dateParam) : today;

  const rangeDays = view === "month" ? getMonthGridDays(referenceDate) : view === "week" ? getWeekDays(referenceDate) : [referenceDate];
  const rangeStartStr = toYMD(rangeDays[0]);
  const rangeEndStr = toYMD(rangeDays[rangeDays.length - 1]);

  const { data: tasks } = await supabase
    .from("application_tasks")
    .select(
      "id, description, notes, due_date, due_time, end_date, all_day, priority, status, color, guest_emails, recurrence, recurrence_end_date, application:applications(student:leads(full_name))"
    )
    .eq("status", "pending")
    .not("due_date", "is", null);

  // Resolved reminders are still fetched (not filtered out) — a completed
  // reminder stays visible on the calendar so staff can uncheck, edit, or
  // delete it later instead of it just vanishing.
  const { data: reminders } = await supabase
    .from("reminders")
    .select("id, type, due_date, due_time, note, resolved, created_by, student:leads(full_name, assigned_counselor_id, contact_number)")
    .not("due_date", "is", null)
    .gte("due_date", rangeStartStr)
    .lte("due_date", rangeEndStr)
    .order("due_date");

  // Appointments live in the documentation tracker, not visa_records — that
  // table is the pre-tracker system, the form that wrote it is no longer linked
  // from anywhere and it holds no rows, so this section of the calendar was
  // always empty. Which date fields count is opted in from Setup > Document
  // trackers (is_appointment).
  const { data: appointmentFields } = await supabase
    .from("tracker_definitions")
    .select("country_code, field_key, label")
    .eq("is_appointment", true);

  const { data: appointmentValues } = appointmentFields?.length
    ? await supabase
        .from("application_country_extra")
        .select(
          "field_key, field_value, application:applications(id, student:leads(full_name), university:universities(destination:destinations(country_code)))"
        )
        .in("field_key", [...new Set(appointmentFields.map((f) => f.field_key))])
        .gte("field_value", rangeStartStr)
        .lte("field_value", rangeEndStr)
    : { data: [] };

  const { data: programDeadlines } = await supabase
    .from("applications")
    .select("id, program:programs(name, application_deadline), student:leads(full_name, processing_officer_id)")
    .not("program_id", "is", null);

  const { data: documentDeadlines } = await supabase
    .from("student_documents")
    .select("id, custom_name, category, deadline, status, student:leads(full_name, processing_officer_id)")
    .not("deadline", "is", null)
    .neq("status", "verified")
    .gte("deadline", rangeStartStr)
    .lte("deadline", rangeEndStr);

  const { data: personalTasks } = targetStaffId
    ? await supabase
        .from("personal_tasks")
        .select(
          "id, title, description, due_date, due_time, end_date, all_day, priority, status, color, guest_emails, recurrence, recurrence_end_date"
        )
        .eq("owner_id", targetStaffId)
        .eq("status", "pending")
    : { data: [] };

  const events: CalendarEvent[] = [];

  (tasks ?? []).forEach((t) => {
    const dates = occurrenceDates(t.due_date!, t.end_date, t.recurrence, t.recurrence_end_date, rangeStartStr, rangeEndStr);
    dates.forEach((date) => {
      events.push({
        id: `task-${t.id}-${date}`,
        date,
        time: t.all_day ? null : t.due_time ? t.due_time.slice(0, 5) : null,
        kind: "task",
        label: `${t.description} — ${one(one(t.application)?.student)?.full_name ?? "?"}`,
        tone: "warning",
        color: t.color,
        priority: t.priority,
        done: t.status === "done",
        taskId: t.id,
        description: t.description,
        notes: t.notes,
        allDay: t.all_day,
        startDate: t.due_date!,
        endDate: t.end_date,
        guestEmails: t.guest_emails ?? [],
        recurrence: (t.recurrence as CalendarRecurrence) ?? "none",
        recurrenceEndDate: t.recurrence_end_date,
        isRecurrenceInstance: dates.length > 1,
      });
    });
  });

  (reminders ?? []).forEach((r) => {
    const student = one(r.student);
    // Follow-up reminders belong to a specific person — the lead's assigned
    // counselor, or whoever set the date if the lead isn't assigned yet —
    // unlike stall/deadline reminders, which stay visible calendar-wide.
    if (r.type === "follow_up") {
      const ownerId = student?.assigned_counselor_id ?? r.created_by;
      if (ownerId !== targetStaffId) return;
    }
    const label =
      r.type === "follow_up"
        ? `${student?.full_name ?? "?"} - Follow-up${student?.contact_number ? ` (${student.contact_number})` : ""}`
        : `${r.type.replace(/_/g, " ")} — ${student?.full_name ?? "?"}`;

    events.push({
      id: `reminder-${r.id}`,
      date: r.due_date!,
      time: r.due_time ? r.due_time.slice(0, 5) : null,
      kind: "reminder",
      label,
      tone: "info",
      done: r.resolved,
      reminderId: r.id,
      notes: r.note,
    });
  });

  // The label comes from the tracker field, so a country that calls it a
  // "Prefettura appointment" says exactly that rather than a generic word of
  // ours.
  const apptLabel = new Map((appointmentFields ?? []).map((f) => [f.country_code + ":" + f.field_key, f.label]));
  (appointmentValues ?? []).forEach((row) => {
    const value = (row.field_value ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    const app = one(row.application as never) as { id?: string; student?: unknown; university?: unknown } | null;
    const student = one(app?.student as never) as { full_name?: string } | null;
    const uni = one(app?.university as never) as { destination?: unknown } | null;
    const dest = uni?.destination ? (one(uni.destination as never) as { country_code?: string } | null) : null;
    // A field key flagged for a different country is not this application's
    // appointment, even though the key matched.
    const label = apptLabel.get(dest?.country_code + ":" + row.field_key);
    if (!label) return;
    events.push({
      id: "appt-" + app?.id + "-" + row.field_key + "-" + value,
      date: value,
      // Tracker appointment fields are date-only, so there is no time to show.
      time: null,
      kind: "visa",
      label: label + " — " + (student?.full_name ?? "?"),
      tone: "success",
    });
  });

  // A deadline belongs to the student's processing officer. With nobody
  // assigned it falls back to the whole processing team, so an unassigned
  // student's deadlines are still on someone's calendar.
  function deadlineBelongsToTarget(processingOfficerId: string | null | undefined) {
    return processingOfficerId ? processingOfficerId === targetStaffId : targetIsProcessing;
  }

  (programDeadlines ?? []).forEach((a) => {
    const deadline = one(a.program)?.application_deadline;
    if (!deadline) return;
    if (deadline < rangeStartStr || deadline > rangeEndStr) return;
    const student = one(a.student);
    if (!deadlineBelongsToTarget(student?.processing_officer_id)) return;
    events.push({
      id: `deadline-${a.id}`,
      date: deadline,
      time: null,
      kind: "deadline",
      label: `${one(a.program)?.name} deadline — ${student?.full_name ?? "?"}`,
      tone: "danger",
    });
  });

  (documentDeadlines ?? []).forEach((d) => {
    const student = one(d.student);
    if (!deadlineBelongsToTarget(student?.processing_officer_id)) return;
    events.push({
      id: `docdeadline-${d.id}`,
      date: d.deadline!,
      time: null,
      kind: "deadline",
      label: `${d.custom_name ?? d.category ?? "Document"} due — ${student?.full_name ?? "?"}`,
      tone: "danger",
    });
  });

  (personalTasks ?? []).forEach((p) => {
    const dates = occurrenceDates(p.due_date, p.end_date, p.recurrence, p.recurrence_end_date, rangeStartStr, rangeEndStr);
    dates.forEach((date) => {
      events.push({
        id: `personal-${p.id}-${date}`,
        date,
        time: p.all_day ? null : p.due_time ? p.due_time.slice(0, 5) : null,
        kind: "personal",
        label: p.title,
        tone: "primary",
        color: p.color,
        priority: p.priority,
        done: p.status === "done",
        personalTaskId: p.id,
        description: p.title,
        notes: p.description ?? "",
        allDay: p.all_day,
        startDate: p.due_date,
        endDate: p.end_date,
        guestEmails: p.guest_emails ?? [],
        recurrence: (p.recurrence as CalendarRecurrence) ?? "none",
        recurrenceEndDate: p.recurrence_end_date,
        isRecurrenceInstance: dates.length > 1,
      });
    });
  });

  const eventsByDate: Record<string, CalendarEvent[]> = {};
  for (const e of events) {
    (eventsByDate[e.date] ??= []).push(e);
  }
  for (const key in eventsByDate) {
    eventsByDate[key].sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99"));
  }

  const { data: applications } = await supabase
    .from("applications")
    .select("id, student:leads(full_name), university:universities(name)")
    .order("created_at", { ascending: false });
  const applicationOptions = (applications ?? []).map((a) => ({
    id: a.id,
    label: `${one(a.student)?.full_name ?? "Student"} — ${one(a.university)?.name ?? "University"}`,
  }));

  const { data: staffList } = canViewOthers
    ? await supabase.from("staff").select("id, full_name").eq("status", "active").order("full_name")
    : { data: [] };

  return (
    <div className="w-full">
      <h2 className="mb-1 text-lg font-semibold text-ink">Calendar</h2>
      <p className="mb-4 text-sm text-muted">
        Daily/weekly/monthly view of tasks, reminders, deadlines, and visa appointments — plus your own personal reminders.
      </p>
      <CalendarShell
        view={view}
        referenceDate={toYMD(referenceDate)}
        todayStr={todayStr}
        eventsByDate={eventsByDate}
        applicationOptions={applicationOptions}
        staffOptions={staffList ?? []}
        canViewOthers={canViewOthers}
        selectedStaffId={targetStaffId}
        viewerStaffId={viewerId}
      />
    </div>
  );
}
