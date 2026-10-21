import { test } from "node:test";
import assert from "node:assert/strict";
import { VISA_TYPES, VISA_TYPE_OTHER, isVisaType, visaTypeLabel, visaTypeShort } from "../src/lib/visaTypes.ts";

test("the dropdown ends in Other, and every value is unique", () => {
  assert.equal(VISA_TYPES[VISA_TYPES.length - 1].value, VISA_TYPE_OTHER);
  const values = VISA_TYPES.map((t) => t.value);
  assert.equal(new Set(values).size, values.length);
  // Every option carries both a label and the short word a document name uses.
  assert.ok(VISA_TYPES.every((t) => t.label && t.short));
});

test("isVisaType only accepts a value the dropdown offers", () => {
  assert.equal(isVisaType("student"), true);
  assert.equal(isVisaType(VISA_TYPE_OTHER), true);
  assert.equal(isVisaType("tourist"), true);
  assert.equal(isVisaType("visitor"), false);
  assert.equal(isVisaType(""), false);
  assert.equal(isVisaType(null), false);
  assert.equal(isVisaType(undefined), false);
});

test("the full label is the catalogue word, or the typed name for Other", () => {
  assert.equal(visaTypeLabel("student"), "Student");
  assert.equal(visaTypeLabel("tourist"), "Tourist / Visit");
  // Other shows what the student typed; a blank one falls back to the word "Other".
  assert.equal(visaTypeLabel(VISA_TYPE_OTHER, "Schengen C"), "Schengen C");
  assert.equal(visaTypeLabel(VISA_TYPE_OTHER, "  Working Holiday  "), "Working Holiday");
  assert.equal(visaTypeLabel(VISA_TYPE_OTHER, ""), "Other");
  assert.equal(visaTypeLabel(VISA_TYPE_OTHER, null), "Other");
  assert.equal(visaTypeLabel(null), null);
  assert.equal(visaTypeLabel(""), null);
});

test("the short word leads a document name, and is null when there is nothing usable to show", () => {
  assert.equal(visaTypeShort("student"), "Student");
  assert.equal(visaTypeShort("pilgrimage"), "Pilgrimage");
  // Other uses the typed name verbatim; a blank one gives nothing, so the name
  // falls back to its pre-visa-type wording rather than printing "Other visa".
  assert.equal(visaTypeShort(VISA_TYPE_OTHER, "Schengen C"), "Schengen C");
  assert.equal(visaTypeShort(VISA_TYPE_OTHER, "   "), null);
  assert.equal(visaTypeShort(VISA_TYPE_OTHER, null), null);
  assert.equal(visaTypeShort(null), null);
  assert.equal(visaTypeShort(""), null);
});
