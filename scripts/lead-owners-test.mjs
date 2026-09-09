import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLeadOwners, ownerKey, karachiMonthKey, recentMonths, UNASSIGNED_ID } from "../src/lib/leadOwners.ts";

// Shaped like the live data: 2 active counselors, and leads also held by
// management, super_admin and digital_marketing staff, plus some unassigned.
const STAFF = [
  { id: "c1", full_name: "Muhammad Usman", role: "counselor", status: "active", monthly_target: "15.00" },
  { id: "c2", full_name: "Sohaib Ur Rehman", role: "counselor", status: "active", monthly_target: "5.00" },
  { id: "m1", full_name: "A Manager", role: "management", status: "active", monthly_target: null },
  { id: "sa", full_name: "Abdul Hadi", role: "super_admin", status: "active", monthly_target: null },
  { id: "dm", full_name: "A Marketer", role: "digital_marketing", status: "active", monthly_target: null },
  { id: "gone", full_name: "Left Last Month", role: "counselor", status: "deactivated", monthly_target: "5.00" },
  { id: "new", full_name: "Just Joined", role: "counselor", status: "active", monthly_target: "5.00" },
];

const LEADS = [
  { assigned_counselor_id: "c1", registered_at: "2026-09-01T10:00:00Z" },
  { assigned_counselor_id: "c1", registered_at: null },
  { assigned_counselor_id: "m1", registered_at: "2026-09-02T10:00:00Z" },
  { assigned_counselor_id: "m1", registered_at: "2026-09-03T10:00:00Z" },
  { assigned_counselor_id: "sa", registered_at: "2026-09-04T10:00:00Z" },
  { assigned_counselor_id: "dm", registered_at: "2026-09-05T10:00:00Z" },
  { assigned_counselor_id: "gone", registered_at: "2026-08-20T10:00:00Z" },
  { assigned_counselor_id: null, registered_at: null },
  { assigned_counselor_id: null, registered_at: null },
];

test("everyone holding a lead appears, not just staff with role=counselor", () => {
  const ids = buildLeadOwners(STAFF, LEADS).map((o) => o.id);
  for (const id of ["c1", "m1", "sa", "dm", "gone"]) assert.ok(ids.includes(id), `${id} missing`);
});

test("every lead is accounted for by exactly one row", () => {
  // The bug this replaces lost 12 of 22 leads with no sign that it had.
  const owners = buildLeadOwners(STAFF, LEADS);
  const ids = new Set(owners.map((o) => o.id));
  const counted = LEADS.filter((l) => ids.has(ownerKey(l))).length;
  assert.equal(counted, LEADS.length);
});

test("unassigned leads get their own row, listed last", () => {
  const owners = buildLeadOwners(STAFF, LEADS);
  assert.equal(owners.at(-1).id, UNASSIGNED_ID);
  assert.equal(owners.at(-1).isUnassigned, true);
});

test("no unassigned row when every lead is assigned", () => {
  const owners = buildLeadOwners(STAFF, [{ assigned_counselor_id: "c1", registered_at: null }]);
  assert.ok(!owners.some((o) => o.isUnassigned));
});

test("a non-counselor holding leads is flagged as such", () => {
  const owners = buildLeadOwners(STAFF, LEADS);
  assert.equal(owners.find((o) => o.id === "m1").isOtherRole, true);
  assert.equal(owners.find((o) => o.id === "c1").isOtherRole, false);
});

test("a deactivated staff member keeps their history and is flagged inactive", () => {
  const owners = buildLeadOwners(STAFF, LEADS);
  const gone = owners.find((o) => o.id === "gone");
  assert.ok(gone, "dropping them would delete last month's registrations from the totals");
  assert.equal(gone.isInactive, true);
});

test("an active counselor with no leads yet still appears", () => {
  const owners = buildLeadOwners(STAFF, LEADS);
  assert.ok(owners.some((o) => o.id === "new"));
});

test("an inactive counselor with no leads does not clutter the table", () => {
  const owners = buildLeadOwners(
    [{ id: "x", full_name: "Nobody", role: "counselor", status: "deactivated" }],
    []
  );
  assert.deepEqual(owners, []);
});

test("a lead pointing at a staff row that no longer exists is still counted", () => {
  const owners = buildLeadOwners([], [{ assigned_counselor_id: "ghost", registered_at: "2026-09-01T10:00:00Z" }]);
  assert.equal(owners.length, 1);
  assert.equal(owners[0].name, "Former staff member");
  assert.equal(owners[0].isInactive, true);
});

test("rows are ordered by registrations, then leads held, then name", () => {
  const owners = buildLeadOwners(STAFF, LEADS).filter((o) => !o.isUnassigned);
  assert.equal(owners[0].id, "m1", "two registrations should lead");
});

test("each staff member's own monthly target is carried, not a fixed one", () => {
  const owners = buildLeadOwners(STAFF, LEADS);
  assert.equal(owners.find((o) => o.id === "c1").monthlyTarget, 15);
  assert.equal(owners.find((o) => o.id === "c2").monthlyTarget, 5);
  assert.equal(owners.find((o) => o.id === "m1").monthlyTarget, null);
});

test("a zero or blank target reads as unset rather than a target of zero", () => {
  const owners = buildLeadOwners(
    [{ id: "z", full_name: "Z", role: "counselor", status: "active", monthly_target: 0 }],
    [{ assigned_counselor_id: "z", registered_at: null }]
  );
  assert.equal(owners[0].monthlyTarget, null);
});

test("a registration just after midnight in Karachi counts in the Karachi month", () => {
  // 2026-09-01 01:00 PKT is 2026-08-31 20:00 UTC. Bucketing on the server's
  // UTC clock filed it under August.
  assert.equal(karachiMonthKey("2026-08-31T20:00:00Z"), "2026-09");
  // ...and the last moment of August in Karachi stays in August.
  assert.equal(karachiMonthKey("2026-08-31T18:59:00Z"), "2026-08");
});

test("karachiMonthKey survives a bad timestamp", () => {
  assert.equal(karachiMonthKey("not a date"), "");
});

test("recentMonths ends on the current Karachi month, oldest first", () => {
  const months = recentMonths(6, new Date("2026-09-09T12:00:00Z"));
  assert.equal(months.length, 6);
  assert.deepEqual(months.map((m) => m.key), ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
  assert.equal(months.at(-1).label, "Sep 26");
});

test("recentMonths crosses a year boundary correctly", () => {
  const months = recentMonths(4, new Date("2026-02-15T12:00:00Z"));
  assert.deepEqual(months.map((m) => m.key), ["2025-11", "2025-12", "2026-01", "2026-02"]);
});

test("recentMonths uses the Karachi month, not the server's", () => {
  // 2026-10-01 02:00 PKT is still 2026-09-30 in UTC.
  const months = recentMonths(1, new Date("2026-09-30T21:00:00Z"));
  assert.equal(months[0].key, "2026-10");
});
