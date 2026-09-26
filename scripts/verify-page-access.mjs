// The menu shows a role only what it may open, and the pages agree.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:pageaccess
//   PORTAL_URL=http://localhost:3000 ...      (against a local `next start`)
//
// Each check reads the thing that would be different if it were broken — a
// link that is in the sidebar or is not, the guard's own marker on the page,
// the login's email in auth — never a phrase that could appear anyway:
//
//   1. Finance and a counselor each see their own pages and none of the rest,
//      and a section with nothing left in it is not shown.
//   2. Typing a hidden page's address shows "no access"; an allowed one opens.
//   3. A detail page is guarded by its section.
//   4. Nobody but a Super Admin edits staff: the database refuses to grant
//      staff.manage to anyone else (0284); a manager opening Staff Management
//      sees their own record and no one else's, with nothing to edit; and the
//      database will not take a change to a colleague's official email from
//      them directly (staff_write, 0274). (That a Super Admin's change moves
//      the login is check:staffcreds.)
//
// Needs 0273, 0274 and 0284 applied.
import { BASE, apiAs, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:pageaccess");

const { admin, url, anonKey } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

/** The hrefs in the sidebar — including those inside a closed section. */
async function sidebar(page) {
  await page.locator("aside nav a").first().waitFor({ timeout: 40_000 });
  return page.locator("aside nav a").evaluateAll((as) => as.map((a) => new URL(a.href).pathname));
}
async function sections(page) {
  return page.locator("aside nav summary").allInnerTexts().then((t) => t.map((s) => s.trim()));
}

/** Opens a path and waits for either the guard's refusal or the page itself. */
async function opens(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  const refused = page.locator("[data-no-page-access]");
  const content = page.locator("main h1, main h2").first();
  await Promise.race([refused.waitFor({ timeout: 40_000 }), content.waitFor({ timeout: 40_000 })]).catch(() => {});
  return (await refused.count()) === 0;
}

try {
  const finance = await fx.staff("pa-finance", ["finance"]);
  const counselor = await fx.staff("pa-counselor", ["counselor"]);
  const manager = await fx.staff("pa-manager", ["management"]);
  const target = await fx.staff("pa-target", ["counselor"]);
  await admin.from("staff").update({ email_official: target.email }).eq("id", target.id);
  // A real record, so the detail-page checks reach a page that exists — a
  // made-up path is Next's 404, which no guard is ever asked about.
  const lead = await fx.lead({ full_name: "zztmp pa-student" });

  const browser = await openBrowser();

  // ------------------------------------------------------------ finance
  const fin = await signIn(browser, finance.email);
  let menu = await sidebar(fin);
  ok("finance: Payroll is in the menu", menu.includes("/finance/payroll"), menu.join(" "));
  ok("finance: so are Students and Reports", menu.includes("/students") && menu.includes("/reports"));
  ok("finance: Leads is not", !menu.includes("/leads"));
  ok("finance: nor Applications, nor any Marketing page", !menu.includes("/applications") && !menu.some((h) => h.startsWith("/marketing/") && h !== "/marketing/referrals"));
  ok("finance: the Marketing section is not shown at all", !(await sections(fin)).some((s) => s.includes("Marketing")), (await sections(fin)).join(" | "));
  ok("finance: Dashboard and My leave stay", menu.includes("/dashboard") && menu.includes("/my-leave"));

  ok("finance: typing /leads shows no access", !(await opens(fin, "/leads")));
  ok("finance: typing /setup/office-network shows no access", !(await opens(fin, "/setup/office-network")));
  ok("finance: /finance/payroll opens", await opens(fin, "/finance/payroll"));
  ok("finance: a student record opens (Students is theirs)", await opens(fin, `/students/${lead}`));
  ok("finance: the same person under Leads is refused (a detail page of a hidden section)", !(await opens(fin, `/leads/${lead}`)));

  // ----------------------------------------------------------- counselor
  const cou = await signIn(browser, counselor.email);
  menu = await sidebar(cou);
  const counselorSections = await sections(cou);
  ok("counselor: Leads and Applications are in the menu", menu.includes("/leads") && menu.includes("/applications"));
  ok("counselor: no Finance page", !menu.some((h) => h.startsWith("/finance/")), menu.join(" "));
  ok("counselor: the Accounts & Finance and Admin sections are gone", !counselorSections.some((s) => /Finance|Admin/.test(s)), counselorSections.join(" | "));
  ok("counselor: typing /finance/payroll shows no access", !(await opens(cou, "/finance/payroll")));
  ok("counselor: /admin/audit-log shows no access", !(await opens(cou, "/admin/audit-log")));
  ok("counselor: /leads opens", await opens(cou, "/leads"));

  // ------------------------------------------- staff are the Super Admin's
  // Managing staff used to be a permission the Role Permissions screen could
  // hand to anyone. It is the Super Admin's alone now, and the database says so.
  const grant = await admin.from("staff_permission_overrides").upsert({ staff_id: manager.id, permission_key: "staff.manage", allowed: true });
  const roleGrant = await admin.from("role_permission_overrides").upsert({ role: "management", permission_key: "staff.manage", allowed: true });
  ok("staff.manage cannot be granted to a person, nor to a role", Boolean(grant.error) && Boolean(roleGrant.error),
    JSON.stringify({ person: grant.error?.message ?? "granted", role: roleGrant.error?.message ?? "granted" }));

  const mgr = await signIn(browser, manager.email);
  await mgr.goto(`${BASE}/admin/staff`, { waitUntil: "domcontentloaded" });
  const own = mgr.locator("[data-own-staff-record]");
  await own.waitFor({ timeout: 60_000 }).catch(() => {});
  const ownText = (await own.count()) ? await own.innerText() : "";
  ok("manager: Staff Management shows their own record", ownText.includes(manager.name), ownText.slice(0, 120));
  ok("manager: ...and nobody else's", !(await mgr.locator("body").innerText()).includes(target.name));
  ok("manager: ...with nothing to edit", (await mgr.locator('button[aria-label="Actions"], input[name="email_official"]').count()) === 0);

  const forged = `zztmp-pa-forged-${Date.now()}@hmark-test.local`;
  // Past the app: straight to the database with the manager's own session.
  const asManager = await apiAs(url, anonKey, manager.email);
  // staff_write refuses the row, and 0274 would refuse the column if it did not.
  const direct = await asManager.from("staff").update({ email_official: forged }).eq("id", target.id).select("id");
  const { data: after } = await admin.from("staff").select("email_official").eq("id", target.id).single();
  ok(
    "manager: the database will not take the change directly either",
    after?.email_official === target.email && (direct.error || (direct.data ?? []).length === 0),
    JSON.stringify(direct.error ?? direct.data)
  );

  await browser.close();
} finally {
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
