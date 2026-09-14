import test from "node:test";
import assert from "node:assert/strict";
import {
  SCHOLARSHIP_PORTAL_PREFIX,
  scholarshipPortalType,
  scholarshipPortalLabel,
  scholarshipPortals,
  portalLabelError,
} from "../src/lib/scholarshipPortal.ts";

test("a portal name becomes a prefixed credential type", () => {
  assert.equal(scholarshipPortalType("DSU Toscana"), "scholarship_portal:DSU Toscana");
  assert.equal(scholarshipPortalType("  Universitaly  "), "scholarship_portal:Universitaly");
});

test("and reads back as its name", () => {
  assert.equal(scholarshipPortalLabel("scholarship_portal:DSU Toscana"), "DSU Toscana");
});

test("a credential that is not a scholarship portal is not mistaken for one", () => {
  // The visa login and this portal's own password must never be listed here,
  // and portal_login especially must not be offered for editing.
  for (const other of ["visa_appointment_portal", "portal_login", "vfs_login", "", "scholarship", "scholarshipportal:x"]) {
    assert.equal(scholarshipPortalLabel(other), null, other);
  }
});

test("a prefix with nothing after it is not a portal", () => {
  assert.equal(scholarshipPortalLabel(SCHOLARSHIP_PORTAL_PREFIX), null);
  assert.equal(scholarshipPortalLabel(`${SCHOLARSHIP_PORTAL_PREFIX}   `), null);
});

test("the portals are picked out of everything stored for the student", () => {
  const portals = scholarshipPortals([
    "portal_login",
    "scholarship_portal:Universitaly",
    "visa_appointment_portal",
    "scholarship_portal:DSU Toscana",
  ]);
  assert.deepEqual(portals.map((p) => p.label), ["DSU Toscana", "Universitaly"]);
  assert.equal(portals[0].credentialType, "scholarship_portal:DSU Toscana");
});

test("with none stored, there are none", () => {
  assert.deepEqual(scholarshipPortals([]), []);
  assert.deepEqual(scholarshipPortals(["portal_login", "visa_appointment_portal"]), []);
});

test("a portal needs a name", () => {
  for (const blank of ["", "   "]) {
    assert.match(portalLabelError(blank, []), /Give the portal a name/, JSON.stringify(blank));
  }
});

test("a colon is refused, because it is what delimits the prefix", () => {
  assert.match(portalLabelError("DSU: Toscana", []), /cannot contain a colon/);
});

test("an absurd name is refused", () => {
  assert.match(portalLabelError("x".repeat(61), []), /too long/);
  assert.equal(portalLabelError("x".repeat(60), []), null);
});

test("the same portal cannot be added twice, whatever the casing", () => {
  const err = portalLabelError("dsu toscana", ["DSU Toscana"]);
  assert.match(err, /already a portal called dsu toscana/);
  assert.match(err, /Edit that one instead/);
});

test("a genuinely different portal is allowed alongside", () => {
  assert.equal(portalLabelError("Universitaly", ["DSU Toscana"]), null);
});

test("surrounding spaces do not create a near-duplicate", () => {
  assert.match(portalLabelError("  DSU Toscana  ", ["DSU Toscana"]), /already a portal/);
});
