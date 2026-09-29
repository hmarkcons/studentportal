// What a calendar item is once it reaches the screen, and how each table's row
// becomes one.
//
// The staff page and the calendar search both turn rows into items, and the
// student calendar builds its own read-only ones; with the shape and the
// mapping here, a field the editor needs cannot be filled in one place and
// forgotten in the other.
//
// Pure, so it is unit-tested under plain Node (scripts/calendar-items-test.mjs).

import { occurrencesInRange, isRecurrence, type Recurrence } from "./calendarRecurrence.ts";

export type CalendarEventKind =
  // staff
  | "personal"
  | "task"
  | "reminder"
  | "deadline"
  | "visa"
  // student
  | "appointment"
  | "interview"
  | "payment"
  | "document"
  | "scholarship"
  | "passport";

/** What may be done to an item from the calendar itself. */
export type CalendarAbilities = {
  edit: boolean;
  move: boolean;
  resize: boolean;
  tick: boolean;
  remove: boolean;
};

const READ_ONLY: CalendarAbilities = { edit: false, move: false, resize: false, tick: false, remove: false };

export type CalendarEvent = {
  /** Unique per occurrence: a weekly series has one per week. */
  id: string;
  /** The same for every occurrence of one item, e.g. "personal:<uuid>". */
  seriesKey: string;
  kind: CalendarEventKind;
  /** The day this occurrence starts on. */
  date: string;
  /** The last day of a multi-day item; null for one that fits in a day. */
  spanEnd: string | null;
  /** "HH:MM" in Karachi; null for an all-day or untimed item. */
  time: string | null;
  endTime: string | null;
  title: string;
  /** A second line: the student, the university. */
  subtitle?: string | null;
  done: boolean;
  /** A colour key from eventColors, overriding the kind's own. */
  color: string | null;
  can: CalendarAbilities;
  /** The row behind an editable item. */
  source?: { table: "personal_tasks" | "application_tasks" | "reminders"; id: string };

  // What the editor and the detail card show.
  rawTitle?: string;
  notes?: string | null;
  priority?: string;
  allDay?: boolean;
  /** The series' own first day and last day, which an occurrence is not. */
  startDate?: string;
  endDate?: string | null;
  guestEmails?: string[];
  recurrence?: Recurrence;
  recurrenceEndDate?: string | null;
  location?: string | null;
  notifyMinutes?: number | null;
  studentId?: string | null;
  studentName?: string | null;
  /** Where the item is really kept, for one that is a record of something else. */
  href?: string | null;
  hrefLabel?: string | null;
  /** Why it cannot be changed here, said on its card. */
  origin?: string | null;
};

export type DateRange = { start: string; end: string };

function hhmm(time: string | null | undefined): string | null {
  return time ? time.slice(0, 5) : null;
}

function recurrenceOf(value: string | null | undefined): Recurrence {
  return isRecurrence(value) ? value : "none";
}

export type TaskRowInput = {
  id: string;
  description: string;
  notes: string | null;
  due_date: string | null;
  due_time: string | null;
  end_date: string | null;
  end_time?: string | null;
  all_day: boolean | null;
  priority: string | null;
  status: string;
  color: string | null;
  guest_emails: string[] | null;
  recurrence: string | null;
  recurrence_end_date: string | null;
  location?: string | null;
  notify_minutes?: number | null;
  applicationId: string | null;
  studentId: string | null;
  studentName: string | null;
};

/** A student/application task, once per occurrence inside the range. */
export function taskEvents(row: TaskRowInput, range: DateRange): CalendarEvent[] {
  if (!row.due_date) return [];
  const allDay = row.all_day !== false;
  const recurrence = recurrenceOf(row.recurrence);
  const occurrences = occurrencesInRange(row.due_date, row.end_date, recurrence, row.recurrence_end_date, range.start, range.end);
  const time = allDay ? null : hhmm(row.due_time);
  return occurrences.map(({ date, spanEnd }) => ({
    id: `task-${row.id}-${date}`,
    seriesKey: `task:${row.id}`,
    kind: "task" as const,
    date,
    spanEnd,
    time,
    endTime: time ? hhmm(row.end_time) : null,
    title: row.studentName ? `${row.description} — ${row.studentName}` : row.description,
    subtitle: row.studentName,
    done: row.status === "done",
    color: row.color,
    can: { edit: true, move: true, resize: Boolean(time) && !spanEnd, tick: true, remove: true },
    source: { table: "application_tasks" as const, id: row.id },
    rawTitle: row.description,
    notes: row.notes,
    priority: row.priority ?? "medium",
    allDay,
    startDate: row.due_date!,
    endDate: row.end_date,
    guestEmails: row.guest_emails ?? [],
    recurrence,
    recurrenceEndDate: row.recurrence_end_date,
    location: row.location ?? null,
    notifyMinutes: row.notify_minutes ?? null,
    studentId: row.studentId,
    studentName: row.studentName,
    href: row.studentId && row.applicationId ? `/students/${row.studentId}/applications/${row.applicationId}` : null,
    hrefLabel: row.studentId && row.applicationId ? "Open the application" : null,
  }));
}

export type PersonalRowInput = {
  id: string;
  title: string;
  description: string | null;
  due_date: string;
  due_time: string | null;
  end_date: string | null;
  end_time?: string | null;
  all_day: boolean | null;
  priority: string | null;
  status: string;
  color: string | null;
  guest_emails: string[] | null;
  recurrence: string | null;
  recurrence_end_date: string | null;
  location?: string | null;
  notify_minutes?: number | null;
  student_id: string | null;
  studentName: string | null;
};

/** A personal task or reminder, once per occurrence inside the range. */
export function personalEvents(row: PersonalRowInput, range: DateRange): CalendarEvent[] {
  const allDay = row.all_day === true;
  const recurrence = recurrenceOf(row.recurrence);
  const occurrences = occurrencesInRange(row.due_date, row.end_date, recurrence, row.recurrence_end_date, range.start, range.end);
  const time = allDay ? null : hhmm(row.due_time);
  return occurrences.map(({ date, spanEnd }) => ({
    id: `personal-${row.id}-${date}`,
    seriesKey: `personal:${row.id}`,
    kind: "personal" as const,
    date,
    spanEnd,
    time,
    endTime: time ? hhmm(row.end_time) : null,
    title: row.title,
    subtitle: row.studentName,
    done: row.status === "done",
    color: row.color,
    can: { edit: true, move: true, resize: Boolean(time) && !spanEnd, tick: true, remove: true },
    source: { table: "personal_tasks" as const, id: row.id },
    rawTitle: row.title,
    notes: row.description,
    priority: row.priority ?? "medium",
    allDay,
    startDate: row.due_date,
    endDate: row.end_date,
    guestEmails: row.guest_emails ?? [],
    recurrence,
    recurrenceEndDate: row.recurrence_end_date,
    location: row.location ?? null,
    notifyMinutes: row.notify_minutes ?? null,
    studentId: row.student_id,
    studentName: row.studentName,
    href: row.student_id ? `/students/${row.student_id}` : null,
    hrefLabel: row.student_id ? `Open ${row.studentName ?? "the student"}` : null,
  }));
}

export type ReminderRowInput = {
  id: string;
  type: string;
  due_date: string;
  due_time: string | null;
  note: string | null;
  resolved: boolean;
  studentId: string | null;
  studentName: string | null;
  contactNumber: string | null;
};

/**
 * A lead's reminder. It can be moved to another day or time, resolved and
 * edited, but it has no end: it is a moment to follow up, not a meeting.
 */
export function reminderEvent(row: ReminderRowInput): CalendarEvent {
  const name = row.studentName ?? "?";
  const title =
    row.type === "follow_up"
      ? `${name} - Follow-up${row.contactNumber ? ` (${row.contactNumber})` : ""}`
      : `${row.type.replace(/_/g, " ")} — ${name}`;
  return {
    id: `reminder-${row.id}`,
    seriesKey: `reminder:${row.id}`,
    kind: "reminder",
    date: row.due_date,
    spanEnd: null,
    time: hhmm(row.due_time),
    endTime: null,
    title,
    subtitle: row.studentName,
    done: row.resolved,
    color: null,
    can: { edit: true, move: true, resize: false, tick: true, remove: true },
    source: { table: "reminders", id: row.id },
    rawTitle: title,
    notes: row.note,
    studentId: row.studentId,
    studentName: row.studentName,
    href: row.studentId ? `/leads/${row.studentId}` : null,
    hrefLabel: row.studentId ? `Open ${name}` : null,
  };
}

/**
 * Something the calendar shows but does not own — a deadline, a tracker
 * appointment, an instalment. Its card links to where it is changed.
 */
export function recordEvent(input: {
  id: string;
  kind: CalendarEventKind;
  date: string;
  title: string;
  subtitle?: string | null;
  time?: string | null;
  endTime?: string | null;
  notes?: string | null;
  location?: string | null;
  href?: string | null;
  hrefLabel?: string | null;
  origin?: string | null;
  done?: boolean;
  studentId?: string | null;
  studentName?: string | null;
}): CalendarEvent {
  return {
    id: input.id,
    seriesKey: input.id,
    kind: input.kind,
    date: input.date,
    spanEnd: null,
    time: input.time ?? null,
    endTime: input.endTime ?? null,
    title: input.title,
    subtitle: input.subtitle ?? null,
    done: input.done ?? false,
    color: null,
    can: READ_ONLY,
    notes: input.notes ?? null,
    location: input.location ?? null,
    href: input.href ?? null,
    hrefLabel: input.hrefLabel ?? null,
    origin: input.origin ?? null,
    studentId: input.studentId ?? null,
    studentName: input.studentName ?? null,
  };
}

// ------------------------------------------------------------- reading

/** Whether an item is on a day: its start, or any day of its span. */
export function coversDate(e: Pick<CalendarEvent, "date" | "spanEnd">, day: string): boolean {
  return e.date === day || (e.spanEnd !== null && e.date <= day && day <= e.spanEnd);
}

/** Whether it is drawn as a block on the hour grid, rather than in the all-day row. */
export function isGridTimed(e: Pick<CalendarEvent, "time" | "spanEnd">): boolean {
  return e.time !== null && e.spanEnd === null;
}

/**
 * A day's order: spans first, then all-day, then by time, then by title —
 * how Google lists them in a month cell and in "+N more".
 */
export function compareForDay(a: CalendarEvent, b: CalendarEvent): number {
  const spanA = a.spanEnd ? 0 : 1;
  const spanB = b.spanEnd ? 0 : 1;
  if (spanA !== spanB) return spanA - spanB;
  const ta = a.time ?? "";
  const tb = b.time ?? "";
  if (ta !== tb) return ta === "" ? -1 : tb === "" ? 1 : ta.localeCompare(tb);
  return a.title.localeCompare(b.title);
}

export function eventsOn(events: readonly CalendarEvent[], day: string): CalendarEvent[] {
  return events.filter((e) => coversDate(e, day)).sort(compareForDay);
}

/** Case-insensitive, on what the item says: its title, second line, place and notes. */
export function matchesQuery(e: CalendarEvent, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return [e.title, e.subtitle, e.location, e.notes].some((field) => (field ?? "").toLowerCase().includes(q));
}
