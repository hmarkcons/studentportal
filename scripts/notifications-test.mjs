// Stored alerts (0320): how they read once grouped, where they lead, the
// email each sends, and when a reminder is due again.
import { test } from "node:test";
import assert from "node:assert/strict";
import { excerpt, homeOf, notificationEmail, notificationHref, notificationTitle, notificationTone, reminderDue, whenAgo } from "../src/lib/notificationText.ts";

test("one alert reads as itself; grouped, as how many", () => {
  const n = { title: "New message from HMARK", title_many: "{n} new messages from HMARK" };
  assert.equal(notificationTitle({ ...n, count: 1 }), "New message from HMARK");
  assert.equal(notificationTitle({ ...n, count: 3 }), "3 new messages from HMARK");
  assert.equal(notificationTitle({ ...n, count: 2805, title_many: "{n} leads assigned to you" }), "2,805 leads assigned to you");
  assert.equal(notificationTitle({ title: "Payment received: EUR 500", title_many: null, count: 2 }), "Payment received: EUR 500", "a kind never grouped keeps its title");
});

test("it leads to the record, or the list once grouped, and never off the portal", () => {
  assert.equal(notificationHref({ link: "/leads/1", link_many: "/leads", count: 1 }, "staff"), "/leads/1");
  assert.equal(notificationHref({ link: "/leads/1", link_many: "/leads", count: 5 }, "staff"), "/leads");
  assert.equal(notificationHref({ link: "https://evil.example", link_many: null, count: 1 }, "student"), "/portal");
  assert.equal(notificationHref({ link: null, link_many: null, count: 1 }, "partner"), "/partner");
  assert.equal(homeOf("staff"), "/dashboard");
});

test("a long message is cut to a line", () => {
  assert.equal(excerpt("  Hello\n\nthere  "), "Hello there");
  assert.equal(excerpt(""), null);
  const long = excerpt("x".repeat(500), 140);
  assert.equal(long.length, 140);
  assert.ok(long.endsWith("…"));
});

test("when, in words", () => {
  const now = Date.parse("2026-10-07T12:00:00Z");
  assert.equal(whenAgo("2026-10-07T11:59:40Z", now), "just now");
  assert.equal(whenAgo("2026-10-07T11:55:00Z", now), "5 min ago");
  assert.equal(whenAgo("2026-10-07T09:00:00Z", now), "3 h ago");
  assert.equal(whenAgo("2026-10-05T12:00:00Z", now), "2 days ago");
  assert.match(whenAgo("2026-09-01T12:00:00Z", now), /^1 \w+ 2026$/, "older than a week: the date");
});

test("kinds have a tone", () => {
  assert.equal(notificationTone("document_rejected"), "attention");
  assert.equal(notificationTone("payment"), "good");
  assert.equal(notificationTone("lead_assigned"), "assigned");
  assert.equal(notificationTone("student_message"), "message");
  assert.equal(notificationTone("something_new"), "info");
});

test("the email: its title as the subject, a line of it, a way back in, nothing unescaped", () => {
  const mail = notificationEmail({
    recipientName: "Ali Raza",
    title: "Passport needs uploading again",
    body: "The scan is blurred <b>please</b> retake",
    url: "https://portal.hmarkconsultants.com/portal/documents",
    audience: "student",
  });
  assert.equal(mail.subject, "Passport needs uploading again");
  assert.match(mail.text, /^Hi Ali,/);
  assert.match(mail.text, /Open your portal: https:\/\/portal\.hmarkconsultants\.com\/portal\/documents/);
  assert.ok(mail.html.includes("&lt;b&gt;please&lt;/b&gt;"), "a message's own markup is shown, not run");
  assert.ok(!mail.html.includes("<b>please"));
  const staff = notificationEmail({ recipientName: null, title: "3 new messages from Sara", body: null, url: "https://x/y", audience: "staff" });
  assert.match(staff.text, /^Hello,/);
  assert.match(staff.text, /Open in the portal/);
});

test("a reminder is one per spell", () => {
  const now = Date.parse("2026-10-07T09:00:00Z");
  assert.equal(reminderDue(null, 7, now), true);
  assert.equal(reminderDue("2026-10-05T09:00:00Z", 7, now), false);
  assert.equal(reminderDue("2026-09-30T09:02:00Z", 7, now), true, "a run a couple of minutes early the day it falls due still sends");
  assert.equal(reminderDue("2026-10-06T09:00:00Z", 1, now), true);
});
