// Rows becoming calendar items (src/lib/calendarItems.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  taskEvents,
  personalEvents,
  reminderEvent,
  recordEvent,
  coversDate,
  isGridTimed,
  eventsOn,
  compareForDay,
  matchesQuery,
} from "../src/lib/calendarItems.ts";

const RANGE = { start: "2026-09-20", end: "2026-09-26" };

const personal = {
  id: "p1",
  title: "Call the printer",
  description: "About the brochures",
  due_date: "2026-09-22",
  due_time: "18:00:00",
  end_date: null,
  end_time: "19:30:00",
  all_day: false,
  priority: "medium",
  status: "pending",
  color: "blue",
  guest_emails: ["a@example.com"],
  recurrence: "none",
  recurrence_end_date: null,
  location: "Office",
  notify_minutes: 30,
  student_id: null,
  studentName: null,
};

test("a personal task carries everything the editor needs", () => {
  const [e] = personalEvents(personal, RANGE);
  assert.equal(e.id, "personal-p1-2026-09-22");
  assert.equal(e.seriesKey, "personal:p1");
  assert.equal(e.time, "18:00");
  assert.equal(e.endTime, "19:30");
  assert.equal(e.location, "Office");
  assert.equal(e.notifyMinutes, 30);
  assert.deepEqual(e.source, { table: "personal_tasks", id: "p1" });
  assert.deepEqual(e.can, { edit: true, move: true, resize: true, tick: true, remove: true });
});

test("before 0295 the new columns are simply absent, and read as empty", () => {
  const { end_time: _a, location: _b, notify_minutes: _c, ...legacy } = personal;
  const [e] = personalEvents(legacy, RANGE);
  assert.equal(e.endTime, null);
  assert.equal(e.location, null);
  assert.equal(e.notifyMinutes, null);
});

test("an all-day item has no times and cannot be resized", () => {
  const [e] = personalEvents({ ...personal, all_day: true }, RANGE);
  assert.equal(e.time, null);
  assert.equal(e.endTime, null);
  assert.equal(e.can.resize, false);
  assert.equal(e.can.move, true);
});

test("a repeating one appears on each of its days, all of one series", () => {
  const events = personalEvents({ ...personal, due_date: "2026-01-05", recurrence: "weekdays" }, RANGE);
  assert.deepEqual(events.map((e) => e.date), ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25"]);
  assert.ok(events.every((e) => e.seriesKey === "personal:p1" && e.startDate === "2026-01-05"));
  assert.equal(new Set(events.map((e) => e.id)).size, 5);
});

test("a task names its student and links to the application", () => {
  const [e] = taskEvents(
    {
      id: "t1",
      description: "Chase the transcript",
      notes: null,
      due_date: "2026-09-23",
      due_time: null,
      end_date: null,
      all_day: true,
      priority: "urgent",
      status: "pending",
      color: null,
      guest_emails: null,
      recurrence: "none",
      recurrence_end_date: null,
      applicationId: "a1",
      studentId: "s1",
      studentName: "Aun Hyder",
    },
    RANGE
  );
  assert.equal(e.title, "Chase the transcript — Aun Hyder");
  assert.equal(e.rawTitle, "Chase the transcript");
  assert.equal(e.href, "/students/s1/applications/a1");
  assert.equal(e.kind, "task");
  assert.equal(e.allDay, true);
});

test("a reminder moves and resolves, but has no end to drag", () => {
  const e = reminderEvent({
    id: "r1",
    type: "follow_up",
    due_date: "2026-09-24",
    due_time: "11:00:00",
    note: null,
    resolved: true,
    studentId: "l1",
    studentName: "Haris",
    contactNumber: "0300",
  });
  assert.equal(e.title, "Haris - Follow-up (0300)");
  assert.equal(e.time, "11:00");
  assert.equal(e.done, true);
  assert.equal(e.can.move, true);
  assert.equal(e.can.resize, false);
  assert.equal(e.href, "/leads/l1");
});

test("a record of something else can be looked at and nothing more", () => {
  const e = recordEvent({ id: "deadline-a1", kind: "deadline", date: "2026-09-25", title: "Deadline", href: "/x", origin: "From the application" });
  assert.deepEqual(e.can, { edit: false, move: false, resize: false, tick: false, remove: false });
  assert.equal(e.source, undefined);
});

test("a multi-day item covers each of its days and sits in the all-day row", () => {
  const [e] = personalEvents({ ...personal, due_date: "2026-09-18", end_date: "2026-09-21" }, RANGE);
  assert.equal(e.spanEnd, "2026-09-21");
  assert.equal(coversDate(e, "2026-09-20"), true);
  assert.equal(coversDate(e, "2026-09-22"), false);
  assert.equal(isGridTimed(e), false, "timed, but longer than a day");
  assert.equal(e.can.resize, false);
});

test("a day lists spans, then all-day, then by time", () => {
  const timed = personalEvents(personal, RANGE)[0];
  const allDay = personalEvents({ ...personal, id: "p2", all_day: true, title: "B" }, RANGE)[0];
  const span = personalEvents({ ...personal, id: "p3", due_date: "2026-09-21", end_date: "2026-09-23", title: "C" }, RANGE)[0];
  const early = personalEvents({ ...personal, id: "p4", due_time: "08:00", title: "D" }, RANGE)[0];
  assert.deepEqual(eventsOn([timed, allDay, span, early], "2026-09-22").map((e) => e.id.split("-")[1]), ["p3", "p2", "p4", "p1"]);
  assert.ok(compareForDay(allDay, timed) < 0);
});

test("search matches the title, the student, the place and the notes, ignoring case", () => {
  const [e] = personalEvents({ ...personal, studentName: "Mueen Alam" }, RANGE);
  for (const q of ["printer", "MUEEN", "office", "brochures"]) assert.equal(matchesQuery(e, q), true, q);
  assert.equal(matchesQuery(e, "visa"), false);
  assert.equal(matchesQuery(e, "   "), false);
});
