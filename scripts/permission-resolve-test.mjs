import { test } from "node:test";
import assert from "node:assert/strict";
import { holdsPermission } from "../src/lib/permissionResolve.ts";

const definition = { key: "leave.approve", default_roles: ["management", "super_admin"] };
const none = { definition, roleOverrides: [], staffOverrides: [] };

test("the default roles hold it", () => {
  assert.equal(holdsPermission({ id: "a", roles: ["management"] }, "leave.approve", none), true);
  assert.equal(holdsPermission({ id: "b", roles: ["counselor"] }, "leave.approve", none), false);
});

test("a Super Admin always holds it, whatever the overrides say", () => {
  const denied = { ...none, staffOverrides: [{ staff_id: "s", permission_key: "leave.approve", allowed: false }] };
  assert.equal(holdsPermission({ id: "s", roles: ["super_admin"] }, "leave.approve", denied), true);
});

test("a role override replaces the default for that role", () => {
  const tables = { ...none, roleOverrides: [{ role: "management", permission_key: "leave.approve", allowed: false }, { role: "processing", permission_key: "leave.approve", allowed: true }] };
  assert.equal(holdsPermission({ id: "a", roles: ["management"] }, "leave.approve", tables), false);
  assert.equal(holdsPermission({ id: "b", roles: ["processing"] }, "leave.approve", tables), true);
});

test("any role that allows it wins — adding a role never takes access away", () => {
  const tables = { ...none, roleOverrides: [{ role: "counselor", permission_key: "leave.approve", allowed: false }] };
  assert.equal(holdsPermission({ id: "a", roles: ["counselor", "management"] }, "leave.approve", tables), true);
});

test("a staff-level override wins outright over their roles", () => {
  const tables = { ...none, staffOverrides: [{ staff_id: "a", permission_key: "leave.approve", allowed: false }] };
  assert.equal(holdsPermission({ id: "a", roles: ["management"] }, "leave.approve", tables), false);
  const granted = { ...none, staffOverrides: [{ staff_id: "b", permission_key: "leave.approve", allowed: true }] };
  assert.equal(holdsPermission({ id: "b", roles: ["counselor"] }, "leave.approve", granted), true);
});

test("an unknown permission is held by nobody but a Super Admin", () => {
  const tables = { definition: null, roleOverrides: [], staffOverrides: [] };
  assert.equal(holdsPermission({ id: "a", roles: ["management"] }, "nope", tables), false);
  assert.equal(holdsPermission({ id: "s", roles: ["super_admin"] }, "nope", tables), true);
});
