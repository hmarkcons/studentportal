// Unit tests for the profile checklist and the passport expiry check.
//
// Worth a permanent test on two counts. The checklist count is shown in two
// places — the Profile page and the dashboard — and they must never disagree.
// And the passport check drives a warning that tells a student their visa
// cannot be filed, which is the wrong thing to say by accident in either
// direction.
//
// Usage:
//   npm run test:unit

import test from "node:test";
import assert from "node:assert/strict";
import {
  profileChecklist,
  countMissing,
  passportStatus,
  PASSPORT_MIN_MONTHS,
} from "../src/lib/profileCompleteness.ts";

const isoIn = (days) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const COMPLETE = {
  contact_number: "0300-1234567",
  date_of_birth: "2004-05-01",
  address: "Clifton, Karachi",
  emergency_contact_name: "A Parent",
  emergency_contact_number: "0300-7654321",
  passport_number: "AB1234567",
  passport_expiry: isoIn(900),
  cnic: "42101-1234567-1",
  financial_sponsor_name: "A Parent",
  financial_sponsor_relation: "Father",
  financial_details: { sponsor_contact_number: "0300-7654321" },
};

test("a fully filled profile has nothing missing", () => {
  assert.equal(countMissing(profileChecklist(COMPLETE)), 0);
});

test("an empty profile reports every field", () => {
  const checks = profileChecklist({});
  assert.equal(countMissing(checks), checks.length);
  assert.ok(checks.length >= 11, `expected the full checklist, got ${checks.length}`);
});

test("counts each blank field once", () => {
  const missing = countMissing(profileChecklist({ ...COMPLETE, cnic: null, address: null }));
  assert.equal(missing, 2);
});

test("treats whitespace as blank", () => {
  // A field holding " " looks filled to a NOT NULL check but is not an answer.
  assert.equal(countMissing(profileChecklist({ ...COMPLETE, passport_number: "   " })), 1);
  assert.equal(countMissing(profileChecklist({ ...COMPLETE, address: "" })), 1);
});

test("reads the sponsor number out of the nested financial_details", () => {
  assert.equal(countMissing(profileChecklist({ ...COMPLETE, financial_details: {} })), 1);
  assert.equal(countMissing(profileChecklist({ ...COMPLETE, financial_details: null })), 1);
});

test("groups every check into a section the page renders", () => {
  const groups = new Set(profileChecklist({}).map((c) => c.group));
  assert.deepEqual([...groups].sort(), ["passport", "personal", "sponsor"]);
});

test("passport with no date recorded is missing, not expired", () => {
  for (const value of [null, undefined, "", "   ", "not-a-date", "01/05/2030"]) {
    const s = passportStatus(value);
    assert.equal(s.state, "missing", JSON.stringify(value));
    assert.equal(s.daysLeft, null);
  }
});

test("a passport in the past is expired", () => {
  const s = passportStatus(isoIn(-1));
  assert.equal(s.state, "expired");
  assert.ok(s.daysLeft < 0);
});

test("a passport inside the six-month window is expiring", () => {
  assert.equal(passportStatus(isoIn(30)).state, "expiring");
  assert.equal(passportStatus(isoIn(PASSPORT_MIN_MONTHS * 30 - 1)).state, "expiring");
});

test("a passport comfortably beyond the window is fine", () => {
  assert.equal(passportStatus(isoIn(PASSPORT_MIN_MONTHS * 30 + 5)).state, "ok");
  assert.equal(passportStatus(isoIn(3650)).state, "ok");
});

test("today is expiring, not expired", () => {
  // A passport valid until today has not expired yet, and saying it has would
  // be telling a student their application is dead when it is not.
  const s = passportStatus(isoIn(0));
  assert.equal(s.state, "expiring");
  assert.equal(s.daysLeft, 0);
});
