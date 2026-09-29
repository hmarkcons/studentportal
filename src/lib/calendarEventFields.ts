// The fields a calendar item is made of, validated in one place.
//
// The two action files each had their own copy of parseGuestEmails, neither of
// which checked that a guest was an email address at all: a typed "john" or
// "john@" was stored and then handed to the mailer, so a guest expecting daily
// reminders silently never got one and nothing on screen said so.
//
// Recurrence and priority are constrained in the database, so a bad value
// cannot be stored — but it would arrive as "violates check constraint
// application_tasks_recurrence_check", which is not something a staff member
// can act on. Checked here so the message is a sentence.
//
// readEventForm is the one reading of the editor's form: the create and both
// update actions used to parse it three times over, and a field added to one
// copy was forgotten in the next.

export const CALENDAR_RECURRENCES = ["none", "daily", "weekly", "monthly", "yearly", "weekdays"] as const;
export type CalendarRecurrenceValue = (typeof CALENDAR_RECURRENCES)[number];

export const CALENDAR_PRIORITIES = ["urgent", "medium", "low"] as const;
export type CalendarPriority = (typeof CALENDAR_PRIORITIES)[number];

/** Four weeks, the most Google offers and what the 0295 check allows. */
export const NOTIFY_MAX_MINUTES = 40320;

export const LOCATION_MAX_LENGTH = 500;

/** Deliberately plain: something before an @, something after, and a dot in it. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_SHAPE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export type GuestEmailsResult = { emails: string[]; error: string | null };

/**
 * Splits a comma-separated guest list and refuses anything that is not an
 * address. Duplicates are dropped and case is normalised, so the same person
 * listed twice is mailed once.
 */
export function parseGuestEmails(raw: FormDataEntryValue | string | null | undefined): GuestEmailsResult {
  const text = typeof raw === "string" ? raw : "";
  const parts = text
    .split(/[,;\n]/)
    .map((e) => e.trim())
    .filter(Boolean);

  const bad = parts.filter((e) => !EMAIL_SHAPE.test(e));
  if (bad.length > 0) {
    return {
      emails: [],
      error: `${bad.length === 1 ? "This is not an email address" : "These are not email addresses"}: ${bad.join(", ")}. Guests are emailed the reminder, so a typo means they never hear about it.`,
    };
  }

  const seen = new Set<string>();
  const emails: string[] = [];
  for (const e of parts) {
    const key = e.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    emails.push(key);
  }
  return { emails, error: null };
}

/** Minutes before, from the form: blank or "none" is no notification. */
export function parseNotifyMinutes(raw: unknown): { value: number | null; error: string | null } {
  const text = typeof raw === "string" ? raw.trim() : raw === null || raw === undefined ? "" : String(raw);
  if (text === "" || text === "none") return { value: null, error: null };
  const n = Number(text);
  if (!Number.isInteger(n) || n < 0 || n > NOTIFY_MAX_MINUTES) {
    return { value: null, error: "A notification can be set from the time of the event to four weeks before." };
  }
  return { value: n, error: null };
}

export type EventFieldInput = {
  title: string;
  dueDate: string;
  endDate: string | null;
  recurrence: string;
  recurrenceEndDate: string | null;
  priority: string;
  /** Optional, so a caller that has no times still validates as it did. */
  allDay?: boolean;
  dueTime?: string | null;
  endTime?: string | null;
  location?: string | null;
  notifyMinutes?: number | null;
};

/** Returns the first problem with a calendar item's fields, or null. */
export function eventFieldsError(input: EventFieldInput): string | null {
  if (!input.title) return "Give it a title.";
  if (!input.dueDate) return "Give it a date.";
  if (!DATE_SHAPE.test(input.dueDate)) return "That date is not a valid one.";
  if (input.endDate && !DATE_SHAPE.test(input.endDate)) return "That end date is not a valid one.";
  if (input.endDate && input.endDate < input.dueDate) return "End date can't be before the start date.";

  if (!(CALENDAR_RECURRENCES as readonly string[]).includes(input.recurrence)) {
    return `Repeat has to be one of: ${CALENDAR_RECURRENCES.join(", ")}.`;
  }
  if (!(CALENDAR_PRIORITIES as readonly string[]).includes(input.priority)) {
    return `Priority has to be one of: ${CALENDAR_PRIORITIES.join(", ")}.`;
  }

  // A repeat that stops before it starts produces an item that exists in the
  // database and appears nowhere, which reads as the save having failed.
  if (input.recurrenceEndDate && input.recurrence !== "none" && input.recurrenceEndDate < input.dueDate) {
    return "The repeat ends before it starts — it would never appear on the calendar.";
  }
  if (input.recurrenceEndDate && input.recurrence === "none") {
    return "Choose how often it repeats, or clear the repeat-until date.";
  }

  if (!input.allDay) {
    if (input.dueTime && !TIME_SHAPE.test(input.dueTime)) return "That start time is not a valid one.";
    if (input.endTime && !TIME_SHAPE.test(input.endTime)) return "That end time is not a valid one.";
    if (input.endTime && !input.dueTime) return "Give it a start time, or clear the end time.";
    // On one day the end has to come after the start. Across several days an
    // earlier clock time on the last day is an ordinary overnight booking.
    const sameDay = !input.endDate || input.endDate === input.dueDate;
    if (sameDay && input.dueTime && input.endTime && input.endTime.slice(0, 5) <= input.dueTime.slice(0, 5)) {
      return "It ends before it starts — make the end time later than the start.";
    }
  }

  if (input.notifyMinutes !== null && input.notifyMinutes !== undefined) {
    if (!Number.isInteger(input.notifyMinutes) || input.notifyMinutes < 0 || input.notifyMinutes > NOTIFY_MAX_MINUTES) {
      return "A notification can be set from the time of the event to four weeks before.";
    }
  }
  if (input.location && input.location.length > LOCATION_MAX_LENGTH) {
    return `Keep the location under ${LOCATION_MAX_LENGTH} characters.`;
  }
  return null;
}

/** The columns an editable calendar item is saved with, named as the tables name them. */
export type EventFormValues = {
  title: string;
  notes: string | null;
  due_date: string;
  end_date: string | null;
  all_day: boolean;
  due_time: string | null;
  end_time: string | null;
  priority: string;
  color: string | null;
  guest_emails: string[];
  recurrence: string;
  recurrence_end_date: string | null;
  location: string | null;
  notify_minutes: number | null;
};

type FormLike = { get(name: string): unknown };

function text(form: FormLike, name: string): string {
  const v = form.get(name);
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Reads the editor's form into the columns it saves, or says what is wrong
 * with it. An all-day item keeps no times; an end date on the start day is no
 * end date, so a one-day item is never drawn as a span.
 */
export function readEventForm(form: FormLike): { values: EventFormValues; error: string | null } {
  const all_day = form.get("all_day") === "on" || form.get("all_day") === "true";
  const due_date = text(form, "due_date");
  const rawEnd = text(form, "end_date") || null;
  const due_time = all_day ? null : text(form, "due_time") || null;
  const end_time = all_day ? null : text(form, "end_time") || null;
  const recurrence = text(form, "recurrence") || "none";
  const guests = parseGuestEmails(text(form, "guest_emails"));
  const notify = parseNotifyMinutes(form.get("notify_minutes"));

  const values: EventFormValues = {
    title: text(form, "title"),
    notes: text(form, "notes") || null,
    due_date,
    end_date: rawEnd,
    all_day,
    due_time,
    end_time,
    priority: text(form, "priority") || "medium",
    color: text(form, "color") || null,
    guest_emails: guests.emails,
    recurrence,
    recurrence_end_date: text(form, "recurrence_end_date") || null,
    location: text(form, "location") || null,
    notify_minutes: notify.value,
  };

  const error =
    guests.error ??
    notify.error ??
    eventFieldsError({
      title: values.title,
      dueDate: values.due_date,
      endDate: values.end_date,
      recurrence: values.recurrence,
      recurrenceEndDate: values.recurrence_end_date,
      priority: values.priority,
      allDay: values.all_day,
      dueTime: values.due_time,
      endTime: values.end_time,
      location: values.location,
      notifyMinutes: values.notify_minutes,
    });

  if (!error && values.end_date === values.due_date) values.end_date = null;
  return { values, error };
}

/** The columns migration 0295 adds. */
export const CALENDAR_0295_COLUMNS = ["end_time", "location", "notify_minutes"] as const;

/**
 * Whether a PostgREST error is about a column that does not exist yet — the
 * minutes between this code deploying and 0295 being applied. 42703 is
 * Postgres's undefined_column (a read); PGRST204 is PostgREST not finding a
 * column it was asked to write.
 */
export function isMissingColumnError(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  return /column .* does not exist|Could not find the .* column/i.test(error.message ?? "");
}

/**
 * The same write without 0295's columns — but only when that loses nothing.
 * Returns null when one of them holds a value, so the caller says the
 * migration is missing rather than silently dropping what was typed.
 */
export function withoutNewColumns<T extends Record<string, unknown>>(payload: T): Omit<T, (typeof CALENDAR_0295_COLUMNS)[number]> | null {
  const rest: Record<string, unknown> = { ...payload };
  for (const column of CALENDAR_0295_COLUMNS) {
    const v = rest[column];
    if (v !== null && v !== undefined) return null;
    delete rest[column];
  }
  return rest as Omit<T, (typeof CALENDAR_0295_COLUMNS)[number]>;
}

export const MIGRATION_0295_MISSING =
  "End times, places and notifications need database migration 0295, which has not been applied yet. Clear those fields to save, or ask for the migration.";
