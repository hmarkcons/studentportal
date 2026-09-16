import test from "node:test";
import assert from "node:assert/strict";
import {
  needsTranslation,
  translatablePayload,
  applyTranslation,
  TRANSLATABLE_FIELDS,
} from "../src/lib/translatable.ts";

// ------------------------------------------------------- when to bother
test("plain English is left alone", () => {
  assert.equal(
    needsTranslation({
      region: "Tuscany",
      application_deadline: "7 September 2026, 13:00",
      stipend_amount: "Up to EUR 3,150/yr housing contribution",
    }),
    false
  );
});

test("an accented character is enough to ask", () => {
  assert.equal(needsTranslation({ region: "Provence-Alpes-Côte d'Azur" }), true);
  assert.equal(needsTranslation({ benefits: "Ösztöndíj és szállás" }), true);
});

test("an Italian deadline is caught even in plain ASCII", () => {
  // The case that matters: a bando copied verbatim, no accents in sight.
  assert.equal(needsTranslation({ application_deadline: "scadenza 7 settembre 2026" }), true);
  assert.equal(needsTranslation({ call_notes: "Bando di concorso per borsa di studio" }), true);
});

test("a proper noun on its own is not mistaken for a foreign sentence", () => {
  // "Toscana" and "Sorbonne" are names and stay as they are; a marker list
  // containing them would ask for a translation of every Italian body's title.
  assert.equal(needsTranslation({ region: "Toscana" }), false);
  assert.equal(needsTranslation({ region: "Lombardy" }), false);
});

test("guide sections are searched too, not just the short fields", () => {
  assert.equal(
    needsTranslation({
      region: "Lazio",
      guide_sections: [{ title: "Scadenze", body: "La domanda va presentata entro il 7 settembre." }],
    }),
    true
  );
});

test("nothing at all does not trigger a call", () => {
  assert.equal(needsTranslation({}), false);
  assert.equal(needsTranslation({ region: "", benefits: null, guide_sections: [] }), false);
});

// ------------------------------------------------------- what gets sent
test("only prose is sent, not URLs or ids", () => {
  const payload = translatablePayload({
    region: "Toscana",
    source_url: "https://dsu.toscana.it",
    id: "abc",
    covers: ["Pisa"],
    guide_sections: [{ title: "T", body: "B" }],
  });
  assert.deepEqual(Object.keys(payload).sort(), ["guide_sections", "region"]);
});

test("empty fields are not sent", () => {
  const payload = translatablePayload({ region: "   ", benefits: "Free meals" });
  assert.deepEqual(Object.keys(payload), ["benefits"]);
});

// ------------------------------------------- laying the translation over
test("a translated field replaces the original", () => {
  const { values, changed } = applyTranslation(
    { region: "Toscana", application_deadline: "scadenza 7 settembre" },
    { application_deadline: "deadline 7 September" }
  );
  assert.equal(values.application_deadline, "deadline 7 September");
  assert.equal(values.region, "Toscana", "a field not returned is untouched");
  assert.deepEqual(changed, ["application_deadline"]);
});

test("no translation at all changes nothing", () => {
  const original = { region: "Toscana", benefits: "Free meals" };
  const { values, changed } = applyTranslation(original, null);
  assert.deepEqual(values, original);
  assert.deepEqual(changed, []);
});

test("a blank answer never blanks a real value", () => {
  // The failure that would matter: the model returns "" and a deadline is lost.
  const { values, changed } = applyTranslation(
    { application_deadline: "scadenza 7 settembre" },
    { application_deadline: "   " }
  );
  assert.equal(values.application_deadline, "scadenza 7 settembre");
  assert.deepEqual(changed, []);
});

test("a wrong-typed answer is ignored", () => {
  const { values } = applyTranslation({ benefits: "Pasti gratuiti" }, { benefits: 42 });
  assert.equal(values.benefits, "Pasti gratuiti");
});

test("guide sections are replaced only when the count matches", () => {
  const original = {
    guide_sections: [
      { title: "Scadenze", body: "Entro il 7 settembre." },
      { title: "Requisiti", body: "ISEE sotto 27.000 euro." },
    ],
  };
  // The model dropped one. Rather than silently losing a section, keep both.
  const short = applyTranslation(original, { guide_sections: [{ title: "Deadlines", body: "By 7 September." }] });
  assert.deepEqual(short.values.guide_sections, original.guide_sections);
  assert.deepEqual(short.changed, []);

  const full = applyTranslation(original, {
    guide_sections: [
      { title: "Deadlines", body: "By 7 September." },
      { title: "Requirements", body: "ISEE below EUR 27,000." },
    ],
  });
  assert.equal(full.values.guide_sections[0].title, "Deadlines");
  assert.equal(full.values.guide_sections[1].body, "ISEE below EUR 27,000.");
  assert.deepEqual(full.changed, ["guide_sections"]);
});

test("a section the model left blank keeps its original text", () => {
  const original = { guide_sections: [{ title: "Scadenze", body: "Entro il 7 settembre." }] };
  const { values } = applyTranslation(original, { guide_sections: [{ title: "Deadlines", body: "" }] });
  assert.equal(values.guide_sections[0].title, "Deadlines");
  assert.equal(values.guide_sections[0].body, "Entro il 7 settembre.", "the body was not dropped");
});

test("extra keys on a section survive translation", () => {
  // Nothing else uses them today, but dropping unknown keys is how a schema
  // change quietly loses data later.
  const original = { guide_sections: [{ title: "A", body: "B", pinned: true }] };
  const { values } = applyTranslation(original, { guide_sections: [{ title: "A2", body: "B2" }] });
  assert.equal(values.guide_sections[0].pinned, true);
});

test("every translatable field is a real scholarship_bodies column", () => {
  // Guards against a rename leaving this list pointing at nothing.
  const known = [
    "region", "application_deadline", "document_upload_deadline", "courier_deadline",
    "isee_threshold", "ispe_threshold", "stipend_amount", "benefits", "call_notes",
  ];
  assert.deepEqual([...TRANSLATABLE_FIELDS].sort(), known.sort());
});
