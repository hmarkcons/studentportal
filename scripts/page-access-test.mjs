import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { PAGE_PERMISSIONS, PAGE_EDIT_PERMISSIONS, permissionForPath, canOpenPath, missingForPath, editPermissionsForPath } from "../src/lib/pageAccess.ts";
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
// The editing permissions an editor-only page also needs (PAGE_EDIT_PERMISSIONS),
// with the default roles permission_definitions gives them — what the Role
// Permissions screen starts from, before any switch is changed there.
const EDIT_DEFAULTS = {
  "settings.travel_guide": ["processing", "management", "super_admin"],
  "settings.visa_messages": ["management", "super_admin"],
  "settings.visa_offices": ["management", "super_admin"],
  "settings.visa_page": ["management", "super_admin"],
  "settings.reengagement_messages": ["management", "super_admin"],
  "document_checklist.manage": ["super_admin", "processing"],
  "document_trackers.manage": ["super_admin"],
  "attendance.qr_admin": ["super_admin"],
  "staff.approve_offsite_access": ["management", "super_admin"],
  "finance.commissions.manage": ["finance", "super_admin"],
  "finance.invoices.manage": ["finance", "super_admin"],
  "finance.refunds.manage": ["super_admin"],
  "finance.refunds.review": ["finance", "management", "super_admin"],
  "messages.broadcast": ["super_admin", "management", "marketing", "digital_marketing"],
};
const permsFor = (role) =>
  Object.fromEntries(
    [...Object.entries(DEFAULTS), ...Object.entries(EDIT_DEFAULTS)].map(([key, roles]) => [key, roles.includes(role)])
  );

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
  assert.equal(canOpenPath("/reports", {}, false), false);
  assert.equal(canOpenPath("/reports", { "page.reports": false }, false), false);
  assert.equal(canOpenPath("/reports", { "page.reports": true }, false), true);
  assert.equal(canOpenPath("/reports", {}, true), true);
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
  const perms = { ...permsFor("counselor"), "page.finance.payroll": true, "finance.commissions.manage": true };
  const nav = buildStaffNav({ isSuperAdmin: false, perms });
  const finance = nav.find((i) => i.label === "Accounts & Finance");
  assert.deepEqual(finance?.children?.map((c) => c.href), ["/finance/payroll"]);
});

test("Staff Management is in everyone's menu: the Super Admin manages it, anyone else sees their own record as My profile", () => {
  const label = (nav) => nav.find((i) => i.label === "HR")?.children?.find((c) => c.href === "/admin/staff")?.label;
  for (const role of ["counselor", "processing", "finance", "management", "digital_marketing"]) {
    assert.ok(hrefs(navFor(role)).includes("/admin/staff"), role);
    assert.equal(label(navFor(role)), "My profile", role);
  }
  assert.equal(label(buildStaffNav({ isSuperAdmin: true, perms: {} })), "Staff Management");
});

// ------------------------------------------------------ editor-only pages

test("every editor-only page is a gated page, needing permissions the migrations define", () => {
  const migrations = MIGRATION;
  for (const [prefix, keys] of Object.entries(PAGE_EDIT_PERMISSIONS)) {
    assert.ok(PAGE_PERMISSIONS[prefix], `${prefix} has no page permission`);
    assert.ok(keys.length > 0, prefix);
    for (const k of keys) assert.ok(migrations.includes(`'${k}'`), `${k} is not in any migration`);
    for (const k of keys) assert.ok(k in EDIT_DEFAULTS, `${k} has no default in this test`);
  }
});

test("an editor-only page needs its Open switch AND a permission to edit it", () => {
  const openOnly = { "page.setup.travel_guide": true };
  assert.equal(canOpenPath("/setup/travel-guide", openOnly, false), false);
  assert.deepEqual(missingForPath("/setup/travel-guide", openOnly, false), ["settings.travel_guide"]);
  assert.equal(canOpenPath("/setup/travel-guide", { ...openOnly, "settings.travel_guide": true }, false), true);
  // Editing without the Open switch does not open it either.
  assert.deepEqual(missingForPath("/setup/travel-guide", { "settings.travel_guide": true }, false), ["page.setup.travel_guide"]);
  // A Super Admin opens it whatever the table holds.
  assert.equal(canOpenPath("/setup/travel-guide", {}, true), true);
  // Its detail pages follow it.
  assert.deepEqual(editPermissionsForPath("/setup/travel-guide/italy"), ["settings.travel_guide"]);
});

test("Refunds opens with either refunds permission", () => {
  const open = { "page.finance.refunds": true };
  assert.equal(canOpenPath("/finance/refunds", open, false), false);
  assert.equal(canOpenPath("/finance/refunds", { ...open, "finance.refunds.review": true }, false), true);
  assert.equal(canOpenPath("/finance/refunds", { ...open, "finance.refunds.manage": true }, false), true);
});

test("switching an editing permission off takes its page out of that role's menu — as 23 September's switches meant", () => {
  // Processing may open Travel & arrival guides; with editing them off, it goes.
  const processing = permsFor("processing");
  assert.ok(hrefs(buildStaffNav({ isSuperAdmin: false, perms: processing })).includes("/setup/travel-guide"));
  assert.ok(!hrefs(buildStaffNav({ isSuperAdmin: false, perms: { ...processing, "settings.travel_guide": false } })).includes("/setup/travel-guide"));
  // Finance with commissions and payroll off loses both pages.
  const finance = hrefs(buildStaffNav({ isSuperAdmin: false, perms: { ...permsFor("finance"), "finance.commissions.manage": false } }));
  assert.ok(!finance.includes("/finance/payroll") && !finance.includes("/finance/staff-commission"));
  assert.ok(finance.includes("/finance/invoice-generator"));
});

test("pages a role opens but cannot edit by default are not offered: Processing's visa builders, a counsellor's messages", () => {
  const processing = hrefs(navFor("processing"));
  for (const h of ["/setup/visa-page-builder", "/setup/visa-messages", "/setup/visa-offices", "/setup/document-trackers"]) {
    assert.ok(!processing.includes(h), h);
  }
  assert.ok(processing.includes("/setup/create-doc-checklist"));
  assert.ok(!hrefs(navFor("counselor")).includes("/setup/reengagement-messages"));
  assert.ok(!hrefs(navFor("management")).includes("/setup/attendance-policy"));
});

test("a reference page stays with its Open switch alone, read-only to those who cannot change it", () => {
  const processing = { ...permsFor("processing"), "scholarships.manage": false, "inventory.manage": false };
  const menu = hrefs(buildStaffNav({ isSuperAdmin: false, perms: processing }));
  for (const h of ["/setup/scholarship-bodies", "/setup/universities", "/setup/destinations", "/inventory"]) assert.ok(menu.includes(h), h);
});
