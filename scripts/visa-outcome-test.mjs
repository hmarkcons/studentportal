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

// ---------------------------------------------------- editable wording (0177)
import { fillVisaTemplate, splitParagraphs } from "../src/lib/visaOutcome.ts";

const GREETING = "Congratulations, {name} — it's official. You're going to {country}.";

test("placeholders fill from the student and their country", () => {
  assert.equal(
    fillVisaTemplate(GREETING, { name: "Ahmed Raza", country: "Italy" }),
    "Congratulations, Ahmed — it's official. You're going to Italy."
  );
});

test("a missing value takes its own punctuation with it", () => {
  // Once the office writes the sentence, the words around a placeholder are
  // not mine to control — so an empty one must not leave "Congratulations, —"
  // or "going to ." on the page where someone learns whether they are going.
  assert.equal(
    fillVisaTemplate(GREETING, { name: null, country: "Italy" }),
    "Congratulations — it's official. You're going to Italy."
  );
  assert.equal(
    fillVisaTemplate(GREETING, { name: "Ahmed", country: null }),
    "Congratulations, Ahmed — it's official. You're going."
  );
});

test("a sentence that started with a placeholder gets its capital back", () => {
  assert.equal(
    fillVisaTemplate("{name}, we're sorry. We know how much you put into this.", { name: null }),
    "We're sorry. We know how much you put into this."
  );
});

test("no rendered message ever shows a stray marker or a doubled space", () => {
  const templates = [GREETING, "{name}, we're sorry.", "You applied for {country}.", "{name} — {country}."];
  for (const t of templates) {
    for (const values of [{}, { name: "Ahmed" }, { country: "Italy" }, { name: "Ahmed", country: "Italy" }]) {
      const out = fillVisaTemplate(t, values);
      assert.ok(!out.includes("{"), `${t} → ${out}`);
      assert.ok(!out.includes("undefined") && !out.includes("null"), `${t} → ${out}`);
      assert.ok(!/ {2,}/.test(out), `${t} → ${out}`);
      assert.ok(!/^[,;:]/.test(out), `${t} → ${out}`);
    }
  }
});

test("blank lines are what separate paragraphs", () => {
  // How anybody writes prose into a textarea.
  assert.deepEqual(splitParagraphs("One.\n\nTwo.\n\n\nThree."), ["One.", "Two.", "Three."]);
  // A single newline inside a paragraph is a wrap, not a break.
  assert.deepEqual(splitParagraphs("One line\nwrapped."), ["One line wrapped."]);
  assert.deepEqual(splitParagraphs("   "), []);
});

test("stored wording is used in place of the built-in copy", () => {
  const templates = {
    approved_heading: "Visa granted",
    approved_body: "Well done {name}.\n\nSee you in {country}.",
    approved_signoff: "The office",
    refused_heading: "Not this time",
    refused_body: "Sorry {name}.",
    refused_signoff: "The office",
  };
  const m = visaMessage("approved", "Ahmed Raza", "Italy", templates);
  assert.equal(m.heading, "Visa granted");
  assert.deepEqual(m.body, ["Well done Ahmed.", "See you in Italy."]);
  assert.equal(m.signoff, "The office");
});

test("with no stored wording the built-in copy still answers", () => {
  // A database that predates the table, or a row somebody deleted, must not
  // leave a student with a badge and a blank card.
  const m = visaMessage("refused", "Ahmed", "Italy", null);
  assert.match(m.heading, /not approved/i);
  assert.ok(m.body.length > 0);
});
