import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FAILURE_STREAK,
  buildScholarshipFailureEmail,
  decideFailureAlert,
  summariseError,
} from "../src/lib/scholarshipFailureAlert.ts";

// The scholarship research runs unattended at 06:00 and its failures were only
// visible to somebody who opened the page — nine of them sat in the history for
// days while the API key had no credit. These cover when that is worth an email
// and, as much, when it is not: an alert that fires on every failure or repeats
// every morning is one people filter away, and then the next real outage is
// invisible again.

let n = 0;
const run = (over = {}) => ({
  id: `r${++n}`,
  status: "failed",
  finished_at: "2026-09-19T06:00:00.000Z",
  error: "credit balance is too low",
  failure_notified_at: null,
  body: "ESU Padova",
  ...over,
});

test("one failure is weather, not news", () => {
  const d = decideFailureAlert([run(), run({ status: "applied" })]);
  assert.equal(d.alert, false);
  assert.equal(d.streak, 1);
});

test("a failure short of the threshold says nothing", () => {
  const runs = Array.from({ length: FAILURE_STREAK - 1 }, () => run());
  assert.equal(decideFailureAlert(runs).alert, false);
});

test("a run of failures is reported", () => {
  const runs = Array.from({ length: FAILURE_STREAK }, () => run());
  const d = decideFailureAlert(runs);
  assert.equal(d.alert, true);
  assert.equal(d.streak, FAILURE_STREAK);
});

test("a success breaks the streak", () => {
  // Newest first: two failures, then a success, then older failures. The
  // older ones are a different outage and were dealt with already.
  const runs = [run(), run(), run({ status: "applied" }), run(), run(), run()];
  const d = decideFailureAlert(runs);
  assert.equal(d.alert, false);
  assert.equal(d.streak, 2);
});

test("an ongoing outage is reported once, not every morning", () => {
  // The key stays dead and the cron runs again tomorrow. One of the runs in
  // the streak is already stamped, so nothing more is sent.
  const runs = [run(), run(), run({ failure_notified_at: "2026-09-19T06:00:05.000Z" }), run()];
  const d = decideFailureAlert(runs);
  assert.equal(d.alert, false);
  assert.match(d.reason, /already reported/);
});

test("a fresh outage after a success is reported again", () => {
  const runs = [
    ...Array.from({ length: FAILURE_STREAK }, () => run()),
    run({ status: "applied" }),
    run({ failure_notified_at: "2026-09-01T06:00:00.000Z" }),
  ];
  assert.equal(decideFailureAlert(runs).alert, true);
});

test("no history at all is not an alert", () => {
  assert.equal(decideFailureAlert([]).alert, false);
});

test("statuses other than failed do not count towards a streak", () => {
  const runs = [run({ status: "proposed" }), run(), run(), run()];
  const d = decideFailureAlert(runs);
  assert.equal(d.alert, false);
  assert.equal(d.streak, 0);
});

// --------------------------------------------------------------- the message
test("the email says what broke, for how long, and what to do", () => {
  const d = decideFailureAlert(Array.from({ length: FAILURE_STREAK }, () => run()));
  assert.equal(d.alert, true);
  const { subject, text } = buildScholarshipFailureEmail(d);
  assert.match(subject, new RegExp(`failed ${FAILURE_STREAK} times`));
  assert.match(text, /credit balance is too low/);
  assert.match(text, /Test the key/);
  // The reader's first worry is whether the stored guides are damaged.
  assert.match(text, /Nothing is wrong with the stored data/);
});

test("the affected bodies are named, without listing forty of them", () => {
  const many = Array.from({ length: 12 }, (_, i) => run({ body: `Body ${i}` }));
  const d = decideFailureAlert(many);
  const { text } = buildScholarshipFailureEmail(d);
  assert.match(text, /Body 0/);
  assert.match(text, /…/);
});

test("a wall of provider JSON is cut down", () => {
  const long = JSON.stringify({ type: "error", error: { message: "x".repeat(500) } });
  const short = summariseError(long);
  assert.ok(short.length <= 301, `still ${short.length} characters`);
  assert.match(short, /…$/);
});

test("a missing error still reads as a sentence", () => {
  assert.equal(summariseError(null), "no error was recorded");
});

test("whitespace in an error is collapsed, so the mail stays readable", () => {
  assert.equal(summariseError("a\n\n  b\tc"), "a b c");
});
