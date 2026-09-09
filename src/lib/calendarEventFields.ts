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

export const CALENDAR_RECURRENCES = ["none", "daily", "weekly", "monthly"] as const;
export type CalendarRecurrenceValue = (typeof CALENDAR_RECURRENCES)[number];

export const CALENDAR_PRIORITIES = ["urgent", "medium", "low"] as const;
export type CalendarPriority = (typeof CALENDAR_PRIORITIES)[number];

/** Deliberately plain: something before an @, something after, and a dot in it. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type GuestEmailsResult = { emails: string[]; error: string | null };

/**
 * Splits a comma-separated guest list and refuses anything that is not an
 * address. Duplicates are dropped and case is normalised, so the same person
 * listed twice is mailed once.
 */
export function parseGuestEmails(raw: FormDataEntryValue | string | null | undefined): GuestEmailsResult {
  const text = typeof raw === "string" ? raw : "";
  const parts = text
    .split(",")
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

export type EventFieldInput = {
  title: string;
  dueDate: string;
  endDate: string | null;
  recurrence: string;
  recurrenceEndDate: string | null;
  priority: string;
};

/** Returns the first problem with a calendar item's fields, or null. */
export function eventFieldsError(input: EventFieldInput): string | null {
  if (!input.title) return "Give it a title.";
  if (!input.dueDate) return "Give it a date.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) return "That date is not a valid one.";
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
  return null;
}
