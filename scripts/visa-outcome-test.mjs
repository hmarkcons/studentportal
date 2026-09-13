import test from "node:test";
import assert from "node:assert/strict";
import { readVisaDecision, visaMessage } from "../src/lib/visaOutcome.ts";

test("an outcome is read however the office words it", () => {
  for (const yes of ["Approved", "approved", "Visa Issued", "GRANTED", "issued"]) {
    assert.equal(readVisaDecision(yes), "approved", yes);
  }
  for (const no of ["Refused", "rejected", "REFUSED", "denied"]) {
    assert.equal(readVisaDecision(no), "refused", no);
  }
});

test("nothing recorded is pending, not a refusal", () => {
  // Reading a blank as "refused" would show a student the worst message on
  // this page because nobody had filled the field in yet.
  for (const blank of ["", "   ", null, undefined, "in progress", "submitted"]) {
    assert.equal(readVisaDecision(blank), "pending", String(blank));
  }
});

test("a pending visa gets no message at all", () => {
  // The card still shows the appointments; there is simply no news to break.
  assert.equal(visaMessage("pending", "Ahmed", "Italy"), null);
});

test("the approval names the student and the country", () => {
  const m = visaMessage("approved", "Ahmed Raza", "Italy");
  assert.match(m.heading, /issued/i);
  assert.ok(m.body.join(" ").includes("Ahmed"), "uses the first name");
  assert.ok(!m.body.join(" ").includes("Raza"), "first name only, not the full name");
  assert.ok(m.body.join(" ").includes("Italy"));
  assert.equal(m.signoff, "HMARK Consultants");
});

test("the refusal says sorry before it says anything else", () => {
  const m = visaMessage("refused", "Ahmed", "Italy");
  // Order matters here more than wording: hope offered before the bad news
  // has landed reads as brushing past it.
  assert.match(m.body[0], /sorry/i);
  assert.match(m.body[0], /hard news|fair to feel/i);
  assert.match(m.body[1], /still here|apply again|next intake/i);
  assert.equal(m.signoff, "The HMARK team");
});

test("the refusal never blames the student", () => {
  const text = visaMessage("refused", "Ahmed", "Italy").body.join(" ").toLowerCase();
  for (const word of ["your fault", "you failed", "unfortunately you", "you did not"]) {
    assert.ok(!text.includes(word), word);
  }
});

test("a missing name or country does not leave a gap in the sentence", () => {
  // A student record with no country resolved must not read
  // "You're going to ." or "Congratulations, — it's official."
  for (const m of [
    visaMessage("approved", null, null),
    visaMessage("approved", "", ""),
    visaMessage("refused", null, null),
  ]) {
    const text = m.body.join(" ");
    assert.ok(!text.includes(" , "), text);
    assert.ok(!/\s\./.test(text), text);
    assert.ok(!text.includes("undefined") && !text.includes("null"), text);
  }
});
