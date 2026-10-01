// How the catalogue's free-text fields are read (0304): levels, yes/no, email
// lists, links, typed lists.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addressesIn,
  addressIn,
  emailParts,
  levelKey,
  levelsPresent,
  linkHref,
  normalizeEmails,
  normalizeLevel,
  parseYesNoText,
  splitTypedList,
  yesNoLabel,
} from "../src/lib/catalogueText.ts";

// ------------------------------------------------------------------ levels

test("the usual spellings of the three levels are the three, so students still match", () => {
  for (const l of ["Bachelors", "bachelor", "Bachelor's", "BSc", "Undergraduate", "Laurea triennale"]) assert.equal(normalizeLevel(l), "bachelors", l);
  for (const l of ["Masters", "Master", "Master’s degree", "MSc", "M.Sc.", "Laurea magistrale", "MBA"]) assert.equal(normalizeLevel(l), "masters", l);
  for (const l of ["PhD", "Ph.D.", "Doctorate", "Dottorato di ricerca"]) assert.equal(normalizeLevel(l), "phd", l);
});

test("any other level is kept as written, and compared without case", () => {
  assert.equal(normalizeLevel("  Foundation  year "), "Foundation year");
  assert.equal(normalizeLevel("Laurea magistrale a ciclo unico"), "Laurea magistrale a ciclo unico", "single-cycle is not a master's");
  assert.equal(normalizeLevel("Postgraduate"), "Postgraduate", "a master's or a doctorate: not guessed");
  assert.equal(normalizeLevel(""), null);
  assert.equal(levelKey("Foundation"), levelKey("FOUNDATION"));
  assert.equal(levelKey("Master's"), "masters");
});

test("the levels a list has: the three first, then the rest alphabetically, each once", () => {
  assert.deepEqual(levelsPresent(["Foundation", "phd", "bachelors", "foundation", "Diploma", null]), ["bachelors", "phd", "Diploma", "Foundation"]);
});

// ----------------------------------------------------------------- yes / no

test("yes and no in their usual forms, and words for anything else", () => {
  assert.equal(parseYesNoText("Yes"), "yes");
  assert.equal(parseYesNoText("n"), "no");
  assert.equal(parseYesNoText("FALSE"), "no");
  assert.equal(parseYesNoText(true), "yes", "the column held booleans before 0304");
  assert.equal(parseYesNoText("Only for  non-EU students"), "Only for non-EU students");
  assert.equal(parseYesNoText("  "), null);
  assert.equal(yesNoLabel("yes"), "Yes");
  assert.equal(yesNoLabel(false), "No");
  assert.equal(yesNoLabel("TOLC-I or SAT"), "TOLC-I or SAT");
  assert.equal(yesNoLabel(null), null);
});

// ------------------------------------------------------------------ emails

test("an email field is split on commas, semicolons and lines, and stored one way", () => {
  assert.deepEqual(emailParts("a@x.it;b@x.it,\n c@x.it"), ["a@x.it", "b@x.it", "c@x.it"]);
  assert.equal(normalizeEmails("a@x.it;b@x.it"), "a@x.it, b@x.it");
  assert.equal(normalizeEmails("  "), null);
  assert.equal(normalizeEmails("see the faculty page"), "see the faculty page", "words are kept, not refused");
});

test("only a real address becomes a mail link", () => {
  assert.equal(addressIn("a@x.it"), "a@x.it");
  assert.equal(addressIn("Prof. Rossi <rossi@unipv.it>"), "rossi@unipv.it");
  assert.equal(addressIn("Prof. Bianchi"), null);
  assert.equal(addressIn("a@b"), null, "no domain, no link");
  assert.deepEqual(addressesIn("a@x.it, see the faculty page, Prof. Rossi <rossi@unipv.it>"), ["a@x.it", "rossi@unipv.it"]);
});

// ------------------------------------------------------------------- links

test("a link field links only to http and https", () => {
  assert.equal(linkHref("https://www.unipv.it/en"), "https://www.unipv.it/en");
  assert.equal(linkHref("www.unipv.it"), "https://www.unipv.it", "no scheme would resolve against the portal");
  assert.equal(linkHref("unipv.it/admissions?x=1"), "https://unipv.it/admissions?x=1");
  assert.equal(linkHref("Apply at https://apply.unipv.it/, by March"), "https://apply.unipv.it/");
  // Never clickable: these are text.
  assert.equal(linkHref("javascript:alert(1)"), null);
  assert.equal(linkHref("JavaScript:alert(document.cookie)"), null);
  assert.equal(linkHref("data:text/html,<script>alert(1)</script>"), null);
  assert.equal(linkHref("see the faculty page"), null);
  assert.equal(linkHref("admissions@unipv.it"), null, "an address is not a web page");
  assert.equal(linkHref(""), null);
});

// ------------------------------------------------------------------- lists

test("a typed list splits on semicolons and lines, not commas", () => {
  assert.deepEqual(splitTypedList("Fall; Spring\nWinter"), ["Fall", "Spring", "Winter"]);
  assert.deepEqual(splitTypedList("Fall, from 2027"), ["Fall, from 2027"]);
  assert.deepEqual(splitTypedList(" ; "), []);
});
