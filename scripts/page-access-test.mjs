import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { PAGE_PERMISSIONS, permissionForPath, canOpenPath } from "../src/lib/pageAccess.ts";
import { buildStaffNav } from "../src/lib/nav.ts";

// The defaults each role is given, read from the migrations that add "page.*"
// permissions (0273, then one per page added since), so the test follows them
// rather than restating them.
const MIGRATIONS_DIR = new URL("../supabase/migrations/", import.meta.url);
const MIGRATION = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(new URL(f, MIGRATIONS_DIR), "utf8"))
  .join("\n");
const DEFAULTS = Object.fromEntries(
  [...MIGRATION.matchAll(/\('(page\.[a-z_.]+)', '[^']*', '(?:[^']|'')*', '(?:[^']|'')*', array\[([^\]]*)\]::staff_role\[\]/g)].map(
    ([, key, roles]) => [key, [...roles.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])]
  )
);
const permsFor = (role) => Object.fromEntries(Object.entries(DEFAULTS).map(([key, roles]) => [key, roles.includes(role)]));

const hrefs = (nav) => nav.flatMap((item) => (item.children ? item.children.map((c) => c.href) : [item.href]));
const sections = (nav) => nav.map((item) => item.label);
const navFor = (role, extra = {}) =>
  buildStaffNav({ isSuperAdmin: false, perms: permsFor(role), ...extra });

// ------------------------------------------------------- registry vs the rest

test("every page in the registry has a page permission in the migrations, and they have nothing else", () => {
  assert.deepEqual(Object.values(PAGE_PERMISSIONS).sort(), Object.keys(DEFAULTS).sort());
});

test("every gated folder has a layout that guards it with its own path", () => {
  for (const prefix of Object.keys(PAGE_PERMISSIONS)) {
    const file = new URL(`../src/app/(staff)${prefix}/layout.tsx`, import.meta.url);
    assert.ok(existsSync(file), `no layout guards ${prefix}`);
    assert.match(readFileSync(file, "utf8"), new RegExp(`<PageGuard path="${prefix}">`), `${prefix}'s layout guards another path`);
  }
});

test("every menu item is either gated or deliberately open", () => {
  const OPEN = new Set(["/dashboard", "/admin/staff", "/admin/leave", "/my-leave", "/my-agreement", "/admin/permissions"]);
  const all = hrefs(
    buildStaffNav({ isSuperAdmin: true, hasOwnAgreement: true, canApproveLeave: true, perms: {} })
  );
  for (const href of all) assert.ok(OPEN.has(href) || permissionForPath(href), `${href} has no page permission`);
});

// ------------------------------------------------------------- path matching

test("a detail page is governed by its section", () => {
  assert.equal(permissionForPath("/students/123"), "page.students");
  assert.equal(permissionForPath("/setup/universities/abc/programmes"), "page.setup.universities");
  assert.equal(permissionForPath("/finance/payroll?month=2026-09"), "page.finance.payroll");
  assert.equal(permissionForPath("/leads/"), "page.leads");
});

test("a path that only begins with the same letters is not governed by it", () => {
  assert.equal(permissionForPath("/leadsx"), null);
  assert.equal(permissionForPath("/reports-old"), null);
});

test("the open pages have no page permission", () => {
  for (const p of ["/dashboard", "/my-leave", "/admin/staff", "/admin/leave", "/admin/permissions"]) {
    assert.equal(permissionForPath(p), null, p);
  }
});

test("a missing or false permission refuses the page; a Super Admin opens everything", () => {
  assert.equal(canOpenPath("/finance/payroll", {}, false), false);
  assert.equal(canOpenPath("/finance/payroll", { "page.finance.payroll": false }, false), false);
  assert.equal(canOpenPath("/finance/payroll", { "page.finance.payroll": true }, false), true);
  assert.equal(canOpenPath("/finance/payroll", {}, true), true);
  assert.equal(canOpenPath("/dashboard", {}, false), true);
});

// ------------------------------------------------------------------ the menu

test("finance sees the finance pages and not the pipeline", () => {
  const menu = hrefs(navFor("finance"));
  for (const h of ["/finance/payroll", "/finance/invoice-generator", "/students", "/reports", "/setup/invoice-settings"]) {
    assert.ok(menu.includes(h), h);
  }
  for (const h of ["/leads", "/applications", "/marketing/campaigns", "/setup/universities"]) assert.ok(!menu.includes(h), h);
  assert.ok(!sections(navFor("finance")).includes("Marketing"));
});

test("a counselor sees no Finance or Admin section at all, and no empty heading", () => {
  const nav = navFor("counselor");
  assert.ok(!sections(nav).includes("Accounts & Finance"));
  assert.ok(!sections(nav).includes("Admin"));
  assert.ok(!sections(nav).includes("Marketing"));
  for (const item of nav) if (item.children) assert.ok(item.children.length > 0, `${item.label} is empty`);
  assert.ok(hrefs(nav).includes("/leads"));
});

test("everyone keeps Dashboard, their own leave and attendance", () => {
  for (const role of ["management", "counselor", "processing", "finance", "marketing", "digital_marketing"]) {
    const menu = hrefs(navFor(role));
    for (const h of ["/dashboard", "/my-leave", "/admin/attendance", "/calendar"]) assert.ok(menu.includes(h), `${role}: ${h}`);
  }
});

test("Office network and the audit log are Super Admin only", () => {
  for (const role of ["management", "counselor", "processing", "finance", "marketing", "digital_marketing"]) {
    const menu = hrefs(navFor(role));
    assert.ok(!menu.includes("/setup/office-network"), role);
    assert.ok(!menu.includes("/admin/audit-log"), role);
  }
  const sa = hrefs(buildStaffNav({ isSuperAdmin: true, perms: {} }));
  for (const h of ["/setup/office-network", "/admin/audit-log", "/admin/permissions", "/finance/payroll"]) assert.ok(sa.includes(h), h);
});

test("a permission granted on Role Permissions puts the page back in the menu", () => {
  const perms = { ...permsFor("counselor"), "page.finance.payroll": true };
  const nav = buildStaffNav({ isSuperAdmin: false, perms });
  const finance = nav.find((i) => i.label === "Accounts & Finance");
  assert.deepEqual(finance?.children?.map((c) => c.href), ["/finance/payroll"]);
});

test("Staff Management is in everyone's menu: the Super Admin manages it, anyone else sees their own record", () => {
  for (const role of ["counselor", "processing", "finance", "management", "digital_marketing"]) {
    assert.ok(hrefs(navFor(role)).includes("/admin/staff"), role);
  }
});
