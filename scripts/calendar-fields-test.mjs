import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseGuestEmails,
  eventFieldsError,
  CALENDAR_RECURRENCES,
  CALENDAR_PRIORITIES,
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

test("the recurrence values match the database constraint", () => {
  assert.deepEqual([...CALENDAR_RECURRENCES], ["none", "daily", "weekly", "monthly"]);
});

test("the priority values match the database constraint", () => {
  assert.deepEqual([...CALENDAR_PRIORITIES], ["urgent", "medium", "low"]);
});

test("an unknown recurrence is refused rather than reaching the constraint", () => {
  assert.match(eventFieldsError({ ...base, recurrence: "yearly" }) ?? "", /Repeat has to be/);
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
