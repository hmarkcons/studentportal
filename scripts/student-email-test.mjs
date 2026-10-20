// The student's house style (studentEmail) and the emails built on it
// (studentEmailTemplates): alerts, calendar reminders, to-dos, their logins,
// a counsellor's message, an invitation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_OFFICE, assetUrl, displayName, emailFrame, firstName } from "../src/lib/studentEmail.ts";
import {
  alertBanner,
  clockWords,
  dayWords,
  studentAlertEmail,
  studentCalendarEmail,
  studentInviteEmail,
  studentLoginsEmail,
  studentMessageEmail,
  studentTaskReminderEmail,
} from "../src/lib/studentEmailTemplates.ts";

const BASE = { office: { ...DEFAULT_OFFICE, email: "info@example.com" }, siteUrl: "https://portal.example" };

test("names are written as a person writes them", () => {
  assert.equal(displayName("AYESHA  KHAN"), "Ayesha Khan");
  assert.equal(displayName("muhammad abdul-hadi"), "Muhammad Abdul-Hadi");
  assert.equal(displayName("McAllister O'Neil"), "McAllister O'Neil", "a name already mixed is left alone");
  assert.equal(firstName(null), "there");
});

test("the frame: the logo and the banner hosted with the portal, each described, and the office at the foot", () => {
  const html = emailFrame({ ...BASE, subject: "S", preheader: "P <x>", banner: "receipt", eyebrow: "E", title: "<T>", intro: ["Hi"], content: "<p>C</p>" });
  assert.match(html, /src="https:\/\/portal\.example\/email\/hmark-logo\.png"[^>]*alt="HMARK Consultants"/);
  assert.match(html, /src="https:\/\/portal\.example\/email\/banner-receipt\.jpg"[^>]*alt="A receipt with a green tick"/);
  assert.match(html, /&lt;T&gt;/, "the title is escaped");
  assert.match(html, /P &lt;x&gt;/, "the preheader is escaped");
  assert.match(html, /The HMARK Consultants team/);
  assert.match(html, /Dashityar Chambers/);
  assert.match(html, /href="tel:\+922134999777"/);
  assert.match(html, /href="https:\/\/www\.hmarkconsultants\.com"/);
  assert.equal(assetUrl("https://x.example/", "hero"), "https://x.example/email/welcome-hero.jpg");
  assert.equal(assetUrl("https://x.example", "qr", { qr: "cid:qr" }), "cid:qr", "a preview's own images win");
});

test("an alert gets the banner for what it is about", () => {
  assert.equal(alertBanner("message"), "message");
  assert.equal(alertBanner("ticket_reply"), "message");
  assert.equal(alertBanner("document_approved"), "documents");
  assert.equal(alertBanner("student:passport"), "documents");
  assert.equal(alertBanner("payment"), "receipt");
  assert.equal(alertBanner("application_stage"), "application");
  assert.equal(alertBanner("interview"), "interview");
  assert.equal(alertBanner("something_new"), "update");
  assert.equal(alertBanner(null), "update");
});

test("an alert says what happened, quotes its line, and links back in", () => {
  const m = studentAlertEmail({ ...BASE, recipientName: "ALI RAZA", title: "Passport copy approved", body: "Line one\n<b>two</b>", url: "https://portal.example/portal/documents?via=email", kind: "document_approved" });
  assert.equal(m.subject, "Passport copy approved");
  assert.match(m.html, /Hello Ali,/);
  assert.match(m.html, /Line one<br>&lt;b&gt;two&lt;\/b&gt;/);
  assert.match(m.html, /href="https:\/\/portal\.example\/portal\/documents\?via=email"/);
  assert.match(m.html, /banner-documents\.jpg/);
  assert.match(m.text, /Open your portal: https:\/\/portal\.example\/portal\/documents\?via=email/);
});

test("tomorrow's calendar: what is due on the day first, times in words, Pakistan time", () => {
  const m = studentCalendarEmail({
    ...BASE,
    name: "ali raza",
    mode: "tomorrow",
    link: "https://portal.example/portal/calendar?view=day&date=2026-10-23&via=email",
    items: [
      { title: "Visa interview", kind: "interview", date: "2026-10-23", time: "15:00", endTime: "15:30", location: "VFS Karachi" },
      { title: "Instalment 2 due", kind: "payment", date: "2026-10-23", time: null },
    ],
  });
  assert.equal(m.subject, "Tomorrow: Instalment 2 due, and 1 more");
  assert.ok(m.html.indexOf("Instalment 2 due") < m.html.indexOf("Visa interview"));
  assert.match(m.html, /3:00 PM &ndash; 3:30 PM/);
  assert.match(m.html, /VFS Karachi/);
  assert.match(m.html, /Times are Pakistan time/);
  assert.match(m.html, /banner-reminder\.jpg/, "two kinds of thing: the general reminder banner");
  assert.equal(clockWords("00:05"), "12:05 AM");
  assert.equal(dayWords("2026-10-23"), "Friday 23 October");
  const soon = studentCalendarEmail({ ...BASE, name: null, mode: "soon", link: null, items: [{ title: "Interview", kind: "interview", date: "2026-10-23", time: "10:00" }] });
  assert.equal(soon.subject, "Starting soon: Interview at 10:00 AM");
  assert.match(soon.html, /banner-interview\.jpg/);
});

test("the daily to-dos: past-due ones in amber, each with its date", () => {
  const m = studentTaskReminderEmail({
    ...BASE,
    name: "Ali",
    link: "https://portal.example/portal?via=email",
    items: [
      { title: "Upload bank statement", dueDate: "2026-10-18", isOverdue: true, allDay: true, time: null, notes: "Last 6 months" },
      { title: "Book VFS slot", dueDate: "2026-10-25", isOverdue: false, allDay: false, time: "11:00", notes: null },
    ],
  });
  assert.equal(m.subject, "You have 2 things still to do");
  assert.match(m.html, /banner-overdue\.jpg/);
  assert.match(m.html, /Was due Sunday 18 October/);
  assert.match(m.html, /Due Sunday 25 October, 11:00 AM/);
  assert.match(m.html, /Last 6 months/);
  assert.match(m.text, /• Upload bank statement — was due Sunday 18 October/);
  const one = studentTaskReminderEmail({ ...BASE, name: "Ali", link: "x", items: [{ title: "Sign the form", dueDate: "2026-10-25", isOverdue: false, allDay: true, time: null, notes: null }] });
  assert.equal(one.subject, "Reminder: Sign the form");
  assert.match(one.html, /banner-reminder\.jpg/);
});

test("their logins: one card each, escaped, and only a real address becomes a link", () => {
  const m = studentLoginsEmail({
    ...BASE,
    studentName: "Ali Raza",
    logins: [
      { label: "Gmail", username: "ali@gmail.com", password: "<script>x</script>", link: "https://mail.google.com/" },
      { label: "Visa appointment portal", username: "ali", password: "V-1", link: "javascript:alert(1)" },
      { label: "University portal", username: "u", password: "p", link: "apply.unipv.it" },
    ],
  });
  assert.equal(m.subject, "Your login details from HMARK Consultants");
  assert.ok(!m.html.includes("<script>x</script>"));
  assert.match(m.html, /&lt;script&gt;x&lt;\/script&gt;/);
  assert.match(m.html, /href="https:\/\/mail\.google\.com\/"/);
  assert.match(m.html, /href="https:\/\/apply\.unipv\.it"/, "a bare address is made one");
  assert.ok(!/javascript:/.test(m.html), "javascript: is never a link");
  assert.match(m.html, /banner-logins\.jpg/);
  assert.match(m.text, /Sign in here: https:\/\/mail\.google\.com\//);
  assert.ok(!/javascript:/.test(m.text));
  assert.equal(studentLoginsEmail({ ...BASE, studentName: "A", logins: [{ label: "Gmail", username: "a", password: "b", link: null }] }).subject, "Your Gmail login");
});

test("a counsellor's message, signed by them, with a way to reply that lands on the messages", () => {
  const m = studentMessageEmail({ ...BASE, subject: "Your visa file", body: "Dear Ali,\nPlease send the bank letter.", fromName: "Sana Ahmed" });
  assert.equal(m.subject, "Your visa file");
  assert.match(m.html, /A message from Sana Ahmed/);
  assert.match(m.html, /Dear Ali,<br>Please send the bank letter\./);
  assert.match(m.html, /href="https:\/\/portal\.example\/portal\/messages\?via=email"/, "marked as sent by email (sentLink)");
  assert.match(m.text, /Reply on your portal: https:\/\/portal\.example\/portal\/messages\?via=email/);
});

test("an invitation, its update and its cancellation say which", () => {
  const base = { ...BASE, title: "Pre-departure briefing", when: "Thu 23 Oct, 3:00 PM", location: "HMARK office", description: "Bring your passport", organizerName: "Sana Ahmed" };
  assert.equal(studentInviteEmail({ ...base, kind: "invite" }).subject, "Invitation: Pre-departure briefing (Thu 23 Oct, 3:00 PM)");
  assert.equal(studentInviteEmail({ ...base, kind: "update" }).subject, "Updated invitation: Pre-departure briefing (Thu 23 Oct, 3:00 PM)");
  const cancel = studentInviteEmail({ ...base, kind: "cancel" });
  assert.equal(cancel.subject, "Cancelled: Pre-departure briefing (Thu 23 Oct, 3:00 PM)");
  assert.match(cancel.html, /Sana Ahmed has cancelled this event/);
  assert.match(cancel.html, /HMARK office/);
  assert.match(cancel.text, /Details: Bring your passport/);
});
