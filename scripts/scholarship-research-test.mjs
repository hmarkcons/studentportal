import test from "node:test";
import assert from "node:assert/strict";
import { fingerprint, PROPOSABLE_FIELDS } from "../src/lib/scholarshipResearch.ts";

test("the same reading fingerprints the same, whatever order it came back in", () => {
  // Search results do not come back in a stable order, and a re-ordering that
  // looked like a change would propose the same call over and over.
  const a = fingerprint(["https://dsu.toscana.it/bando", "https://dsu.toscana.it/", "2026/2027"]);
  const b = fingerprint(["2026/2027", "https://dsu.toscana.it/", "https://dsu.toscana.it/bando"]);
  assert.equal(a, b);
});

test("whitespace is not a change", () => {
  assert.equal(fingerprint(["7 September 2026,  13:00"]), fingerprint([" 7 September 2026, 13:00 "]));
  assert.equal(fingerprint(["a\nb"]), fingerprint(["a b"]));
});

test("a real difference fingerprints differently", () => {
  assert.notEqual(fingerprint(["7 September 2026"]), fingerprint(["8 September 2026"]));
  assert.notEqual(fingerprint(["2026/2027"]), fingerprint(["2027/2028"]));
});

test("missing parts are skipped rather than hashed as empty", () => {
  assert.equal(fingerprint(["x", null, undefined, ""]), fingerprint(["x"]));
});

test("the fingerprint is short enough to store and long enough not to collide", () => {
  const f = fingerprint(["anything"]);
  assert.equal(f.length, 32);
  assert.match(f, /^[0-9a-f]{32}$/);
});

test("a run can only ever propose fields the reviewer knows about", () => {
  // The apply path re-derives its patch from this list, so anything not here
  // cannot be written by a run even if it somehow reached the proposal.
  assert.ok(!PROPOSABLE_FIELDS.includes("id"));
  assert.ok(!PROPOSABLE_FIELDS.includes("call_status"));
  assert.ok(!PROPOSABLE_FIELDS.includes("guide_updated_by"));
  for (const f of ["academic_year", "application_deadline", "guide_sections", "covers"]) {
    assert.ok(PROPOSABLE_FIELDS.includes(f), f);
  }
});
