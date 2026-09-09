import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SCHOLARSHIP_STATUSES,
  SCHOLARSHIP_STATUS_LABELS,
  SCHOLARSHIP_STATUS_TONE,
  isScholarshipStatus,
  scholarshipStatusLabel,
  scholarshipIdentityError,
  SCHOLARSHIP_COUNTRY_CODE,
} from "../src/lib/scholarships.ts";

test("the statuses match the database CHECK constraint exactly", () => {
  // student_scholarships.status allows these five and nothing else. If the two
  // lists drift, a status the picker offers fails on save with a database
  // error nobody can act on.
  assert.deepEqual([...SCHOLARSHIP_STATUSES].sort(), ["accepted", "modification", "pending", "rejected", "submitted"]);
});

test("every status has a label and a tone", () => {
  for (const s of SCHOLARSHIP_STATUSES) {
    assert.ok(SCHOLARSHIP_STATUS_LABELS[s], `no label for ${s}`);
    assert.ok(SCHOLARSHIP_STATUS_TONE[s], `no tone for ${s}`);
  }
});

test("labels are written for a reader, not lifted from the enum", () => {
  assert.equal(SCHOLARSHIP_STATUS_LABELS.modification, "Modification requested");
  for (const s of SCHOLARSHIP_STATUSES) {
    assert.notEqual(SCHOLARSHIP_STATUS_LABELS[s], s, `${s} is still shown raw`);
  }
});

test("an accepted award reads as success and a rejection as danger", () => {
  assert.equal(SCHOLARSHIP_STATUS_TONE.accepted, "success");
  assert.equal(SCHOLARSHIP_STATUS_TONE.rejected, "danger");
});

test("a status outside the list is refused", () => {
  for (const bad of ["approved", "SUBMITTED", "", "withdrawn", "awarded"]) {
    assert.equal(isScholarshipStatus(bad), false, bad);
  }
  for (const good of SCHOLARSHIP_STATUSES) assert.equal(isScholarshipStatus(good), true, good);
});

test("an unknown status still renders rather than disappearing", () => {
  // Anything already in the database from before validation existed.
  assert.equal(scholarshipStatusLabel("legacy_value"), "legacy_value");
  assert.equal(scholarshipStatusLabel("accepted"), "Accepted");
});

test("a scholarship must be identifiable by a body or a name", () => {
  assert.match(scholarshipIdentityError(null, null) ?? "", /body or give the scholarship a name/);
  assert.match(scholarshipIdentityError("   ", null) ?? "", /body or give the scholarship a name/);
});

test("either one alone is enough", () => {
  assert.equal(scholarshipIdentityError("ER.GO top-up", null), null);
  assert.equal(scholarshipIdentityError(null, "some-body-uuid"), null);
  assert.equal(scholarshipIdentityError("ER.GO top-up", "some-body-uuid"), null);
});

test("the Italy scope is a named constant, so it can be found", () => {
  assert.equal(SCHOLARSHIP_COUNTRY_CODE, "IT");
});
