// A student's signed agreements, and which is in force (src/lib/studentAgreements.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { signedAgreementGroups } from "../src/lib/studentAgreements.ts";

const row = (id, over = {}) => ({
  id,
  status: "signed",
  created_at: "2026-09-01T10:00:00Z",
  signed_file_uploaded_at: null,
  country: "Italy (Public)",
  is_backup: false,
  ...over,
});

test("only signed agreements are shown", () => {
  const groups = signedAgreementGroups([row("a", { status: "draft" }), row("b", { status: "pending_signature" }), row("c")]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].versions.map((v) => v.id), ["c"]);
});

test("a corrected agreement is the one in force, and says which it replaces", () => {
  const [italy] = signedAgreementGroups([
    row("first", { created_at: "2026-08-01T10:00:00Z", signed_file_uploaded_at: "2026-08-03T09:00:00Z" }),
    row("corrected", { created_at: "2026-09-10T10:00:00Z", signed_file_uploaded_at: "2026-09-12T09:00:00Z" }),
  ]);
  const [newest, older] = italy.versions;
  assert.equal(newest.id, "corrected");
  assert.equal(newest.current, true);
  assert.deepEqual([newest.number, newest.of], [2, 2]);
  assert.deepEqual(newest.replaces, { number: 1, signedOn: "2026-08-03" });
  assert.equal(older.current, false);
  assert.deepEqual(older.replacedBy, { number: 2, signedOn: "2026-09-12" });
});

test("a single signed agreement replaces nothing", () => {
  const [g] = signedAgreementGroups([row("only")]);
  assert.equal(g.versions[0].replaces, null);
  assert.equal(g.versions[0].replacedBy, null);
  assert.equal(g.versions[0].of, 1);
});

test("a backup country's agreement is its own, never a correction — and comes after the main one", () => {
  const groups = signedAgreementGroups([
    row("italy-backup", { country: "Italy (Public)", is_backup: true, created_at: "2026-09-20T10:00:00Z" }),
    row("france", { country: "France (Public)" }),
  ]);
  assert.deepEqual(groups.map((g) => [g.country, g.backup]), [["France (Public)", false], ["Italy (Public)", true]]);
  assert.ok(groups.every((g) => g.versions.length === 1 && g.versions[0].current));
});

test("the signing date is when it was signed, else when it was made", () => {
  const [g] = signedAgreementGroups([row("x", { created_at: "2026-09-01T10:00:00Z", signed_file_uploaded_at: null })]);
  assert.equal(g.versions[0].signedOn, "2026-09-01");
});
