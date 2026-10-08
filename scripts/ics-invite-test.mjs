// Calendar invitations to guests (src/lib/icsInvite.ts): the file a guest's
// calendar reads, who is owed an invitation, an update or a cancellation, and
// the words of the email.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInvite, foldLine, icsText, inviteActions, inviteEmail, inviteSignature, inviteWhen, karachiInstant, repeatRule } from "../src/lib/icsInvite.ts";

const event = {
  title: "Visa file review, Ayesha",
  description: "Bring the bank statement;\nand the passport",
  location: "HMARK office, Karachi",
  date: "2026-10-09",
  endDate: null,
  time: "15:00",
  endTime: "16:30",
  recurrence: null,
  recurrenceEndDate: null,
  alarmMinutes: 30,
};
const base = { uid: "personal-1@hmarkconsultants.com", organizer: { name: "Sana Ali", email: "sana@hmarkconsultants.com" }, attendees: ["guest@example.com"], now: new Date("2026-10-08T06:00:00Z") };

test("a Karachi time is the instant five hours earlier in UTC", () => {
  assert.equal(karachiInstant("2026-10-09", 15 * 60).toISOString(), "2026-10-09T10:00:00.000Z");
  assert.equal(karachiInstant("2026-10-09", 2 * 60).toISOString(), "2026-10-08T21:00:00.000Z", "early morning in Karachi is the day before in UTC");
});

test("an invitation carries the event as a guest's calendar reads it", () => {
  const raw = buildInvite({ ...base, sequence: 0, method: "REQUEST", event });
  // Read as a calendar reads it: folded lines joined back up.
  const ics = raw.replace(/\r\n /g, "");
  assert.ok(raw.endsWith("\r\n") && !/[^\r]\n/.test(raw), "lines end in CRLF");
  for (const line of [
    "METHOD:REQUEST",
    "UID:personal-1@hmarkconsultants.com",
    "SEQUENCE:0",
    "DTSTART:20261009T100000Z",
    "DTEND:20261009T113000Z",
    "SUMMARY:Visa file review\\, Ayesha",
    "LOCATION:HMARK office\\, Karachi",
    "STATUS:CONFIRMED",
    "TRIGGER:-PT30M",
    "ORGANIZER;CN=Sana Ali:mailto:sana@hmarkconsultants.com",
  ]) {
    assert.ok(ics.split("\r\n").includes(line), `has ${line}`);
  }
  assert.ok(ics.includes("DESCRIPTION:Bring the bank statement\\;\\nand the passport"), "text escaped");
  assert.ok(ics.includes("mailto:guest@example.com"));
});

test("an all-day item is a date, its end the day after the last", () => {
  const ics = buildInvite({ ...base, sequence: 0, method: "REQUEST", event: { ...event, time: null, endTime: null, endDate: "2026-10-11" } });
  assert.ok(ics.includes("DTSTART;VALUE=DATE:20261009"));
  assert.ok(ics.includes("DTEND;VALUE=DATE:20261012"));
});

test("a timed item with no end lasts an hour", () => {
  const ics = buildInvite({ ...base, sequence: 0, method: "REQUEST", event: { ...event, endTime: null } });
  assert.ok(ics.includes("DTEND:20261009T110000Z"));
});

test("a repeating item repeats in the guest's calendar too, until its last day", () => {
  assert.equal(repeatRule("weekly", null, { minutes: 900 }), "FREQ=WEEKLY");
  assert.equal(repeatRule("weekdays", "2026-12-31", { minutes: 900 }), "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;UNTIL=20261231T100000Z");
  assert.equal(repeatRule("monthly", "2026-12-31", null), "FREQ=MONTHLY;UNTIL=20261231");
  assert.equal(repeatRule("none", null, null), null);
  assert.equal(repeatRule(null, null, null), null);
});

test("a cancellation is the same event, a later sequence, marked cancelled and without an alarm", () => {
  const ics = buildInvite({ ...base, sequence: 3, method: "CANCEL", event });
  assert.ok(ics.includes("METHOD:CANCEL") && ics.includes("SEQUENCE:3") && ics.includes("STATUS:CANCELLED"));
  assert.ok(!ics.includes("VALARM"));
});

test("long lines fold at 75 octets, as the format requires", () => {
  const long = "DESCRIPTION:" + "é".repeat(60);
  const folded = foldLine(long);
  assert.ok(folded.split("\r\n").every((l) => Buffer.byteLength(l, "utf8") <= 75));
  assert.equal(folded.split("\r\n ").join(""), long, "unfolds to the original");
  assert.equal(icsText("a,b;c\\d\ne"), "a\\,b\\;c\\\\d\\ne");
});

test("each guest is owed an invitation, an update, a cancellation — or nothing", () => {
  const sig = inviteSignature(event);
  const moved = inviteSignature({ ...event, time: "16:00" });
  const sent = [
    { email: "kept@x.pk", signature: sig, cancelled: false },
    { email: "dropped@x.pk", signature: sig, cancelled: false },
    { email: "back@x.pk", signature: sig, cancelled: true },
  ];
  assert.deepEqual(inviteActions(["kept@x.pk", "new@x.pk", "Back@x.pk"], sent, sig, false), { invite: ["new@x.pk", "back@x.pk"], update: [], cancel: ["dropped@x.pk"] });
  assert.deepEqual(inviteActions(["kept@x.pk"], sent, moved, false), { invite: [], update: ["kept@x.pk"], cancel: ["dropped@x.pk"] });
  assert.deepEqual(inviteActions(["kept@x.pk"], sent, sig, true), { invite: [], update: [], cancel: ["kept@x.pk", "dropped@x.pk"] }, "a deleted item is cancelled for everyone");
  assert.equal(inviteSignature({ ...event, alarmMinutes: 5 }), sig, "the guest's own alarm is not news");
});

test("the email says what happened and when, in words", () => {
  assert.equal(inviteWhen(event), "Friday, 9 October 2026, 3:00 PM – 4:30 PM Pakistan time");
  assert.equal(inviteWhen({ ...event, time: null, endTime: null }), "Friday, 9 October 2026 (all day)");
  assert.equal(
    inviteWhen({ ...event, recurrence: "weekly", recurrenceEndDate: "2026-12-31" }),
    "Friday, 9 October 2026, 3:00 PM – 4:30 PM Pakistan time, repeating every week until Thursday, 31 December 2026"
  );
  const invite = inviteEmail({ kind: "invite", event, organizerName: "Sana Ali", when: inviteWhen(event) });
  assert.match(invite.subject, /^Invitation: Visa file review, Ayesha/);
  assert.match(invite.text, /Sana Ali has invited you/);
  assert.match(inviteEmail({ kind: "update", event, organizerName: "Sana Ali", when: "x" }).subject, /^Updated invitation:/);
  const cancel = inviteEmail({ kind: "cancel", event, organizerName: "Sana Ali", when: "x" });
  assert.match(cancel.subject, /^Cancelled:/);
  assert.ok(!cancel.html.includes("<script"), "html escaped");
  assert.ok(inviteEmail({ kind: "invite", event: { ...event, title: "<b>x</b>" }, organizerName: "S", when: "x" }).html.includes("&lt;b&gt;"));
});
