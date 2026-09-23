// A Super Admin issuing a staff member's login, end to end.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:staffcreds
//   PORTAL_URL=http://localhost:3000 ...      (against a local `next start`)
//
// Each of these is a thing that can look done without being done, so each is
// asserted on the thing itself — a sign-in that works or fails, a session that
// ends, a row the database refuses to hand over — never on wording alone:
//
//   1. The new password signs in, and the old one no longer does.
//   2. Issuing signs them out of a session that was already open — the reason
//      to issue a new password is often that the old one got out.
//   3. The kept copy reveals the same password that was issued.
//   4. Nobody but a Super Admin is offered it, and the database refuses the
//      functions to anyone else even when asked directly.
//   5. Editing a staff member's official email moves their login with it.
//
// Note: issuing mails the credentials to the fixture's official address, which
// is on a domain that does not exist, so the mailbox the portal sends from may
// receive a bounce per run.
import {
  BASE,
  FIXTURE_PASSWORD,
  apiAs,
  clients,
  fixtures,
  openBrowser,
  reporter,
  requireConfirmation,
  signIn,
} from "./verify-portal-lib.mjs";

requireConfirmation("check:staffcreds");

const { admin, url, anonKey } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

/** Signs in with any password; resolves to where the login landed. */
async function tryLogin(browser, email, password) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  const landed = await page
    .waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 })
    .then(() => true, () => false);
  return { page, landed };
}

/** Opens the target's Login panel on /admin/staff. */
async function openLoginPanel(page, fullName) {
  await page.goto(`${BASE}/admin/staff`, { waitUntil: "domcontentloaded" });
  const row = page.locator("tr", { hasText: fullName }).first();
  await row.locator('button[aria-label="Actions"]').click();
  await page.getByRole("button", { name: "🔐 Login" }).click();
  const panel = page.getByRole("dialog").last();
  await panel.getByText("Signs in with").waitFor({ timeout: 30_000 });
  return panel;
}

try {
  const superUser = await fx.staff("credsuper", ["super_admin"]);
  const target = await fx.staff("credtarget", ["counselor"]);
  const manager = await fx.staff("credmanager", ["management"]);
  // The official email is the login; the fixture starts with them the same.
  await admin.from("staff").update({ email_official: target.email }).eq("id", target.id);

  const browser = await openBrowser();

  // -------------------------------------- the target, already signed in
  const targetPage = await signIn(browser, target.email);
  ok("the target starts signed in with the fixture password", !new URL(targetPage.url()).pathname.startsWith("/login"));

  // ------------------------------------------------- issuing, as Super Admin
  const sa = await signIn(browser, superUser.email);
  let panel = await openLoginPanel(sa, target.name);
  ok("the Login panel shows the email they sign in with", (await panel.innerText()).includes(target.email));
  ok("...and that they have signed in", !/Last signed in\s*Never/.test(await panel.innerText()), await panel.innerText());

  sa.once("dialog", (d) => d.accept());
  await panel.getByRole("button", { name: /Issue (new|login) credentials/ }).click();
  const box = panel.locator("[data-credentials]").first();
  const issued = await box.waitFor({ timeout: 60_000 }).then(() => true, () => false);
  ok("issuing shows the new credentials", issued, issued ? "" : (await panel.innerText()).slice(0, 400));
  const password = issued ? (await box.locator("[data-credential-password]").innerText()).trim() : "";
  ok("...a strong password", /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#%*?]).{16}$/.test(password), password);
  ok("...with its confirmation beside the button", (await panel.innerText()).includes("Issued."));

  // ---------------------------------------------- the old session ends
  await targetPage.reload({ waitUntil: "domcontentloaded" });
  await targetPage.waitForTimeout(1500);
  await targetPage.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  ok("issuing signed them out of the session they had open",
    new URL(targetPage.url()).pathname.startsWith("/login") || new URL(targetPage.url()).pathname === "/",
    targetPage.url());

  // ----------------------------------------- new works, old does not
  const withNew = await tryLogin(browser, target.email, password);
  ok("the new password signs in", withNew.landed, withNew.page.url());
  const withOld = await tryLogin(browser, target.email, FIXTURE_PASSWORD);
  ok("the old password no longer does", !withOld.landed, withOld.page.url());

  // --------------------------------------------------- the kept copy
  panel = await openLoginPanel(sa, target.name);
  await panel.getByRole("button", { name: "Reveal password" }).click();
  const shown = panel.locator("[data-credentials] [data-credential-password]").first();
  await shown.waitFor({ timeout: 30_000 });
  ok("Reveal shows the password that was issued", (await shown.innerText()).trim() === password, await shown.innerText());
  const { data: kept } = await admin.from("staff_login_credentials").select("staff_id").eq("staff_id", target.id);
  ok("...kept in its own table", (kept ?? []).length === 1);

  // --------------------------------------------- nobody else, at any layer
  const managerPage = await signIn(browser, manager.email);
  await managerPage.goto(`${BASE}/admin/staff`, { waitUntil: "domcontentloaded" });
  const managerRow = managerPage.locator("tr", { hasText: target.name }).first();
  if (await managerRow.count()) {
    await managerRow.locator('button[aria-label="Actions"]').click();
    ok("Management is not offered the Login panel",
      (await managerPage.getByRole("button", { name: "🔐 Login" }).count()) === 0);
  } else {
    ok("Management is not offered the Login panel", true);
  }
  const asManager = await apiAs(url, anonKey, manager.email);
  const read = await asManager.rpc("read_staff_login", { p_staff_id: target.id });
  ok("the database refuses Management a staff password", Boolean(read.error), JSON.stringify(read.data));
  const direct = await asManager.from("staff_login_credentials").select("encrypted_value");
  ok("...and the table itself hands them nothing", (direct.data ?? []).length === 0, JSON.stringify(direct.error ?? direct.data));
  const revoke = await asManager.rpc("revoke_staff_sessions", { p_staff_id: superUser.id });
  ok("...nor may they sign anyone out", Boolean(revoke.error));
  const store = await asManager.rpc("store_staff_login", { p_staff_id: target.id, p_plaintext: "{}" });
  ok("...nor overwrite the kept copy", Boolean(store.error));

  // ----------------------------------- the login follows the official email
  const moved = `zztmp-credmoved-${Date.now()}@hmark-test.local`;
  await sa.goto(`${BASE}/admin/staff`, { waitUntil: "domcontentloaded" });
  const row = sa.locator("tr", { hasText: target.name }).first();
  await row.locator('button[aria-label="Actions"]').click();
  await sa.getByRole("button", { name: /Edit/ }).first().click();
  const form = sa.locator("form", { has: sa.locator('input[name="email_official"]') }).last();
  await form.locator('input[name="email_official"]').fill(moved);
  await form.getByRole("button", { name: /Save changes/ }).click();
  let loginEmail = null;
  for (let i = 0; i < 40; i++) {
    const { data } = await admin.auth.admin.getUserById(target.id);
    loginEmail = data?.user?.email ?? null;
    if (loginEmail === moved) break;
    await sa.waitForTimeout(1000);
  }
  ok("editing the official email moves their login with it", loginEmail === moved, String(loginEmail));
  const atNewAddress = await tryLogin(browser, moved, password);
  ok("...and they sign in at the new address", atNewAddress.landed, atNewAddress.page.url());

  await browser.close();
} finally {
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
