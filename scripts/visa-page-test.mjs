import test from "node:test";
import assert from "node:assert/strict";
import { mergeVisaMessages, hasMessageOverride, sectionsFor, audienceLabel } from "../src/lib/visaPage.ts";

const SHARED = {
  approved_heading: "Your visa has been issued",
  approved_body: "Congratulations.",
  approved_signoff: "The HMARK team",
  refused_heading: "Not this time",
  refused_body: "We will talk you through it.",
  refused_signoff: "The HMARK team",
};

test("no override leaves the shared wording alone", () => {
  assert.deepEqual(mergeVisaMessages(SHARED, null), SHARED);
  assert.deepEqual(mergeVisaMessages(SHARED, {}), SHARED);
});

test("an override replaces one field and leaves the rest", () => {
  // The whole reason this is field by field: changing a heading must not
  // blank the body underneath it.
  const out = mergeVisaMessages(SHARED, { refused_heading: "The consulate said no" });
  assert.equal(out.refused_heading, "The consulate said no");
  assert.equal(out.refused_body, "We will talk you through it.");
  assert.equal(out.approved_heading, "Your visa has been issued");
});

test("clearing a box falls back rather than publishing an empty heading", () => {
  const out = mergeVisaMessages(SHARED, { refused_heading: "   " });
  assert.equal(out.refused_heading, "Not this time");
});

test("an override on a database with no shared wording still works", () => {
  const out = mergeVisaMessages(null, { approved_heading: "Done" });
  assert.equal(out.approved_heading, "Done");
  assert.equal(out.approved_body, null);
});

test("nothing anywhere is null, not an object of nulls", () => {
  assert.equal(mergeVisaMessages(null, null), null);
});

test("an override is only an override if it says something", () => {
  assert.equal(hasMessageOverride(null), false);
  assert.equal(hasMessageOverride({}), false);
  assert.equal(hasMessageOverride({ approved_heading: "  " }), false);
  assert.equal(hasMessageOverride({ approved_heading: "Yes" }), true);
});

// ------------------------------------------------------------- sections
const s = (p) => ({
  id: p.title, destinationId: null, title: "T", body: null, linkLabel: null, linkUrl: null,
  audience: "both", sortOrder: 0, status: "active", ...p,
});

test("a student never sees a section written for staff", () => {
  const out = sectionsFor(
    [s({ title: "For staff", audience: "staff" }), s({ title: "For all", audience: "both" })],
    "it",
    "student"
  );
  assert.deepEqual(out.map((x) => x.title), ["For all"]);
});

test("staff see their own and the shared ones, but not student-only", () => {
  const out = sectionsFor(
    [s({ title: "Staff note", audience: "staff" }), s({ title: "Student tip", audience: "student" }), s({ title: "Both" })],
    "it",
    "staff"
  );
  assert.deepEqual(out.map((x) => x.title).sort(), ["Both", "Staff note"]);
});

test("a country only sees its own sections and the shared ones", () => {
  const out = sectionsFor(
    [
      s({ title: "Everywhere", destinationId: null }),
      s({ title: "Italy", destinationId: "it" }),
      s({ title: "Germany", destinationId: "de" }),
    ],
    "it",
    "student"
  );
  assert.deepEqual(out.map((x) => x.title), ["Everywhere", "Italy"]);
});

test("shared sections come before the country's own", () => {
  // The order they are read in: the general rule, then "and for Italy".
  const out = sectionsFor(
    [s({ title: "Italy rule", destinationId: "it", sortOrder: 0 }), s({ title: "General", destinationId: null, sortOrder: 99 })],
    "it",
    "student"
  );
  assert.deepEqual(out.map((x) => x.title), ["General", "Italy rule"]);
});

test("within a group the chosen order wins, then the title", () => {
  const out = sectionsFor(
    [
      s({ title: "B", destinationId: "it", sortOrder: 0 }),
      s({ title: "A", destinationId: "it", sortOrder: 0 }),
      s({ title: "First", destinationId: "it", sortOrder: -10 }),
    ],
    "it",
    "student"
  );
  assert.deepEqual(out.map((x) => x.title), ["First", "A", "B"]);
});

test("a hidden section is shown to nobody", () => {
  const out = sectionsFor([s({ title: "Draft", status: "hidden" })], "it", "staff");
  assert.deepEqual(out, []);
});

test("a student with no country still gets the shared sections", () => {
  const out = sectionsFor([s({ title: "Everywhere", destinationId: null })], null, "student");
  assert.deepEqual(out.map((x) => x.title), ["Everywhere"]);
});

test("audiences read as English in the builder", () => {
  assert.equal(audienceLabel("both"), "Student and staff");
  assert.equal(audienceLabel("student"), "Student only");
  assert.equal(audienceLabel("staff"), "Staff only");
});
