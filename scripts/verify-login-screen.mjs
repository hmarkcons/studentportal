// The login screen's figures, and who may change them.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:login
//   PORTAL_URL=http://localhost:3000 ...      (against a local `next start`)
//
//   1. The public login page shows the figures the database holds, the
//      headline and the photo — to someone who is not signed in.
//   2. A Super Admin changes one on Setup → Login screen, and the public page
//      shows it straight away — which only happens if saving clears the
//      login page's cache (getCachedLoginFigures, tag "login-figures").
//   3. A counsellor is refused the Setup page, and the database refuses them
//      writing the figures directly (0278).
//
// What it changes is the last figure's icon, for a few seconds, and then puts
// it back through the same page — so the cache is cleared again. A wording
// change would be visible to anyone signing in meanwhile.
//
// Needs migration 0278 applied.
import { BASE, apiAs, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:login");

const { admin, url, anonKey } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

async function publicTiles(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-login-figures] li").first().waitFor({ timeout: 60_000 });
  const tiles = await page.locator("[data-login-figures] li").evaluateAll((els) =>
    els.map((el) => ({ icon: el.getAttribute("data-icon"), text: el.innerText.replace(/\s+/g, " ").trim() }))
  );
  const text = await page.locator("body").innerText();
  const photo = await page.locator("figure img").evaluate((img) => img.decode().then(() => img.naturalWidth, () => 0));
  await context.close();
  return { tiles, text, photo };
}

/** Sets one figure's icon on Setup → Login screen and waits for the save to be confirmed. */
async function setIcon(page, index, icon) {
  await page.goto(`${BASE}/setup/login-screen`, { waitUntil: "domcontentloaded" });
  const form = page.locator("[data-login-figures-form]");
  await form.waitFor({ timeout: 60_000 });
  await form.locator(`select[name="icon_${index}"]`).selectOption(icon);
  await form.getByRole("button", { name: "Save" }).click();
  const said = form.locator('[data-action-status="done"]').first();
  return said.waitFor({ timeout: 60_000 }).then(() => true, () => false);
}

let restore = null;
try {
  const { data: stored } = await admin.from("login_figures").select("value, label, icon, sort_order").order("sort_order");
  if (!stored?.length) throw new Error("no login figures are stored — is 0278 applied?");
  const last = stored.length - 1;
  const other = stored[last].icon === "star" ? "years" : "star";

  const browser = await openBrowser();

  // ------------------------------------------------- 1. the public page
  const before = await publicTiles(browser);
  ok(
    "the login page shows every stored figure, in order",
    JSON.stringify(before.tiles.map((t) => t.text)) === JSON.stringify(stored.map((s) => `${s.value} ${s.label}`)),
    JSON.stringify(before.tiles)
  );
  ok("...with the headline and the tagline", /Your Future Goes Beyond Borders/.test(before.text) && /Explore\. Apply\. Achieve\./.test(before.text));
  ok("...and the photo loads", before.photo > 0, String(before.photo));

  // --------------------------------------------- 2. a Super Admin edits one
  const sa = await fx.staff("login-super", ["super_admin"]);
  const saPage = await signIn(browser, sa.email);
  ok("super admin: Login screen is in the Setup menu", (await saPage.locator('nav a[href="/setup/login-screen"], aside a[href="/setup/login-screen"]').count()) > 0);
  restore = stored; // from here until it is put back, the finally block restores it
  ok("super admin: saving is confirmed", await setIcon(saPage, last, other));
  let after = null;
  for (let i = 0; i < 20; i++) {
    after = await publicTiles(browser);
    if (after.tiles[last]?.icon === other) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  ok("the public login page shows the change at once", after?.tiles[last]?.icon === other, JSON.stringify(after?.tiles[last]));
  ok("super admin: putting it back is confirmed", await setIcon(saPage, last, stored[last].icon));
  restore = null;

  // --------------------------------------------------- 3. a counsellor
  const counselor = await fx.staff("login-counselor", ["counselor"]);
  const cPage = await signIn(browser, counselor.email);
  await cPage.goto(`${BASE}/setup/login-screen`, { waitUntil: "domcontentloaded" });
  await cPage.locator("[data-no-page-access], [data-login-figures-form]").first().waitFor({ timeout: 60_000 });
  ok("counsellor: the Setup page is refused", (await cPage.locator("[data-no-page-access]").count()) === 1);
  const asCounselor = await apiAs(url, anonKey, counselor.email);
  const write = await asCounselor.from("login_figures").insert({ sort_order: 99, value: "0", label: "zztmp", icon: "star" }).select("id");
  ok("counsellor: the database refuses them adding a figure", Boolean(write.error) && !(write.data ?? []).length, JSON.stringify(write.data));
  if (write.data?.length) await admin.from("login_figures").delete().in("id", write.data.map((r) => r.id));
  const wipe = await asCounselor.from("login_figures").delete().gte("sort_order", 0).select("id");
  const { count } = await admin.from("login_figures").select("id", { count: "exact", head: true });
  ok("counsellor: ...or removing them", (wipe.data ?? []).length === 0 && count === stored.length, JSON.stringify(wipe.error ?? wipe.data));

  await browser.close();
} finally {
  if (restore) {
    // Only reached if the check stopped before putting the icon back. Written
    // back directly; the login page's cache clears within a day (revalidate)
    // or the next time anyone saves Setup → Login screen.
    await admin.from("login_figures").delete().gte("sort_order", 0);
    await admin.from("login_figures").insert(restore.map(({ value, label, icon, sort_order }) => ({ value, label, icon, sort_order })));
    console.log("NOTE  the figures were restored directly; open Setup → Login screen and press Save to refresh the login page.");
  }
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
