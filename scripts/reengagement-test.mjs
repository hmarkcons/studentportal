import test from "node:test";
import assert from "node:assert/strict";
import {
  REENGAGEMENT_PLACEHOLDERS,
  reengagementKind,
  fillReengagement,
  buildReengagementDraft,
  whatsappLink,
} from "../src/lib/reengagement.ts";

const TEMPLATES = {
  ghost_subject: "Are you still thinking about studying abroad, {name}?",
  ghost_body: "Hello {name},\n\nWe have not been able to reach you.\n\n{counsellor}\nHMARK Consultants",
  withdrawn_subject: "If anything changes, {name}, we have kept everything",
  withdrawn_body: "Hello {name},\n\nWe were sorry to hear.\n\n{counsellor}\nHMARK Consultants",
};

test("which message applies follows the status", () => {
  assert.equal(reengagementKind("ghost"), "ghost");
  assert.equal(reengagementKind("withdrawn"), "withdrawn");
  for (const none of ["registered", "", null, undefined, "other"]) {
    assert.equal(reengagementKind(none), null, String(none));
  }
});

test("only the two placeholders are offered", () => {
  assert.deepEqual([...REENGAGEMENT_PLACEHOLDERS], ["{name}", "{counsellor}"]);
});

test("the first name is used, not the whole one", () => {
  assert.equal(fillReengagement("Hello {name},", { name: "Kamran Aslam Butt" }), "Hello Kamran,");
});

test("both placeholders fill", () => {
  const out = fillReengagement("Hi {name} — {counsellor}", { name: "Sana Iqbal", counsellor: "Usman" });
  assert.equal(out, "Hi Sana — Usman");
});

test("a missing name does not leave a dangling comma on a real screen", () => {
  assert.equal(fillReengagement("Hello {name},", { name: null }), "Hello,");
  assert.equal(fillReengagement("Hello {name}, we wrote", { name: "" }), "Hello, we wrote");
});

test("a missing name in mid-sentence takes its punctuation with it", () => {
  assert.equal(
    fillReengagement("If anything changes, {name}, we have kept everything", { name: null }),
    "If anything changes, we have kept everything"
  );
});

test("a missing signature does not leave a blank line in the letter", () => {
  const out = fillReengagement("Thanks.\n\n{counsellor}\nHMARK Consultants", { counsellor: null });
  assert.equal(out, "Thanks.\n\nHMARK Consultants");
  assert.doesNotMatch(out, /\n\n\n/);
});

test("nothing is left doubled up or trailing", () => {
  const out = fillReengagement("Hello {name}, {counsellor} here.", { name: null, counsellor: null });
  assert.doesNotMatch(out, /\s,/);
  assert.doesNotMatch(out, /,\s*,/);
  assert.doesNotMatch(out, /^\s|\s$/);
});

test("a complete template is left exactly as written", () => {
  const written = "Hello {name},\n\nTwo  spaces stay if they are ours.\n\n{counsellor}";
  const out = fillReengagement(written, { name: "Sana", counsellor: "Usman" });
  assert.equal(out, "Hello Sana,\n\nTwo  spaces stay if they are ours.\n\nUsman");
});

test("a ghosted student gets the ghost draft", () => {
  const d = buildReengagementDraft("ghost", { full_name: "Kamran Aslam" }, "Usman", TEMPLATES);
  assert.equal(d.kind, "ghost");
  assert.equal(d.subject, "Are you still thinking about studying abroad, Kamran?");
  assert.match(d.body, /^Hello Kamran,/);
  assert.match(d.body, /Usman\nHMARK Consultants$/);
});

test("a withdrawn student gets the other one", () => {
  const d = buildReengagementDraft("withdrawn", { full_name: "Kamran Aslam" }, "Usman", TEMPLATES);
  assert.equal(d.kind, "withdrawn");
  assert.match(d.subject, /If anything changes, Kamran/);
  assert.match(d.body, /sorry to hear/);
});

test("a registered student has no draft at all", () => {
  assert.equal(buildReengagementDraft("registered", { full_name: "Kamran" }, "Usman", TEMPLATES), null);
});

test("no stored wording means no draft, rather than an empty message to send", () => {
  assert.equal(buildReengagementDraft("ghost", { full_name: "Kamran" }, "Usman", null), null);
  assert.equal(
    buildReengagementDraft("ghost", { full_name: "Kamran" }, "Usman", { ...TEMPLATES, ghost_body: "   " }),
    null
  );
  assert.equal(
    buildReengagementDraft("ghost", { full_name: "Kamran" }, "Usman", { ...TEMPLATES, ghost_subject: "" }),
    null
  );
});

test("a Pakistani number becomes a wa.me link however it was typed", () => {
  for (const typed of ["0300-1234567", "03001234567", "+92 300 1234567", "92 300 1234567", "0300 123 4567"]) {
    const link = whatsappLink(typed, "hi");
    assert.equal(link, "https://wa.me/923001234567?text=hi", typed);
  }
});

test("a ten-digit number is assumed Pakistani", () => {
  assert.equal(whatsappLink("3001234567", "hi"), "https://wa.me/923001234567?text=hi");
});

test("a number it cannot make sense of yields no link rather than a wrong one", () => {
  for (const bad of ["", "   ", null, undefined, "123", "not a number", "0300-123", "0300123456789012"]) {
    assert.equal(whatsappLink(bad, "hi"), null, String(bad));
  }
});

test("the message is encoded, so a real one survives the URL", () => {
  const link = whatsappLink("03001234567", "Hello Kamran — are you there?\n\nUsman");
  assert.match(link, /\?text=Hello%20Kamran%20%E2%80%94/);
  assert.doesNotMatch(link, /\n/);
});
