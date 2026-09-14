import test from "node:test";
import assert from "node:assert/strict";
import {
  templateDestination,
  agreementTemplateChoices,
  templateNotForStudentError,
} from "../src/lib/agreementTemplateChoices.ts";

const ITALY = { id: "d-it", display_name: "Italy (Public)" };
const GERMANY = { id: "d-de", display_name: "Germany (Public)" };
const TURKEY = { id: "d-tr", display_name: "Turkey (Private)" };
const GOTHAM = { id: "d-gc", display_name: "Gotham City" };

const t = (id, name, destination) => ({ id, name, destination });
const ALL = [
  t("t-it", "Standard", ITALY),
  t("t-de", "Standard", GERMANY),
  t("t-gc", "GC Agreement", GOTHAM),
  t("t-gc2", "Nubela", GOTHAM),
  t("t-none", "Orphan", null),
];

test("an embedded destination is read as an object or a single-element array", () => {
  assert.deepEqual(templateDestination(ITALY), ITALY);
  assert.deepEqual(templateDestination([ITALY]), ITALY);
  assert.equal(templateDestination(null), null);
  assert.equal(templateDestination([]), null);
});

test("only the student's own country is offered", () => {
  const c = agreementTemplateChoices(ALL, [{ ...ITALY, isBackup: false }]);
  assert.deepEqual(c.available.map((x) => x.id), ["t-it"]);
  assert.equal(c.hasCountry, true);
  assert.deepEqual(c.missingTemplateFor, []);
});

test("backup countries count too — the student registered for those as well", () => {
  const c = agreementTemplateChoices(ALL, [
    { ...ITALY, isBackup: false },
    { ...GERMANY, isBackup: true },
  ]);
  assert.deepEqual(c.available.map((x) => x.id), ["t-it", "t-de"]);
});

test("the primary country comes first, whatever order it was given in", () => {
  const c = agreementTemplateChoices(ALL, [
    { ...GERMANY, isBackup: true },
    { ...ITALY, isBackup: false },
  ]);
  assert.deepEqual(c.available.map((x) => x.id), ["t-it", "t-de"]);
});

test("every template for a country is offered, not just the first", () => {
  const c = agreementTemplateChoices(ALL, [{ ...GOTHAM, isBackup: false }]);
  assert.deepEqual(c.available.map((x) => x.id), ["t-gc", "t-gc2"]);
});

test("a template for somebody else's country is never offered", () => {
  const c = agreementTemplateChoices(ALL, [{ ...ITALY, isBackup: false }]);
  assert.ok(!c.available.some((x) => x.id === "t-de"));
  assert.ok(!c.available.some((x) => x.id === "t-gc"));
});

test("a template with no country at all is never offered", () => {
  const c = agreementTemplateChoices(ALL, [{ ...ITALY, isBackup: false }]);
  assert.ok(!c.available.some((x) => x.id === "t-none"));
});

test("a student with no country gets nothing, and is reported as such", () => {
  const c = agreementTemplateChoices(ALL, []);
  assert.deepEqual(c.available, []);
  assert.equal(c.hasCountry, false);
  assert.deepEqual(c.missingTemplateFor, []);
});

test("a registered country nobody has written a template for is named", () => {
  const c = agreementTemplateChoices(ALL, [
    { ...ITALY, isBackup: false },
    { ...TURKEY, isBackup: true },
  ]);
  assert.deepEqual(c.available.map((x) => x.id), ["t-it"]);
  assert.deepEqual(c.missingTemplateFor, ["Turkey (Private)"]);
  // Which is a different problem from having no country at all.
  assert.equal(c.hasCountry, true);
});

test("no templates in the system at all is reported per country", () => {
  const c = agreementTemplateChoices([], [{ ...ITALY, isBackup: false }, { ...GERMANY, isBackup: true }]);
  assert.deepEqual(c.available, []);
  assert.deepEqual(c.missingTemplateFor, ["Italy (Public)", "Germany (Public)"]);
  assert.equal(c.hasCountry, true);
});

// ------------------------------------------------------- the server-side rule

test("a template for one of their countries is allowed", () => {
  assert.equal(templateNotForStudentError("d-it", ["d-it", "d-de"]), null);
  assert.equal(templateNotForStudentError("d-de", ["d-it", "d-de"]), null);
});

test("a template for another country is refused, and says how to fix it", () => {
  const err = templateNotForStudentError("d-gc", ["d-it"]);
  assert.match(err, /not registered for/);
  assert.match(err, /Add the country to their registration first/);
});

test("a student with no country is told that, not that the template is wrong", () => {
  const err = templateNotForStudentError("d-it", []);
  assert.match(err, /no country on their registration/);
  assert.match(err, /Registration card/);
  assert.doesNotMatch(err, /not registered for/);
});

test("a template with no country of its own is refused separately", () => {
  for (const missing of [null, undefined, ""]) {
    const err = templateNotForStudentError(missing, ["d-it"]);
    assert.match(err, /has no country set/, String(missing));
    assert.match(err, /Setup › Agreement templates/, String(missing));
  }
});

test("the refusal never blames the staff member", () => {
  for (const err of [
    templateNotForStudentError("d-gc", ["d-it"]),
    templateNotForStudentError("d-it", []),
    templateNotForStudentError(null, ["d-it"]),
  ]) {
    assert.doesNotMatch(err, /invalid|error|forbidden/i, err);
  }
});
