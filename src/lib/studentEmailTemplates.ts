// The student's own versions of the emails the portal sends — alerts, the
// calendar's reminders, their daily to-dos, their logins, a message from their
// counsellor, an invitation — each in the house style (studentEmail.ts). The
// staff and partner versions keep their plainer look and live beside their
// senders; each sender chooses this one when the email is for a student.
//
// Pure, so the unit tests import it directly (scripts/student-email-test.mjs).
import {
  BODY,
  BRAND,
  FAINT,
  FONT,
  GREEN,
  HAIR,
  INK,
  MINT,
  MINT_EDGE,
  MONO,
  button,
  callout,
  card,
  emailFrame,
  esc,
  firstName,
  footerText,
  label,
  rows,
  type BannerKind,
  type Images,
  type OfficeDetails,
} from "./studentEmail.ts";
import { linkHref } from "./catalogueText.ts";
import { sentLink } from "./signInLanding.ts";

export type Sent = { subject: string; text: string; html: string };

type Base = { office: OfficeDetails; siteUrl: string; images?: Images };

/** Line breaks in what someone typed, kept; everything else escaped. */
const multiline = (s: string) => esc(s).replace(/\r?\n/g, "<br>");

// ------------------------------------------------------------------ alerts

/** Which banner an alert gets, from its kind (0320). */
export function alertBanner(kind: string | null | undefined): BannerKind {
  const k = kind ?? "";
  if (/message|ticket|comment|reply/.test(k)) return "message";
  if (/document/.test(k)) return "documents";
  if (/payment|invoice|receipt|instal/.test(k)) return "receipt";
  if (/interview|appointment/.test(k)) return "interview";
  if (/application|stage|offer|admission|university/.test(k)) return "application";
  if (/agreement|passport/.test(k)) return "documents";
  if (/reminder|deadline|calendar/.test(k)) return "reminder";
  return "update";
}

const ALERT_EYEBROW: Partial<Record<BannerKind, string>> = {
  message: "A new message",
  documents: "Your documents",
  receipt: "Your payments",
  interview: "Your interview",
  application: "Your applications",
  reminder: "A reminder",
  update: "An update from HMARK",
};

/** One alert, as a student gets it: what happened, a line of it, and the way back in. */
export function studentAlertEmail(input: Base & { recipientName: string | null; title: string; body: string | null; url: string; kind?: string | null }): Sent {
  const banner = alertBanner(input.kind);
  const first = firstName(input.recipientName);
  const subject = input.title;
  const lead = `Hello ${first}, there is something new on your HMARK Student Portal.`;
  const quoted = input.body ? card(`<div style="font-family:${FONT};font-size:14px;line-height:22px;color:${BODY}">${multiline(input.body)}</div>`, { tint: true }) : "";
  const html = emailFrame({
    subject,
    preheader: input.body ? input.body.replace(/\s+/g, " ").slice(0, 120) : `${input.title} — see it on your portal.`,
    banner,
    eyebrow: ALERT_EYEBROW[banner] ?? "An update from HMARK",
    title: input.title,
    intro: [esc(lead)],
    content: `${quoted}${button(input.url, "Open your portal &rarr;")}`,
    office: input.office,
    siteUrl: input.siteUrl,
    images: input.images,
    reason: "You are getting this because of activity on your HMARK Student Portal. It is also listed under the bell at the top of every page.",
  });
  const text = [
    `Hello ${first},`,
    "",
    `${input.title}.`,
    ...(input.body ? ["", input.body] : []),
    "",
    `Open your portal: ${input.url}`,
    "",
    "Warm regards,",
    "The HMARK Consultants team",
    "",
    ...footerText(input.office),
  ].join("\n");
  return { subject, text, html };
}

// ------------------------------------------------------------------ the calendar

export type CalendarLine = {
  title: string;
  kind: string;
  /** "YYYY-MM-DD". */
  date: string;
  /** "HH:MM" Pakistan time, or null for something due on the day. */
  time: string | null;
  endTime?: string | null;
  location?: string | null;
};

const KIND_ICON: Record<string, string> = {
  interview: "&#127909;",
  payment: "&#128179;",
  document: "&#128196;",
  deadline: "&#127891;",
  reminder: "&#128276;",
};

/** "3:00 PM". */
export function clockWords(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m ?? 0).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** "Thursday 23 October". */
export function dayWords(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

function calendarBanner(items: readonly CalendarLine[]): BannerKind {
  const kinds = new Set(items.map((i) => i.kind));
  if (kinds.size === 1) {
    const k = items[0].kind;
    if (k === "interview") return "interview";
    if (k === "payment") return "invoice";
    if (k === "document") return "documents";
    if (k === "deadline") return "application";
  }
  return "reminder";
}

function calendarCards(items: readonly CalendarLine[]) {
  return items
    .map((i) => {
      const when = i.time ? `${clockWords(i.time)}${i.endTime ? ` &ndash; ${clockWords(i.endTime)}` : ""}` : "During the day";
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:0 0 10px;background:#ffffff;border:1px solid ${HAIR};border-radius:14px"><tr>
  <td width="64" align="center" style="vertical-align:top;padding:14px 0 14px 14px">
    <div style="width:48px;height:48px;border-radius:14px;background:${MINT};border:1px solid ${MINT_EDGE};text-align:center;font-size:22px;line-height:48px">${KIND_ICON[i.kind] ?? "&#128197;"}</div>
  </td>
  <td style="vertical-align:top;padding:14px 16px 14px 12px">
    <div style="font-family:${FONT};font-size:12px;line-height:17px;font-weight:700;color:${BRAND};letter-spacing:.3px">${esc(dayWords(i.date))} &middot; ${when}</div>
    <div style="font-family:${FONT};font-size:15px;line-height:21px;font-weight:700;color:${INK}">${esc(i.title)}</div>
    ${i.location ? `<div style="font-family:${FONT};font-size:13px;line-height:19px;color:${BODY}">&#128205; ${esc(i.location)}</div>` : ""}
  </td>
</tr></table>`;
    })
    .join("");
}

/** What a student has tomorrow, or what starts within the hour (calendarUpcoming). */
export function studentCalendarEmail(input: Base & { name: string | null; mode: "tomorrow" | "soon"; items: CalendarLine[]; link: string | null }): Sent {
  const items = [...input.items].sort((a, b) => (a.date + (a.time ?? "00:00")).localeCompare(b.date + (b.time ?? "00:00")));
  const first = items[0];
  const more = items.length - 1;
  const lead = input.mode === "soon" ? `Starting soon: ${first.title}${first.time ? ` at ${clockWords(first.time)}` : ""}` : `Tomorrow: ${first.title}`;
  const subject = more > 0 ? `${lead}, and ${more} more` : lead;
  const name = firstName(input.name);
  const intro =
    input.mode === "soon"
      ? items.length === 1
        ? `Hello ${name}, this starts within the hour.`
        : `Hello ${name}, these start within the hour.`
      : items.length === 1
        ? `Hello ${name}, this is on your calendar for tomorrow.`
        : `Hello ${name}, these ${items.length} are on your calendar for tomorrow.`;
  const html = emailFrame({
    subject,
    preheader: `${dayWords(first.date)}${first.time ? `, ${clockWords(first.time)}` : ""} — ${first.title}`,
    banner: calendarBanner(items),
    eyebrow: input.mode === "soon" ? "Starting soon" : "Tomorrow",
    title: input.mode === "soon" ? "Coming up within the hour" : "On your calendar tomorrow",
    intro: [esc(intro)],
    content: `<div style="height:6px;line-height:6px;font-size:0">&nbsp;</div>${calendarCards(items)}${input.link ? button(input.link, "Open your calendar &rarr;") : ""}
<p style="margin:16px 0 0;font-family:${FONT};font-size:12px;line-height:18px;color:${FAINT}">Times are Pakistan time.</p>`,
    office: input.office,
    siteUrl: input.siteUrl,
    images: input.images,
    reason: "You are getting this because it is on your HMARK Student Portal calendar.",
  });
  const text = [
    `Hello ${name},`,
    "",
    intro.replace(/^Hello [^,]+, /, "").replace(/^./, (c) => c.toUpperCase()),
    ...items.map((i) => `• ${dayWords(i.date)}, ${i.time ? clockWords(i.time) : "during the day"} — ${i.title}${i.location ? ` (${i.location})` : ""}`),
    "",
    ...(input.link ? [`Your calendar: ${input.link}`, ""] : []),
    "Times are Pakistan time.",
    "",
    "Warm regards,",
    "The HMARK Consultants team",
    "",
    ...footerText(input.office),
  ].join("\n");
  return { subject, text, html };
}

// ------------------------------------------------------------------ what is still to do

export type StudentTask = { title: string; dueDate: string; isOverdue: boolean; allDay: boolean; time: string | null; notes: string | null };

/** The daily reminder of an application's tasks still pending, for the student it concerns (calendar-reminders). */
export function studentTaskReminderEmail(input: Base & { name: string; items: StudentTask[]; link: string }): Sent {
  const overdue = input.items.filter((i) => i.isOverdue).length;
  const subject = input.items.length === 1 ? `Reminder: ${input.items[0].title}` : `You have ${input.items.length} things still to do`;
  const name = firstName(input.name);
  const list = input.items
    .map((i) => {
      const when = `${i.isOverdue ? "Was due" : "Due"} ${dayWords(i.dueDate)}${!i.allDay && i.time ? `, ${clockWords(i.time)}` : ""}`;
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:0 0 10px;background:#ffffff;border:1px solid ${i.isOverdue ? "#f3dfa6" : HAIR};border-radius:14px"><tr><td style="padding:14px 16px">
  <div style="font-family:${FONT};font-size:12px;line-height:17px;font-weight:700;color:${i.isOverdue ? "#a05a20" : BRAND}">${i.isOverdue ? "&#9888;&nbsp;" : ""}${esc(when)}</div>
  <div style="font-family:${FONT};font-size:15px;line-height:21px;font-weight:700;color:${INK}">${esc(i.title)}</div>
  ${i.notes ? `<div style="font-family:${FONT};font-size:13px;line-height:20px;color:${BODY};margin-top:4px">${multiline(i.notes)}</div>` : ""}
</td></tr></table>`;
    })
    .join("");
  const html = emailFrame({
    subject,
    preheader: overdue ? `${overdue} of them ${overdue === 1 ? "is" : "are"} past ${overdue === 1 ? "its" : "their"} date.` : "Here is what is still open on your application.",
    banner: overdue ? "overdue" : "reminder",
    eyebrow: overdue ? "Past its date" : "Still to do",
    eyebrowTone: overdue ? "amber" : "green",
    title: input.items.length === 1 ? "One thing still to do" : `${input.items.length} things still to do`,
    intro: [esc(`Hello ${name}, these are still open on your application with HMARK. If one is already done, tell your counsellor and they will close it.`)],
    content: `<div style="height:6px;line-height:6px;font-size:0">&nbsp;</div>${list}${button(input.link, "Open your portal &rarr;", overdue ? "amber" : "green")}`,
    office: input.office,
    siteUrl: input.siteUrl,
    images: input.images,
    reason: "This reminder comes once a day until each item is done.",
  });
  const text = [
    `Hello ${name},`,
    "",
    "These are still open on your application with HMARK:",
    ...input.items.map((i) => `• ${i.title} — ${i.isOverdue ? "was due" : "due"} ${dayWords(i.dueDate)}${!i.allDay && i.time ? `, ${clockWords(i.time)}` : ""}`),
    "",
    `Your portal: ${input.link}`,
    "",
    "This reminder comes once a day until each item is done.",
    "",
    ...footerText(input.office),
  ].join("\n");
  return { subject, text, html };
}

// ------------------------------------------------------------------ their other logins

export type LoginCard = { label: string; username: string; password: string; link: string | null };

/** The logins Portal credentials sends (Gmail, a university or visa portal), one card each. */
export function studentLoginsEmail(input: Base & { studentName: string; logins: LoginCard[] }): Sent {
  const name = firstName(input.studentName);
  // A saved link may be words, or javascript: — only a real address becomes a link.
  const logins = input.logins.map((l) => ({ ...l, link: linkHref(l.link) }));
  const subject = logins.length === 1 ? `Your ${logins[0].label} login` : "Your login details from HMARK Consultants";
  const cards = logins
    .map((l) => {
      const value = (v: string) => `<div style="font-family:${MONO};font-size:16px;line-height:22px;font-weight:700;color:${INK};word-break:break-all">${esc(v)}</div>`;
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:0 0 12px;background:${MINT};border:1px solid ${MINT_EDGE};border-radius:14px"><tr><td style="padding:16px 18px">
  <div style="font-family:${FONT};font-size:15px;line-height:21px;font-weight:800;color:${INK};margin-bottom:6px">&#128273;&nbsp; ${esc(l.label)}</div>
  ${l.username ? `<div style="padding:4px 0">${label("Username", GREEN)}${value(l.username)}</div>` : ""}
  ${l.password ? `<div style="padding:4px 0">${label("Password", GREEN)}${value(l.password)}</div>` : ""}
  ${l.link ? `<div style="padding:8px 0 0"><a href="${esc(l.link)}" target="_blank" style="font-family:${FONT};font-size:14px;font-weight:700;color:${GREEN};text-decoration:none">Go to the login page &rarr;</a></div>` : ""}
</td></tr></table>`;
    })
    .join("");
  const html = emailFrame({
    subject,
    preheader: `${logins.map((l) => l.label).join(", ")} — your login${logins.length === 1 ? "" : "s"} from HMARK.`,
    banner: "logins",
    eyebrow: "Your logins",
    title: logins.length === 1 ? `Your ${logins[0].label} login` : "Your login details",
    intro: [esc(`Hello ${name}, here ${logins.length === 1 ? "is the login" : "are the logins"} HMARK keeps for you. They are on your portal too, under Logins.`)],
    content: `<div style="height:6px;line-height:6px;font-size:0">&nbsp;</div>${cards}${callout(
      esc("Please keep these to yourself — don't forward this email or share it with anyone. If a login stops working, message your counsellor.")
    )}`,
    office: input.office,
    siteUrl: input.siteUrl,
    images: input.images,
  });
  const text = [
    `Hello ${name},`,
    "",
    "Here are your login details from HMARK Consultants.",
    ...logins.flatMap((l) => ["", l.label, ...(l.username ? [`  Username: ${l.username}`] : []), ...(l.password ? [`  Password: ${l.password}`] : []), ...(l.link ? [`  Sign in here: ${l.link}`] : [])]),
    "",
    "Please keep these to yourself — don't forward this email or share it with anyone. If a login stops working, message your counsellor.",
    "",
    ...footerText(input.office),
  ].join("\n");
  return { subject, text, html };
}

// ------------------------------------------------------------------ a message from their counsellor

/** A message a counsellor writes to a student (re-engagement), in the student's style. */
export function studentMessageEmail(input: Base & { subject: string; body: string; fromName?: string | null }): Sent {
  // Marked as sent by email, so signing in from it lands on the messages rather than the Dashboard.
  const reply = sentLink(input.siteUrl, "/portal/messages");
  const html = emailFrame({
    subject: input.subject,
    preheader: input.body.replace(/\s+/g, " ").slice(0, 120),
    banner: "message",
    eyebrow: input.fromName ? `A message from ${input.fromName}` : "A message from HMARK",
    title: input.subject,
    intro: [],
    content: `<div style="font-family:${FONT};font-size:15px;line-height:24px;color:${BODY}">${multiline(input.body)}</div>${button(reply, "Reply on your portal &rarr;")}`,
    signoff: null,
    office: input.office,
    siteUrl: input.siteUrl,
    images: input.images,
  });
  const text = [input.body, "", `Reply on your portal: ${reply}`, "", ...footerText(input.office)].join("\n");
  return { subject: input.subject, text, html };
}

// ------------------------------------------------------------------ an invitation

/** A calendar invitation, its update, or its cancellation — the words beside the calendar file. */
export function studentInviteEmail(
  input: Base & {
    kind: "invite" | "update" | "cancel";
    title: string;
    when: string;
    location: string | null;
    description: string | null;
    organizerName: string;
  }
): Sent {
  const subject =
    input.kind === "cancel" ? `Cancelled: ${input.title} (${input.when})` : input.kind === "update" ? `Updated invitation: ${input.title} (${input.when})` : `Invitation: ${input.title} (${input.when})`;
  const opening =
    input.kind === "cancel"
      ? `${input.organizerName} has cancelled this event.`
      : input.kind === "update"
        ? `${input.organizerName} has changed this event. The new details are below.`
        : `${input.organizerName} has invited you to this event.`;
  const details: [string, string][] = [["When", esc(input.when)]];
  if (input.location) details.push(["Where", esc(input.location)]);
  if (input.description) details.push(["Details", multiline(input.description)]);
  const after = input.kind === "cancel" ? "It has been taken off your calendar if you had added it." : "The calendar file with this email adds it to your calendar.";
  const html = emailFrame({
    subject,
    preheader: `${input.when}${input.location ? ` · ${input.location}` : ""}`,
    banner: "reminder",
    eyebrow: input.kind === "cancel" ? "Cancelled" : input.kind === "update" ? "Changed" : "You are invited",
    eyebrowTone: input.kind === "cancel" ? "amber" : "green",
    title: input.title,
    intro: [esc(opening)],
    content: `${card(rows(details))}<p style="margin:14px 0 0;font-family:${FONT};font-size:13px;line-height:20px;color:${FAINT}">${esc(after)}</p>`,
    office: input.office,
    siteUrl: input.siteUrl,
    images: input.images,
    reason: `You are getting this because ${input.organizerName} added you to an event.`,
  });
  const text = [
    opening,
    "",
    input.title,
    `When: ${input.when}`,
    ...(input.location ? [`Where: ${input.location}`] : []),
    ...(input.description ? [`Details: ${input.description}`] : []),
    "",
    after,
    "",
    ...footerText(input.office),
  ].join("\n");
  return { subject, text, html };
}
