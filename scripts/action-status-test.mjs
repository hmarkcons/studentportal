import test from "node:test";
import assert from "node:assert/strict";
import { actionStatusMessage } from "../src/lib/actionStatus.ts";

test("a successful action says so", () => {
  assert.equal(actionStatusMessage({ success: true }), "Saved.");
});

test("the wording is whatever the button actually did", () => {
  assert.equal(actionStatusMessage({ success: true }, { label: "Sent." }), "Sent.");
  assert.equal(actionStatusMessage({ success: true }, { label: "Uploaded." }), "Uploaded.");
  assert.equal(actionStatusMessage({ success: true }, { label: "Marked paid." }), "Marked paid.");
});

test("nothing before anything has happened", () => {
  assert.equal(actionStatusMessage(undefined), null);
  assert.equal(actionStatusMessage(null), null);
  assert.equal(actionStatusMessage({}), null);
});

test("nothing while the action is running", () => {
  // A "Saved." from the previous click, beside a button busy saving again,
  // describes the wrong attempt.
  assert.equal(actionStatusMessage({ success: true }, { pending: true }), null);
});

test("nothing once the form has been touched again", () => {
  // Otherwise it reads as "your changes are saved" over changes that are not.
  assert.equal(actionStatusMessage({ success: true }, { touchedSinceResult: true }), null);
});

test("an error is never accompanied by a success message", () => {
  assert.equal(actionStatusMessage({ error: "Due date is required." }), null);
  // Even if something set both, the error is what matters and two
  // contradictory messages beside one button teach people to read neither.
  assert.equal(actionStatusMessage({ success: true, error: "Partly failed." }), null);
});

test("a blank label still says something rather than nothing", () => {
  assert.equal(actionStatusMessage({ success: true }, { label: "" }), "Saved.");
  assert.equal(actionStatusMessage({ success: true }, { label: "   " }), "Saved.");
});

test("a label is not padded into the sentence", () => {
  assert.equal(actionStatusMessage({ success: true }, { label: "  Sent.  " }), "Sent.");
});

test("every suppressing condition wins over success on its own", () => {
  for (const options of [
    { pending: true },
    { touchedSinceResult: true },
    { pending: true, touchedSinceResult: true },
  ]) {
    assert.equal(actionStatusMessage({ success: true }, options), null, JSON.stringify(options));
  }
});
