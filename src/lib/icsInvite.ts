// A calendar invitation as a guest's own calendar reads it: an iCalendar file
// (RFC 5545) sent with the email, so Gmail, Outlook and Apple Calendar show
// the event with its time and put it in the guest's calendar — and, sent
// again under the same UID with a higher SEQUENCE, move it or cancel it there.
//
// Times are written in UTC. Pakistan keeps no daylight saving, so a Karachi
// wall time is always five hours ahead and the conversion is exact; the guest's
// calendar shows it in their own zone.
//
// Pure, so the unit tests import it directly (scripts/ics-invite-test.mjs).

import { KARACHI_OFFSET_MINUTES } from "./calendarLayout.ts";

export type InviteMethod = "REQUEST" | "CANCEL";

/** What an invitation says about the event: enough to write it, and to tell whether it changed. */
export type InviteEvent = {
  title: string;
  description: string | null;
  location: string | null;
  /** The first day, "YYYY-MM-DD" in Karachi. */
  date: string;
  /** The last day of a multi-day item, or null. */
  endDate: string | null;
  /** "HH:MM" in Karachi; null for an all-day item. */
  time: string | null;
  endTime: string | null;
  recurrence: string | null;
  recurrenceEndDate: string | null;
  /** Minutes before the start the guest's calendar should alert; null for none. */
  alarmMinutes: number | null;
};

export type InviteInput = {
  uid: string;
  sequence: number;
  method: InviteMethod;
  event: InviteEvent;
  organizer: { name: string; email: string };
  attendees: string[];
  /** When this version was made, for DTSTAMP. */
  now: Date;
  url?: string | null;
};

/** How long a timed item lasts when it has no end of its own. */
const DEFAULT_MINUTES = 60;

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

function utcStamp(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function minutesOfClock(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** A Karachi wall time as the instant it is. */
export function karachiInstant(date: string, minutes: number): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, minutes - KARACHI_OFFSET_MINUTES));
}

function dateValue(date: string): string {
  return date.replace(/-/g, "");
}

function nextDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Text as an iCalendar value: backslashes, semicolons, commas and line breaks escaped. */
export function icsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines folded at 75 octets, as the format requires; a continuation starts with a space. */
export function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch, "utf8");
    const limit = parts.length === 0 ? 75 : 74;
    if (size + n > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/** The repeat rule for a recurrence the calendar offers; null for none. */
export function repeatRule(recurrence: string | null, until: string | null, timed: { minutes: number } | null): string | null {
  const freq: Record<string, string> = {
    daily: "FREQ=DAILY",
    weekly: "FREQ=WEEKLY",
    monthly: "FREQ=MONTHLY",
    yearly: "FREQ=YEARLY",
    weekdays: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
  };
  const rule = recurrence ? freq[recurrence] : undefined;
  if (!rule) return null;
  if (!until) return rule;
  // The last occurrence's start, or its day for an all-day series.
  const end = timed ? utcStamp(karachiInstant(until, timed.minutes)) : dateValue(until);
  return `${rule};UNTIL=${end}`;
}

/** The event's start and end lines. */
function whenLines(e: InviteEvent): string[] {
  const start = e.time ? minutesOfClock(e.time) : null;
  if (start === null) {
    // All day: the end is the day after the last, exclusive.
    return [`DTSTART;VALUE=DATE:${dateValue(e.date)}`, `DTEND;VALUE=DATE:${dateValue(nextDay(e.endDate && e.endDate > e.date ? e.endDate : e.date))}`];
  }
  const endMinutes = e.endTime ? minutesOfClock(e.endTime) : null;
  const lastDay = e.endDate && e.endDate > e.date ? e.endDate : e.date;
  const startAt = karachiInstant(e.date, start);
  let endAt = endMinutes !== null ? karachiInstant(lastDay, endMinutes) : new Date(startAt.getTime() + DEFAULT_MINUTES * 60_000);
  if (endAt <= startAt) endAt = new Date(startAt.getTime() + DEFAULT_MINUTES * 60_000);
  return [`DTSTART:${utcStamp(startAt)}`, `DTEND:${utcStamp(endAt)}`];
}

/** The whole file, CRLF line endings, ready to attach. */
export function buildInvite(input: InviteInput): string {
  const { event: e } = input;
  const start = e.time ? minutesOfClock(e.time) : null;
  const rule = repeatRule(e.recurrence, e.recurrenceEndDate, start === null ? null : { minutes: start });
  const cancelled = input.method === "CANCEL";
  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//HMARK Consultants//Student Portal//EN",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `METHOD:${input.method}`,
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `SEQUENCE:${input.sequence}`,
    `DTSTAMP:${utcStamp(input.now)}`,
    ...whenLines(e),
    ...(rule ? [`RRULE:${rule}`] : []),
    `SUMMARY:${icsText(e.title)}`,
    ...(e.description ? [`DESCRIPTION:${icsText(e.description)}`] : []),
    ...(e.location ? [`LOCATION:${icsText(e.location)}`] : []),
    ...(input.url ? [`URL:${input.url}`] : []),
    `ORGANIZER;CN=${icsText(input.organizer.name)}:mailto:${input.organizer.email}`,
    ...input.attendees.map((a) => `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:${a}`),
    `STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "TRANSP:OPAQUE",
    ...(!cancelled && e.alarmMinutes !== null && e.alarmMinutes >= 0
      ? ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(e.title)}`, `TRIGGER:-PT${e.alarmMinutes}M`, "END:VALARM"]
      : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/**
 * What a guest would notice changing: the time, the place, the words. Two
 * versions with the same signature are the same invitation, and a guest is not
 * written to again for a save that changed nothing they see.
 */
export function inviteSignature(e: InviteEvent): string {
  return JSON.stringify([
    e.title.trim(),
    (e.description ?? "").trim(),
    (e.location ?? "").trim(),
    e.date,
    e.endDate ?? "",
    e.time ?? "",
    e.endTime ?? "",
    e.recurrence ?? "none",
    e.recurrenceEndDate ?? "",
  ]);
}

/** What each guest is owed, given who was invited before and to which version. */
export function inviteActions(
  guests: string[],
  sent: { email: string; signature: string; cancelled: boolean }[],
  signature: string,
  deleted: boolean
): { invite: string[]; update: string[]; cancel: string[] } {
  const wanted = new Set(deleted ? [] : guests.map((g) => g.trim().toLowerCase()).filter(Boolean));
  const known = new Map(sent.map((s) => [s.email.toLowerCase(), s]));
  const invite: string[] = [];
  const update: string[] = [];
  const cancel: string[] = [];
  for (const g of wanted) {
    const before = known.get(g);
    if (!before || before.cancelled) invite.push(g);
    else if (before.signature !== signature) update.push(g);
  }
  for (const [email, s] of known) if (!wanted.has(email) && !s.cancelled) cancel.push(email);
  return { invite, update, cancel };
}

const REPEAT_WORDS: Record<string, string> = {
  daily: "every day",
  weekly: "every week",
  monthly: "every month",
  yearly: "every year",
  weekdays: "every weekday",
};

function longDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function clockWords(time: string): string {
  const minutes = minutesOfClock(time) ?? 0;
  const h = Math.floor(minutes / 60);
  return `${((h + 11) % 12) + 1}:${pad(minutes % 60)} ${h < 12 ? "AM" : "PM"}`;
}

/** "Thursday 9 October 2026, 3:00 PM – 4:00 PM Pakistan time", said as a person would. */
export function inviteWhen(e: InviteEvent): string {
  const repeat =
    e.recurrence && REPEAT_WORDS[e.recurrence]
      ? `, repeating ${REPEAT_WORDS[e.recurrence]}${e.recurrenceEndDate ? ` until ${longDay(e.recurrenceEndDate)}` : ""}`
      : "";
  const lastDay = e.endDate && e.endDate > e.date ? e.endDate : null;
  if (!e.time) return `${longDay(e.date)}${lastDay ? ` to ${longDay(lastDay)}` : ""} (all day)${repeat}`;
  const end = e.endTime ? ` – ${lastDay ? `${longDay(lastDay)}, ` : ""}${clockWords(e.endTime)}` : "";
  return `${longDay(e.date)}, ${clockWords(e.time)}${end} Pakistan time${repeat}`;
}

/** The words of an invitation email, for whoever's calendar does not read the file. */
export function inviteEmail(input: {
  kind: "invite" | "update" | "cancel";
  event: InviteEvent;
  organizerName: string;
  when: string;
}): { subject: string; text: string; html: string } {
  const { event: e } = input;
  const subject =
    input.kind === "cancel"
      ? `Cancelled: ${e.title} (${input.when})`
      : input.kind === "update"
        ? `Updated invitation: ${e.title} (${input.when})`
        : `Invitation: ${e.title} (${input.when})`;
  const opening =
    input.kind === "cancel"
      ? `${input.organizerName} has cancelled this event.`
      : input.kind === "update"
        ? `${input.organizerName} has changed this event. The new details are below.`
        : `${input.organizerName} has invited you to this event.`;
  const rows: [string, string][] = [
    ["When", input.when],
    ...(e.location ? ([["Where", e.location]] as [string, string][]) : []),
    ...(e.description ? ([["Details", e.description]] as [string, string][]) : []),
  ];
  const text = [
    opening,
    "",
    e.title,
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    input.kind === "cancel" ? "It has been taken off your calendar if you had added it." : "The attached calendar file adds it to your calendar.",
    "",
    "HMARK Consultants",
  ].join("\n");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937">
<p>${esc(opening)}</p>
<h2 style="font-size:18px;margin:12px 0 8px;${input.kind === "cancel" ? "text-decoration:line-through;" : ""}">${esc(e.title)}</h2>
<table style="border-collapse:collapse">${rows
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;vertical-align:top">${esc(k)}</td><td style="padding:4px 0">${esc(v)}</td></tr>`)
    .join("")}</table>
<p style="color:#6b7280;margin-top:16px">${
    input.kind === "cancel" ? "It has been taken off your calendar if you had added it." : "The attached calendar file adds it to your calendar."
  }</p>
<p>HMARK Consultants</p>
</div>`;
  return { subject, text, html };
}
