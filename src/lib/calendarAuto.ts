// What goes on a calendar without anyone adding it — a student's interview,
// an instalment falling due, a lead's follow-up, an application deadline, an
// event someone was invited to — and when each is reminded of: the day
// before, and again an hour before anything with a time.
//
// Each item is made from the record itself, every time, so it moves when the
// record moves and is gone once the thing is done: an interview held, an
// instalment paid, a follow-up resolved. Nobody ticks these off.
//
// Pure, so the unit tests import it directly (scripts/calendar-auto-test.mjs).

import { karachiClock, karachiEpoch, minutesOf, shiftDate, timeOf } from "./calendarLayout.ts";
import { expandOccurrences, UNTIMED_NOTIFY_MINUTES, type NotifySource } from "./calendarRecurrence.ts";
import { isUpcomingStatus, platformLabel } from "./interviews.ts";
import { formatFee } from "./applicationFee.ts";
import { recordEvent, type CalendarEvent, type CalendarEventKind } from "./calendarItems.ts";

export type Audience = "staff" | "student" | "partner" | "guest";

export type AutoItem = {
  /** Stable for the thing and its moment: a rescheduled interview is reminded of again. */
  key: string;
  kind: CalendarEventKind;
  date: string;
  /** "HH:MM" in Karachi; null for something due on a day. */
  time: string | null;
  endTime: string | null;
  title: string;
  subtitle?: string | null;
  location?: string | null;
  notes?: string | null;
  href?: string | null;
  hrefLabel?: string | null;
  origin?: string | null;
  studentId?: string | null;
  studentName?: string | null;
};

/** How long before something with a time the second reminder comes. */
export const SOON_MINUTES = 60;
/** The first reminder: the day before. */
export const DAY_BEFORE_MINUTES = 1440;

// ------------------------------------------------------------- interviews

export type InterviewRecord = {
  id: string;
  applicationId: string;
  confirmedAt: string | null;
  status: string | null;
  roundLabel: string | null;
  platform: string | null;
  platformOther: string | null;
  details: string | null;
  studentId: string | null;
  studentName: string | null;
  university: string | null;
  program: string | null;
};

/** An interview still ahead, on the calendar of whoever is reading. Null once it is held or called off. */
export function interviewItem(r: InterviewRecord, audience: Audience): AutoItem | null {
  if (!r.confirmedAt || !isUpcomingStatus(r.status)) return null;
  const at = Date.parse(r.confirmedAt);
  if (Number.isNaN(at)) return null;
  const clock = karachiClock(at);
  const student = r.studentName ?? "Student";
  const uni = r.university ?? "the university";
  const round = r.roundLabel ? ` · ${r.roundLabel}` : "";
  const title =
    audience === "student"
      ? `Interview with ${uni}`
      : audience === "partner"
        ? `Interview — ${student}${r.program ? ` (${r.program})` : ""}`
        : `Interview — ${student} (${uni})`;
  return {
    key: `interview:${r.id}:${r.confirmedAt}`,
    kind: "interview",
    date: clock.date,
    time: timeOf(clock.minutes),
    endTime: timeOf(Math.min(clock.minutes + 60, 1439)),
    title,
    subtitle: audience === "student" ? (r.program ?? null) : student,
    location: [platformLabel(r.platform, r.platformOther), audience === "student" ? null : uni].filter(Boolean).join(" · ") + round,
    notes: r.details,
    href:
      audience === "student"
        ? "/portal/appointments"
        : audience === "partner"
          ? `/partner/applications/${r.applicationId}`
          : r.studentId
            ? `/students/${r.studentId}/applications/${r.applicationId}`
            : null,
    hrefLabel: audience === "student" ? "Open Appointments for the link and details" : "Open the application",
    origin: "Shown in Pakistan time. It moves when the interview is rescheduled, and goes once it is held.",
    studentId: r.studentId,
    studentName: r.studentName,
  };
}

// ------------------------------------------------------------- instalments

export type InstalmentRecord = {
  id: string;
  installmentNo: number | null;
  dueDate: string | null;
  amount: number | string | null;
  amountPaid: number | string | null;
  status: string | null;
  currency: string | null;
  studentId: string | null;
  studentName: string | null;
};

/** What is still to pay on an instalment: the whole of it, or what a part payment left. */
export function outstanding(r: Pick<InstalmentRecord, "amount" | "amountPaid">): number {
  const amount = Number(r.amount ?? 0);
  const paid = Number(r.amountPaid ?? 0);
  const left = (Number.isFinite(amount) ? amount : 0) - (Number.isFinite(paid) ? paid : 0);
  return Math.max(0, Math.round(left * 100) / 100);
}

/** An instalment not yet paid in full, on the day it is due. Null once it is paid. */
export function instalmentItem(r: InstalmentRecord, audience: Audience, today: string): AutoItem | null {
  if (!r.dueDate || r.status === "paid") return null;
  const left = outstanding(r);
  const money = formatFee(left, r.currency);
  const no = r.installmentNo ? ` ${r.installmentNo}` : "";
  const overdue = r.dueDate < today;
  return {
    key: `instalment:${r.id}:${r.dueDate}`,
    kind: "payment",
    date: r.dueDate,
    time: null,
    endTime: null,
    title: audience === "student" ? `Instalment${no} due — ${money}` : `Instalment${no} due — ${r.studentName ?? "Student"} — ${money}`,
    subtitle: audience === "student" ? null : (r.studentName ?? null),
    href: audience === "student" ? "/portal/payments" : r.studentId ? `/students/${r.studentId}?open=invoice` : null,
    hrefLabel: audience === "student" ? "Open Payments" : "Open the student's invoice",
    origin: overdue ? "Overdue — it stays on the calendar until it is paid." : "Due on this date. It goes from the calendar once it is paid.",
    studentId: r.studentId,
    studentName: r.studentName,
  };
}

// ------------------------------------------------------------- follow-ups

export type FollowUpRecord = {
  id: string;
  dueDate: string | null;
  dueTime: string | null;
  note: string | null;
  resolved: boolean;
  studentId: string | null;
  studentName: string | null;
  contactNumber: string | null;
};

/** A lead's follow-up not yet resolved. (The calendar draws these itself; this is for reminding.) */
export function followUpItem(r: FollowUpRecord): AutoItem | null {
  if (!r.dueDate || r.resolved) return null;
  const time = r.dueTime ? r.dueTime.slice(0, 5) : null;
  return {
    key: `followup:${r.id}:${r.dueDate}:${time ?? ""}`,
    kind: "reminder",
    date: r.dueDate,
    time,
    endTime: null,
    title: `Follow-up — ${r.studentName ?? "Lead"}${r.contactNumber ? ` (${r.contactNumber})` : ""}`,
    notes: r.note,
    href: r.studentId ? `/leads/${r.studentId}` : null,
    hrefLabel: "Open the lead",
    studentId: r.studentId,
    studentName: r.studentName,
  };
}

// ------------------------------------------------------------- deadlines

export type DeadlineRecord = {
  applicationId: string;
  date: string | null;
  studentName: string | null;
  program: string | null;
  roundLabel: string | null;
  university: string | null;
};

/** An application's deadline, for the university's own calendar or the student's. */
export function deadlineItem(r: DeadlineRecord, audience: Audience): AutoItem | null {
  if (!r.date) return null;
  const what = r.program ? `${r.program}${r.roundLabel ? ` (${r.roundLabel})` : ""}` : "Application";
  return {
    key: `deadline:${r.applicationId}:${r.date}`,
    kind: "deadline",
    date: r.date,
    time: null,
    endTime: null,
    title: audience === "student" ? `Applications close — ${r.university ?? "University"}` : `${what} deadline — ${r.studentName ?? "Student"}`,
    subtitle: audience === "student" ? null : (r.studentName ?? null),
    notes: audience === "student" ? r.program : null,
    href: audience === "student" ? `/portal/applications/${r.applicationId}` : audience === "partner" ? `/partner/applications/${r.applicationId}` : null,
    hrefLabel: "Open the application",
    origin: "The application's deadline. It moves when the deadline is changed.",
  };
}

// ------------------------------------------------------------- documents

export type DocumentRecord = { id: string; deadline: string | null; name: string | null; status: string | null };

/** A document the student still has to upload, or upload again, by a date. */
export function documentItem(r: DocumentRecord): AutoItem | null {
  if (!r.deadline || (r.status !== "missing" && r.status !== "rejected")) return null;
  return {
    key: `document:${r.id}:${r.deadline}`,
    kind: "document",
    date: r.deadline,
    time: null,
    endTime: null,
    title: `Upload ${r.name ?? "a document"}`,
    href: `/portal/documents?guide=${r.id}`,
    hrefLabel: "Open it, with how to prepare it",
    origin: r.status === "rejected" ? "It was sent back — upload a new copy by this date." : "Upload it by this date.",
  };
}

/**
 * Someone who sees every instalment — finance — is told how many fall due on
 * a day, not one pop-up per student.
 */
export function instalmentsByDay(items: AutoItem[]): AutoItem[] {
  const byDay = new Map<string, AutoItem[]>();
  for (const i of items) byDay.set(i.date, [...(byDay.get(i.date) ?? []), i]);
  return [...byDay].map(([date, list]) =>
    list.length === 1
      ? list[0]
      : {
          key: `instalments:${date}:${list.length}`,
          kind: "payment" as const,
          date,
          time: null,
          endTime: null,
          title: `${list.length} instalments due`,
        }
  );
}

// ------------------------------------------------------------- guests

export type GuestEventRecord = {
  table: "personal_tasks" | "application_tasks";
  id: string;
  title: string;
  dueDate: string | null;
  dueTime: string | null;
  endTime: string | null;
  allDay: boolean;
  recurrence: string | null;
  recurrenceEndDate: string | null;
  location: string | null;
  done: boolean;
};

/** Each occurrence, between two days, of an event someone was invited to — for reminding its guests. */
export function guestOccurrences(r: GuestEventRecord, from: string, to: string): AutoItem[] {
  if (!r.dueDate || r.done) return [];
  const time = !r.allDay && r.dueTime ? r.dueTime.slice(0, 5) : null;
  const endTime = time && r.endTime ? r.endTime.slice(0, 5) : null;
  const dates =
    r.recurrence && r.recurrence !== "none"
      ? expandOccurrences(r.dueDate, r.recurrence, r.recurrenceEndDate, from, to)
      : r.dueDate >= from && r.dueDate <= to
        ? [r.dueDate]
        : [];
  return dates.map((date) => ({
    key: `guest:${r.table}:${r.id}:${date}:${time ?? ""}`,
    kind: r.table === "personal_tasks" ? ("personal" as const) : ("task" as const),
    date,
    time,
    endTime,
    title: r.title,
    location: r.location,
  }));
}

// ------------------------------------------------------------- reminding

/** The in-portal pop-ups for an item: the day before, and an hour before one with a time. */
export function popupSources(item: AutoItem): NotifySource[] {
  const base = {
    title: item.title,
    dueDate: item.date,
    dueTime: item.time,
    allDay: item.time === null,
    recurrence: null,
    recurrenceEndDate: null,
  };
  return [
    { key: `auto:${item.key}`, ...base, notifyMinutes: DAY_BEFORE_MINUTES },
    ...(item.time ? [{ key: `auto:${item.key}`, ...base, notifyMinutes: SOON_MINUTES }] : []),
  ];
}

/** When it starts; something due on a day is taken as nine in the morning, as the pop-ups take it. */
export function startsAt(item: Pick<AutoItem, "date" | "time">): number {
  return karachiEpoch(item.date, minutesOf(item.time) ?? UNTIMED_NOTIFY_MINUTES);
}

export type ReminderMode = "tomorrow" | "soon";

/**
 * Whether an item is due its email in this run: "tomorrow" for everything on
 * tomorrow's date (the daily run), "soon" for something with a time that
 * starts within the hour (the ten-minute run).
 */
export function dueForReminder(item: Pick<AutoItem, "date" | "time">, mode: ReminderMode, nowMs: number): boolean {
  if (mode === "tomorrow") return item.date === shiftDate(karachiClock(nowMs).date, 1);
  if (!item.time) return false;
  const start = startsAt(item);
  return start - SOON_MINUTES * 60_000 <= nowMs && nowMs < start;
}

function clockWords(time: string): string {
  const minutes = minutesOf(time) ?? 0;
  const h = Math.floor(minutes / 60);
  return `${((h + 11) % 12) + 1}:${String(minutes % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** One email to one person: what they have tomorrow, or what starts within the hour. */
export function reminderEmail(input: {
  name: string | null;
  mode: ReminderMode;
  items: AutoItem[];
  siteUrl: string | null;
  calendarPath: string | null;
}): { subject: string; text: string; html: string } {
  const items = [...input.items].sort((a, b) => (a.date + (a.time ?? "99")).localeCompare(b.date + (b.time ?? "99")));
  const first = items[0];
  const more = items.length - 1;
  const lead =
    input.mode === "soon"
      ? `Starting soon: ${first.title}${first.time ? ` at ${clockWords(first.time)}` : ""}`
      : `Tomorrow: ${first.title}`;
  const subject = more > 0 ? `${lead}, and ${more} more` : lead;
  const greeting = `Hello${input.name ? ` ${input.name}` : ""},`;
  const intro =
    input.mode === "soon"
      ? items.length === 1
        ? "This starts within the hour:"
        : "These start within the hour:"
      : items.length === 1
        ? "This is on your calendar for tomorrow:"
        : `These ${items.length} are on your calendar for tomorrow:`;
  const lineOf = (i: AutoItem) => `${i.time ? `${clockWords(i.time)}${i.endTime ? `–${clockWords(i.endTime)}` : ""}` : "During the day"} — ${i.title}${i.location ? ` (${i.location})` : ""}`;
  const link = input.siteUrl && input.calendarPath ? `${input.siteUrl}${input.calendarPath}?view=day&date=${first.date}` : null;
  const text = [
    greeting,
    "",
    intro,
    ...items.map((i) => `• ${lineOf(i)}`),
    "",
    ...(link ? [`Your calendar: ${link}`, ""] : []),
    "Times are Pakistan time.",
    "HMARK Consultants",
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937">
<p>${esc(greeting)}</p>
<p>${esc(intro)}</p>
<ul style="padding-left:18px">${items.map((i) => `<li style="margin:4px 0">${esc(lineOf(i))}</li>`).join("")}</ul>
${link ? `<p><a href="${esc(link)}" style="color:#0f766e">Open your calendar</a></p>` : ""}
<p style="color:#6b7280">Times are Pakistan time.</p>
<p>HMARK Consultants</p>
</div>`;
  return { subject, text, html };
}

/** An automatic item as the calendar draws it: read-only, its card saying where it is kept. */
export function autoEvent(item: AutoItem): CalendarEvent {
  return recordEvent({
    id: item.key.replace(/[^a-zA-Z0-9:_-]/g, "_"),
    kind: item.kind,
    date: item.date,
    time: item.time,
    endTime: item.endTime,
    title: item.title,
    subtitle: item.subtitle ?? null,
    location: item.location ?? null,
    notes: item.notes ?? null,
    href: item.href ?? null,
    hrefLabel: item.hrefLabel ?? null,
    origin: item.origin ?? null,
    studentId: item.studentId ?? null,
    studentName: item.studentName ?? null,
  });
}
