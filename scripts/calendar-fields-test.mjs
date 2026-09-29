import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseGuestEmails,
  eventFieldsError,
  CALENDAR_RECURRENCES,
  CALENDAR_PRIORITIES,
  parseNotifyMinutes,
  readEventForm,
  isMissingColumnError,
  withoutNewColumns,
} from "../src/lib/calendarEventFields.ts";
import { expandRecurrence } from "../src/lib/calendarDates.ts";

const base = {
  title: "Chase the transcript",
  dueDate: "2026-09-15",
  endDate: null,
  recurrence: "none",
  recurrenceEndDate: null,
  priority: "medium",
};

test("a valid event passes", () => {
  assert.equal(eventFieldsError(base), null);
});

test("title and date are required", () => {
  assert.match(eventFieldsError({ ...base, title: "" }) ?? "", /title/i);
  assert.match(eventFieldsError({ ...base, dueDate: "" }) ?? "", /date/i);
});

test("a malformed date is refused", () => {
  assert.match(eventFieldsError({ ...base, dueDate: "15/09/2026" }) ?? "", /not a valid/);
});

test("an end date before the start is refused", () => {
  assert.match(eventFieldsError({ ...base, endDate: "2026-09-01" }) ?? "", /before the start/);
});

test("the same day is fine as an end date", () => {
  assert.equal(eventFieldsError({ ...base, endDate: "2026-09-15" }), null);
});

test("the recurrence values match the database constraint (0295)", () => {
  assert.deepEqual([...CALENDAR_RECURRENCES], ["none", "daily", "weekly", "monthly", "yearly", "weekdays"]);
  // And the migration's check lists exactly these, so the form cannot offer
  // one the database refuses.
  const sql = readFileSync(new URL("../supabase/migrations/0295_calendar_times.sql", import.meta.url), "utf8");
  for (const table of ["application_tasks", "personal_tasks"]) {
    const check = new RegExp(`${table}_recurrence_check\\s+check \\(recurrence in \\(([^)]*)\\)\\)`).exec(sql);
    assert.ok(check, `0295 recreates ${table}_recurrence_check`);
    assert.deepEqual(check[1].split(",").map((s) => s.trim().replace(/'/g, "")), [...CALENDAR_RECURRENCES]);
  }
});

test("the priority values match the database constraint", () => {
  assert.deepEqual([...CALENDAR_PRIORITIES], ["urgent", "medium", "low"]);
});

test("an unknown recurrence is refused rather than reaching the constraint", () => {
  assert.match(eventFieldsError({ ...base, recurrence: "fortnightly" }) ?? "", /Repeat has to be/);
  assert.equal(eventFieldsError({ ...base, recurrence: "yearly" }), null);
  assert.equal(eventFieldsError({ ...base, recurrence: "weekdays" }), null);
});

test("an unknown priority is refused", () => {
  assert.match(eventFieldsError({ ...base, priority: "critical" }) ?? "", /Priority has to be/);
});

test("a repeat ending before it starts is refused, not saved to appear nowhere", () => {
  const err = eventFieldsError({ ...base, recurrence: "weekly", recurrenceEndDate: "2026-09-01" });
  assert.match(err ?? "", /ends before it starts/);
  // And the expansion would indeed produce nothing, which is what makes it
  // worth refusing at the point of entry.
  assert.deepEqual(expandRecurrence("2026-09-15", "weekly", "2026-09-01", "2026-08-30", "2026-10-10"), []);
});

test("a repeat-until date with no repeat is refused", () => {
  assert.match(
    eventFieldsError({ ...base, recurrence: "none", recurrenceEndDate: "2026-12-01" }) ?? "",
    /how often it repeats/
  );
});

// Guest emails: these people are mailed the reminder, so a typo means silence.
test("valid guests are kept, lower-cased and de-duplicated", () => {
  const r = parseGuestEmails(" Docs.HMARK@gmail.com , hmarkcons@gmail.com, docs.hmark@gmail.com ");
  assert.equal(r.error, null);
  assert.deepEqual(r.emails, ["docs.hmark@gmail.com", "hmarkcons@gmail.com"]);
});

test("an empty list is fine", () => {
  for (const empty of ["", "   ", ",, ,", null, undefined]) {
    const r = parseGuestEmails(empty);
    assert.equal(r.error, null);
    assert.deepEqual(r.emails, []);
  }
});

test("something that is not an address is refused, and named", () => {
  const r = parseGuestEmails("john, hmarkcons@gmail.com");
  assert.match(r.error ?? "", /not an email address: john/);
  assert.match(r.error ?? "", /never hear about it/);
  assert.deepEqual(r.emails, [], "nothing is saved when part of the list is wrong");
});

test("several bad addresses are all reported", () => {
  const r = parseGuestEmails("john, mary@, @example.com");
  assert.match(r.error ?? "", /are not email addresses/);
  for (const bad of ["john", "mary@", "@example.com"]) {
    assert.ok((r.error ?? "").includes(bad), `${bad} was not named`);
  }
});

test("an address with no dot in the domain is refused", () => {
  assert.match(parseGuestEmails("someone@localhost").error ?? "", /not an email address/);
});

test("an address with a space is refused", () => {
  assert.match(parseGuestEmails("two people@example.com").error ?? "", /not an email address/);
});

// ------------------------------------------------ times, place, notification (0295)

test("an end time after the start is fine; one at or before it is refused", () => {
  assert.equal(eventFieldsError({ ...base, dueTime: "18:00", endTime: "19:30" }), null);
  assert.match(eventFieldsError({ ...base, dueTime: "18:00", endTime: "18:00" }) ?? "", /ends before it starts/);
  assert.match(eventFieldsError({ ...base, dueTime: "18:00", endTime: "09:00" }) ?? "", /ends before it starts/);
});

test("across several days an earlier clock time on the last day is an overnight, not an error", () => {
  assert.equal(eventFieldsError({ ...base, endDate: "2026-09-16", dueTime: "22:00", endTime: "02:00" }), null);
});

test("an end time with no start time is refused", () => {
  assert.match(eventFieldsError({ ...base, endTime: "10:00" }) ?? "", /start time/);
});

test("an all-day item ignores its times", () => {
  assert.equal(eventFieldsError({ ...base, allDay: true, dueTime: "18:00", endTime: "09:00" }), null);
});

test("a notification is a whole number of minutes, up to four weeks", () => {
  assert.deepEqual(parseNotifyMinutes(""), { value: null, error: null });
  assert.deepEqual(parseNotifyMinutes("none"), { value: null, error: null });
  assert.deepEqual(parseNotifyMinutes("0"), { value: 0, error: null });
  assert.deepEqual(parseNotifyMinutes("30"), { value: 30, error: null });
  assert.deepEqual(parseNotifyMinutes("40320"), { value: 40320, error: null });
  for (const bad of ["-5", "40321", "7.5", "soon"]) assert.ok(parseNotifyMinutes(bad).error, bad);
  assert.match(eventFieldsError({ ...base, notifyMinutes: 50000 }) ?? "", /four weeks/);
});

test("a location past 500 characters is refused", () => {
  assert.equal(eventFieldsError({ ...base, location: "Room 4" }), null);
  assert.match(eventFieldsError({ ...base, location: "x".repeat(501) }) ?? "", /500/);
});

function form(fields) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

test("readEventForm reads every column the editor saves", () => {
  const { values, error } = readEventForm(
    form({
      title: " Mock interview ",
      notes: "Bring the CV",
      due_date: "2026-09-22",
      due_time: "18:00",
      end_time: "19:00",
      priority: "urgent",
      color: "blue",
      guest_emails: "A@Example.com; b@example.com",
      recurrence: "weekdays",
      recurrence_end_date: "2026-10-30",
      location: "Office, room 2",
      notify_minutes: "30",
    })
  );
  assert.equal(error, null);
  assert.deepEqual(values, {
    title: "Mock interview",
    notes: "Bring the CV",
    due_date: "2026-09-22",
    end_date: null,
    all_day: false,
    due_time: "18:00",
    end_time: "19:00",
    priority: "urgent",
    color: "blue",
    guest_emails: ["a@example.com", "b@example.com"],
    recurrence: "weekdays",
    recurrence_end_date: "2026-10-30",
    location: "Office, room 2",
    notify_minutes: 30,
  });
});

test("readEventForm: all day drops the times, and an end date on the start day is no end date", () => {
  const { values, error } = readEventForm(
    form({ title: "Holiday", due_date: "2026-09-22", end_date: "2026-09-22", all_day: "on", due_time: "10:00", end_time: "11:00" })
  );
  assert.equal(error, null);
  assert.equal(values.all_day, true);
  assert.equal(values.due_time, null);
  assert.equal(values.end_time, null);
  assert.equal(values.end_date, null);
  assert.equal(values.notify_minutes, null);
  assert.equal(values.recurrence, "none");
});

test("readEventForm says what is wrong", () => {
  assert.match(readEventForm(form({ title: "", due_date: "2026-09-22" })).error ?? "", /title/);
  assert.match(readEventForm(form({ title: "x", due_date: "2026-09-22", guest_emails: "john" })).error ?? "", /not an email/);
  assert.match(readEventForm(form({ title: "x", due_date: "2026-09-22", notify_minutes: "-1" })).error ?? "", /four weeks/);
  assert.match(
    readEventForm(form({ title: "x", due_date: "2026-09-22", due_time: "10:00", end_time: "09:00" })).error ?? "",
    /ends before it starts/
  );
});

test("a missing 0295 column is recognised, and dropped only when nothing is lost", () => {
  assert.equal(isMissingColumnError({ code: "42703", message: "column personal_tasks.end_time does not exist" }), true);
  assert.equal(isMissingColumnError({ code: "PGRST204", message: "Could not find the 'location' column of 'personal_tasks' in the schema cache" }), true);
  assert.equal(isMissingColumnError({ code: "23514", message: "violates check constraint" }), false);
  assert.equal(isMissingColumnError(null), false);

  assert.deepEqual(withoutNewColumns({ title: "a", end_time: null, location: null, notify_minutes: null }), { title: "a" });
  assert.deepEqual(withoutNewColumns({ title: "a" }), { title: "a" });
  assert.equal(withoutNewColumns({ title: "a", end_time: "10:00", location: null, notify_minutes: null }), null);
  assert.equal(withoutNewColumns({ title: "a", notify_minutes: 0 }), null, "0 minutes is a notification, not nothing");
});
