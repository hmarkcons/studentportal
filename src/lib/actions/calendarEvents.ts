"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getStaffSession } from "@/lib/auth/session";
import { hasRole } from "@/lib/auth/roles";
import { readEventForm } from "@/lib/calendarEventFields";
import { upcomingNotifications, type DueNotification, type NotifySource } from "@/lib/calendarRecurrence";
import { dayDelta, karachiClock, minutesOf, parseDateParam, shiftDate } from "@/lib/calendarLayout";
import { personalEvents, reminderEvent, taskEvents, type CalendarEvent } from "@/lib/calendarItems";
import {
  eventColumns,
  likePattern,
  one,
  personalInput,
  personalSelect,
  readWith0295,
  taskInput,
  taskSelect,
  withoutEmpty,
  writeRows,
  type RawPersonalRow,
  type RawTaskRow,
  type WriteResult,
} from "@/lib/calendarQueries";

type ActionResult = { success?: boolean; error?: string; id?: string };

/** personal_tasks keeps the notes in `description`; its title is the title. */
function personalColumns(values: Parameters<typeof eventColumns>[0]) {
  const { notes, ...shared } = eventColumns(values);
  return { description: notes, ...shared };
}

const TASK_REFUSED =
  "Not saved — this task belongs to a student you don't process, or it no longer exists. Ask their processing officer to change it.";
const PERSONAL_REFUSED = "Not saved — this item is not yours to change, or it no longer exists.";
const REMINDER_REFUSED = "Not saved — this reminder is not yours to change, or it no longer exists.";

/**
 * Anything added from the calendar: a personal item, or a task on a
 * student's application. One action rather than two so the quick-add card and
 * the full editor share one title, one date and one set of fields.
 */
export async function createCalendarEvent(revalidateTo: string, _prevState: unknown, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { values, error: invalid } = readEventForm(formData);
  if (invalid) return { error: invalid };
  const type = String(formData.get("type") ?? "personal");

  if (type === "task") {
    const application_id = String(formData.get("application_id") ?? "");
    if (!application_id) return { error: "Choose the student and application this task is for." };
    const { rows, error } = await writeRows(
      (p) => supabase.from("application_tasks").insert(p).select("id") as unknown as PromiseLike<WriteResult>,
      withoutEmpty({
        application_id,
        description: values.title,
        // Whose it is — the calendar notifies the owner, and a task nobody
        // owns reminds nobody.
        owner_id: user.id,
        ...eventColumns(values),
      })
    );
    if (error) return { error };
    if (rows.length === 0) return { error: TASK_REFUSED };
    revalidatePath(revalidateTo);
    return { success: true, id: rows[0].id };
  }

  const { rows, error } = await writeRows(
    (p) => supabase.from("personal_tasks").insert(p).select("id") as unknown as PromiseLike<WriteResult>,
    withoutEmpty({ owner_id: user.id, title: values.title, ...personalColumns(values) })
  );
  if (error) return { error };
  if (rows.length === 0) return { error: PERSONAL_REFUSED };
  revalidatePath(revalidateTo);
  return { success: true, id: rows[0].id };
}

/** The full editor, for a task on a student's application. */
export async function updateCalendarTask(taskId: string, revalidateTo: string, _prevState: unknown, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { values, error: invalid } = readEventForm(formData);
  if (invalid) return { error: invalid };

  const { rows, error } = await writeRows(
    (p) => supabase.from("application_tasks").update(p).eq("id", taskId).select("id") as unknown as PromiseLike<WriteResult>,
    { description: values.title, ...eventColumns(values) }
  );
  if (error) return { error };
  if (rows.length === 0) return { error: TASK_REFUSED };
  revalidatePath(revalidateTo);
  return { success: true, id: taskId };
}

export async function toggleCalendarTask(taskId: string, revalidateTo: string, done: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("application_tasks")
    .update({ status: done ? "done" : "pending" })
    .eq("id", taskId)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: TASK_REFUSED };
  revalidatePath(revalidateTo);
  return { success: true };
}

export async function deleteCalendarTask(taskId: string, revalidateTo: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("application_tasks").delete().eq("id", taskId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Not deleted — this task belongs to a student you don't process, or it is already gone." };
  revalidatePath(revalidateTo);
  return { success: true };
}

export type CalendarMove = {
  table: "personal_tasks" | "application_tasks" | "reminders";
  id: string;
  /** The day of the occurrence that was dragged, and the day it was dropped on. */
  fromDate: string;
  toDate: string;
  /** "HH:MM"; null when it was dropped into the all-day row. */
  time: string | null;
  endTime: string | null;
};

/**
 * A drag on the calendar: a new day, a new time, a new end.
 *
 * A repeating item moves as a series — every occurrence by the same number of
 * days, its repeat-until date with it — since one occurrence cannot be held
 * apart from the rest. A multi-day item keeps its length.
 */
export async function moveCalendarItem(move: CalendarMove, revalidateTo: string): Promise<ActionResult> {
  const from = parseDateParam(move.fromDate);
  const to = parseDateParam(move.toDate);
  if (!from || !to) return { error: "That day is not a valid one." };
  const start = move.time === null ? null : minutesOf(move.time);
  const end = move.endTime === null ? null : minutesOf(move.endTime);
  if (move.time !== null && start === null) return { error: "That time is not a valid one." };
  if (move.endTime !== null && (end === null || start === null || end <= start)) return { error: "It has to end after it starts." };

  const supabase = await createClient();

  if (move.table === "reminders") {
    const { data, error } = await supabase
      .from("reminders")
      .update({ due_date: to, due_time: move.time })
      .eq("id", move.id)
      .select("id");
    if (error) return { error: error.message };
    if (!data?.length) return { error: REMINDER_REFUSED };
    revalidatePath(revalidateTo);
    return { success: true };
  }

  const { data: current, error: readError } = await supabase
    .from(move.table)
    .select("due_date, end_date, recurrence_end_date")
    .eq("id", move.id)
    .maybeSingle();
  if (readError) return { error: readError.message };
  if (!current?.due_date) return { error: move.table === "application_tasks" ? TASK_REFUSED : PERSONAL_REFUSED };

  const days = dayDelta(from, to);
  const { rows, error } = await writeRows(
    (p) => supabase.from(move.table).update(p).eq("id", move.id).select("id") as unknown as PromiseLike<WriteResult>,
    {
      due_date: shiftDate(current.due_date, days),
      end_date: current.end_date ? shiftDate(current.end_date, days) : null,
      recurrence_end_date: current.recurrence_end_date ? shiftDate(current.recurrence_end_date, days) : null,
      all_day: move.time === null,
      due_time: move.time,
      end_time: move.endTime,
    }
  );
  if (error) return { error };
  if (rows.length === 0) return { error: move.table === "application_tasks" ? TASK_REFUSED : PERSONAL_REFUSED };
  revalidatePath(revalidateTo);
  return { success: true };
}

// Reminders (stall/deadline/follow_up) stay visible on the calendar once
// resolved instead of disappearing — resolved just strikes them through, so
// staff can still reopen, edit, or delete them afterward.
export async function toggleReminderResolved(reminderId: string, revalidateTo: string, resolved: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("reminders").update({ resolved }).eq("id", reminderId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: REMINDER_REFUSED };
  revalidatePath(revalidateTo);
  return { success: true };
}

export async function updateReminder(reminderId: string, revalidateTo: string, _prevState: unknown, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();

  const due_date = String(formData.get("due_date") ?? "");
  const due_time = String(formData.get("due_time") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim();
  if (!parseDateParam(due_date)) return { error: "A date is required." };
  if (due_time && minutesOf(due_time) === null) return { error: "That time is not a valid one." };

  const { data, error } = await supabase
    .from("reminders")
    .update({ due_date, due_time, note: note || null })
    .eq("id", reminderId)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: REMINDER_REFUSED };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function deleteReminder(reminderId: string, revalidateTo: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("reminders").delete().eq("id", reminderId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Not deleted — this reminder is not yours, or it is already gone." };
  revalidatePath(revalidateTo);
  return { success: true };
}

// ------------------------------------------------------------ notifications

type NotifyRow = {
  id: string;
  title?: string;
  description?: string;
  due_date: string;
  due_time: string | null;
  all_day: boolean | null;
  recurrence: string | null;
  recurrence_end_date: string | null;
  notify_minutes: number | null;
};

/**
 * The signed-in person's own notifications due in the next day or so — their
 * personal items, and the application tasks they own — for the notifier the
 * staff layout keeps mounted (src/components/CalendarNotifier.tsx).
 *
 * Nothing at all before migration 0295: the column the question is about does
 * not exist, and a notifier that fails every few minutes helps nobody.
 */
export async function loadCalendarNotifications(): Promise<DueNotification[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const now = Date.now();
  const today = karachiClock(now).date;
  // A week-before notification for something eight days away is due now.
  const bound = shiftDate(today, 30);
  // A one-off in the past has nothing left to notify; a series may.
  const stillAhead = `due_date.gte.${today},recurrence.neq.none`;

  const [personal, tasks] = await Promise.all([
    supabase
      .from("personal_tasks")
      .select("id, title, due_date, due_time, all_day, recurrence, recurrence_end_date, notify_minutes")
      .eq("owner_id", user.id)
      .eq("status", "pending")
      .not("notify_minutes", "is", null)
      .lte("due_date", bound)
      .or(stillAhead)
      .limit(500),
    supabase
      .from("application_tasks")
      .select("id, description, due_date, due_time, all_day, recurrence, recurrence_end_date, notify_minutes")
      .eq("owner_id", user.id)
      .eq("status", "pending")
      .not("notify_minutes", "is", null)
      .lte("due_date", bound)
      .or(stillAhead)
      .limit(500),
  ]);

  const sources: NotifySource[] = [];
  const add = (rows: NotifyRow[] | null, prefix: string) => {
    for (const r of rows ?? []) {
      if (r.notify_minutes === null || !r.due_date) continue;
      sources.push({
        key: `${prefix}:${r.id}`,
        title: r.title ?? r.description ?? "Calendar item",
        dueDate: r.due_date,
        dueTime: r.due_time,
        allDay: r.all_day === true,
        recurrence: r.recurrence,
        recurrenceEndDate: r.recurrence_end_date,
        notifyMinutes: r.notify_minutes,
      });
    }
  };
  if (!personal.error) add(personal.data as NotifyRow[] | null, "personal");
  if (!tasks.error) add(tasks.data as NotifyRow[] | null, "task");
  return upcomingNotifications(sources, now);
}

// ------------------------------------------------------------------- search

/**
 * Items whose title — or, for a reminder, whose lead — matches, on any date.
 *
 * The calendar page only holds the period on screen, and a search that found
 * only this week's items would read as "there is no such item". Deadlines and
 * tracker appointments are matched on the page itself, within the period it
 * loaded: they are records kept elsewhere and have their own pages to search.
 *
 * Scoped as the page is: someone's personal items are theirs alone, and when
 * management looks at a colleague's calendar the tasks and follow-ups are
 * that colleague's students'.
 */
export async function searchCalendar(query: string, staffId?: string | null): Promise<{ events: CalendarEvent[]; error?: string }> {
  const q = query.trim();
  if (q.length < 2) return { events: [] };

  const { supabase, staff } = await getStaffSession();
  if (!staff) return { events: [], error: "Not signed in." };
  const canViewOthers = hasRole(staff, "management") || hasRole(staff, "super_admin");
  const target = canViewOthers && staffId ? staffId : staff.id;
  const viewingSomeoneElse = target !== staff.id;
  const pattern = likePattern(q);

  const [personal, tasks, reminders] = await Promise.all([
    readWith0295<RawPersonalRow>(
      (with0295) =>
        supabase
          .from("personal_tasks")
          .select(personalSelect(with0295))
          .eq("owner_id", target)
          .ilike("title", pattern)
          .order("due_date", { ascending: false })
          .limit(40) as never
    ),
    readWith0295<RawTaskRow>(
      (with0295) =>
        supabase
          .from("application_tasks")
          .select(taskSelect(with0295))
          .not("due_date", "is", null)
          .ilike("description", pattern)
          .order("due_date", { ascending: false })
          .limit(40) as never
    ),
    supabase
      .from("reminders")
      .select("id, type, due_date, due_time, note, resolved, created_by, student:leads!inner(id, full_name, assigned_counselor_id, contact_number)")
      .not("due_date", "is", null)
      .ilike("student.full_name", pattern)
      .order("due_date", { ascending: false })
      .limit(40),
  ]);

  const events: CalendarEvent[] = [];
  const at = (date: string, endDate: string | null) => ({ start: date, end: endDate && endDate > date ? endDate : date });

  for (const raw of personal.data) {
    const input = personalInput(raw);
    events.push(...personalEvents(input, at(input.due_date, input.end_date)).slice(0, 1));
  }
  for (const raw of tasks.data) {
    const { input, student } = taskInput(raw);
    if (!input.due_date) continue;
    if (viewingSomeoneElse && student?.assigned_counselor_id !== target && student?.processing_officer_id !== target) continue;
    events.push(...taskEvents(input, at(input.due_date, input.end_date)).slice(0, 1));
  }
  for (const r of reminders.data ?? []) {
    const student = one(r.student as never) as { id?: string; full_name?: string; assigned_counselor_id?: string | null; contact_number?: string | null } | null;
    // Follow-ups are one person's: the lead's counsellor, or whoever set it.
    if (r.type === "follow_up" && (student?.assigned_counselor_id ?? r.created_by) !== target) continue;
    events.push(
      reminderEvent({
        id: r.id,
        type: r.type,
        due_date: r.due_date!,
        due_time: r.due_time,
        note: r.note,
        resolved: r.resolved,
        studentId: student?.id ?? null,
        studentName: student?.full_name ?? null,
        contactNumber: student?.contact_number ?? null,
      })
    );
  }

  const error = personal.error ?? tasks.error ?? reminders.error?.message ?? undefined;
  return { events: events.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "")), error };
}
