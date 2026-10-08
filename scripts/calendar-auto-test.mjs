// What calendars show without anyone adding it, and when it is reminded of
// (src/lib/calendarAuto.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  autoEvent,
  deadlineItem,
  documentItem,
  dueForReminder,
  followUpItem,
  guestOccurrences,
  instalmentItem,
  instalmentsByDay,
  interviewItem,
  outstanding,
  popupSources,
  reminderEmail,
} from "../src/lib/calendarAuto.ts";
import { upcomingNotifications } from "../src/lib/calendarRecurrence.ts";
import { karachiEpoch } from "../src/lib/calendarLayout.ts";

const interview = {
  id: "i1",
  applicationId: "a1",
  confirmedAt: "2026-10-09T10:00:00+00:00", // 3 PM in Karachi
  status: "scheduled",
  roundLabel: "First round",
  platform: "zoom",
  platformOther: null,
  details: "Bring your passport",
  studentId: "s1",
  studentName: "Ayesha Khan",
  university: "University of Pisa",
  program: "MSc Data Science",
};

test("an interview is on the calendar at its Pakistan time, worded for whoever reads it", () => {
  const staff = interviewItem(interview, "staff");
  assert.equal(staff.date, "2026-10-09");
  assert.equal(staff.time, "15:00");
  assert.equal(staff.endTime, "16:00");
  assert.equal(staff.title, "Interview — Ayesha Khan (University of Pisa)");
  assert.equal(staff.href, "/students/s1/applications/a1");
  assert.equal(interviewItem(interview, "student").title, "Interview with University of Pisa");
  assert.equal(interviewItem(interview, "student").href, "/portal/appointments");
  assert.equal(interviewItem(interview, "partner").title, "Interview — Ayesha Khan (MSc Data Science)");
  assert.equal(interviewItem(interview, "partner").href, "/partner/applications/a1");
});

test("an interview held or called off clears itself; a rescheduled one is reminded of afresh", () => {
  for (const status of ["completed", "passed", "failed", "cancelled"]) assert.equal(interviewItem({ ...interview, status }, "staff"), null, status);
  assert.equal(interviewItem({ ...interview, confirmedAt: null }, "staff"), null);
  const moved = interviewItem({ ...interview, status: "rescheduled", confirmedAt: "2026-10-10T05:00:00+00:00" }, "staff");
  assert.equal(moved.date, "2026-10-10");
  assert.notEqual(moved.key, interviewItem(interview, "staff").key);
});

const instalment = { id: "n1", installmentNo: 2, dueDate: "2026-10-09", amount: 500, amountPaid: 200, status: "partial", currency: "EUR", studentId: "s1", studentName: "Ayesha Khan" };

test("an instalment is due on its day for what is left on it, until it is paid", () => {
  assert.equal(outstanding(instalment), 300);
  const item = instalmentItem(instalment, "staff", "2026-10-08");
  assert.equal(item.kind, "payment");
  assert.equal(item.time, null);
  assert.equal(item.title, "Instalment 2 due — Ayesha Khan — €300");
  assert.equal(item.href, "/students/s1?open=invoice");
  assert.equal(instalmentItem(instalment, "student", "2026-10-08").title, "Instalment 2 due — €300");
  assert.equal(instalmentItem({ ...instalment, status: "paid" }, "staff", "2026-10-08"), null);
  assert.equal(instalmentItem({ ...instalment, dueDate: null }, "staff", "2026-10-08"), null, "one due on a condition has no day");
  assert.match(instalmentItem(instalment, "staff", "2026-10-20").origin, /Overdue/);
});

test("finance hear how many instalments fall due on a day, not one by one", () => {
  const items = ["a", "b", "c"].map((id) => instalmentItem({ ...instalment, id }, "staff", "2026-10-08"));
  const lone = instalmentItem({ ...instalment, id: "d", dueDate: "2026-10-10" }, "staff", "2026-10-08");
  const grouped = instalmentsByDay([...items, lone]);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].title, "3 instalments due");
  assert.equal(grouped[1], lone);
});

test("a follow-up, a document and a deadline each clear themselves when done", () => {
  const f = { id: "r1", dueDate: "2026-10-09", dueTime: "11:30:00", note: null, resolved: false, studentId: "l1", studentName: "Bilal", contactNumber: "0300-1" };
  assert.equal(followUpItem(f).time, "11:30");
  assert.equal(followUpItem(f).title, "Follow-up — Bilal (0300-1)");
  assert.equal(followUpItem({ ...f, resolved: true }), null);
  assert.equal(documentItem({ id: "d1", deadline: "2026-10-09", name: "Passport", status: "missing" }).title, "Upload Passport");
  assert.equal(documentItem({ id: "d1", deadline: "2026-10-09", name: "Passport", status: "verified" }), null);
  const d = { applicationId: "a1", date: "2026-10-09", studentName: "Ayesha", program: "MSc AI", roundLabel: "Round 2", university: "Pisa" };
  assert.equal(deadlineItem(d, "partner").title, "MSc AI (Round 2) deadline — Ayesha");
  assert.equal(deadlineItem({ ...d, date: null }, "partner"), null);
});

test("an event's guests are reminded of each occurrence, and of none once it is done", () => {
  const e = { table: "personal_tasks", id: "p1", title: "Weekly call", dueDate: "2026-10-01", dueTime: "18:00:00", endTime: null, allDay: false, recurrence: "weekly", recurrenceEndDate: null, location: null, done: false };
  const occ = guestOccurrences(e, "2026-10-08", "2026-10-16");
  assert.deepEqual(occ.map((o) => o.date), ["2026-10-08", "2026-10-15"]);
  assert.equal(occ[0].time, "18:00");
  assert.deepEqual(guestOccurrences({ ...e, done: true }, "2026-10-08", "2026-10-16"), []);
  assert.deepEqual(guestOccurrences({ ...e, recurrence: "none" }, "2026-10-08", "2026-10-16"), [], "a one-off before the span");
});

test("reminders come the day before, and an hour before anything with a time", () => {
  const item = interviewItem(interview, "staff"); // Fri 9 Oct, 3 PM
  const at = (date, minutes) => karachiEpoch(date, minutes);
  assert.equal(dueForReminder(item, "tomorrow", at("2026-10-08", 9 * 60)), true, "the morning before");
  assert.equal(dueForReminder(item, "tomorrow", at("2026-10-09", 9 * 60)), false, "not on the day");
  assert.equal(dueForReminder(item, "soon", at("2026-10-09", 14 * 60 + 5)), true, "55 minutes before");
  assert.equal(dueForReminder(item, "soon", at("2026-10-09", 13 * 60 + 55)), false, "65 minutes before");
  assert.equal(dueForReminder(item, "soon", at("2026-10-09", 15 * 60)), false, "once it has begun");
  const untimed = instalmentItem(instalment, "staff", "2026-10-08");
  assert.equal(dueForReminder(untimed, "soon", at("2026-10-09", 8 * 60 + 30)), false, "something due on a day has no hour before");
});

test("the pop-ups say the same: the day before, and an hour before", () => {
  const item = interviewItem(interview, "staff");
  const sources = popupSources(item);
  assert.deepEqual(sources.map((s) => s.notifyMinutes), [1440, 60]);
  const due = upcomingNotifications(sources, karachiEpoch("2026-10-08", 16 * 60));
  assert.equal(due.length, 2, "both fall within the next day");
  assert.equal(new Date(due[0].notifyAt).toISOString(), "2026-10-08T10:00:00.000Z", "a day before 3 PM");
  assert.deepEqual(popupSources(instalmentItem(instalment, "staff", "2026-10-08")).map((s) => s.notifyMinutes), [1440]);
});

test("an automatic item is drawn read-only, its card saying where it is kept", () => {
  const e = autoEvent(interviewItem(interview, "staff"));
  assert.equal(e.kind, "interview");
  assert.deepEqual(e.can, { edit: false, move: false, resize: false, tick: false, remove: false });
  assert.equal(e.source, undefined);
  assert.match(e.origin, /moves when the interview is rescheduled/);
});

test("one email per person, its items in order", () => {
  const items = [instalmentItem(instalment, "staff", "2026-10-08"), interviewItem(interview, "staff")];
  const mail = reminderEmail({ name: "Sana", mode: "tomorrow", items, siteUrl: "https://portal.example", calendarPath: "/calendar" });
  assert.equal(mail.subject, "Tomorrow: Interview — Ayesha Khan (University of Pisa), and 1 more");
  assert.match(mail.text, /3:00 PM–4:00 PM — Interview/);
  assert.match(mail.text, /During the day — Instalment 2 due/);
  assert.match(mail.text, /https:\/\/portal\.example\/calendar\?view=day&date=2026-10-09/);
  const soon = reminderEmail({ name: null, mode: "soon", items: [interviewItem(interview, "student")], siteUrl: null, calendarPath: null });
  assert.equal(soon.subject, "Starting soon: Interview with University of Pisa at 3:00 PM");
  assert.ok(!soon.text.includes("Your calendar:"), "a guest has no portal calendar to link to");
});

test("a pop-up says how far off it really is, and once per occurrence", async () => {
  const { startsInLabel, latestDuePerOccurrence } = await import("../src/lib/calendarRecurrence.ts");
  const item = interviewItem(interview, "staff"); // Fri 9 Oct, 3 PM
  const now = karachiEpoch("2026-10-09", 14 * 60 + 30);
  const due = upcomingNotifications(popupSources(item), now);
  // Both the day-before and the hour-before are past their moment; the interview is not.
  const { say, passOver } = latestDuePerOccurrence(due, now);
  assert.equal(say.length, 1);
  assert.equal(say[0].minutes, 60, "the hour-before, not the day-before");
  assert.equal(passOver.length, 1);
  assert.equal(startsInLabel(say[0], now), "In 30 minutes");
  assert.equal(startsInLabel(say[0], karachiEpoch("2026-10-09", 12 * 60)), "In 3 hours");
  assert.equal(startsInLabel(say[0], karachiEpoch("2026-10-08", 15 * 60)), "Tomorrow");
  assert.equal(startsInLabel(say[0], karachiEpoch("2026-10-09", 15 * 60)), "Now");
  const untimed = upcomingNotifications(popupSources(instalmentItem(instalment, "staff", "2026-10-08")), karachiEpoch("2026-10-08", 10 * 60));
  assert.equal(startsInLabel(untimed[0], karachiEpoch("2026-10-08", 10 * 60)), "Tomorrow");
});
