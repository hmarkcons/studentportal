// The login screen (0292): what it shows, who may change it, and signing in.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:login
//   PORTAL_URL=http://localhost:3000 ...      (against a local server)
//
//   1. The public page, to someone not signed in: the stored headline and
//      greeting over the reference design's defaults, the Student and
//      Counsellor tabs, the picture actually loading, Forgot password? going
//      to the configured link (HMARK's WhatsApp by default), the counselling
//      link, the footer's copyright year and the partner registration link —
//      and no emoji anywhere on it.
//   2. A Super Admin on Setup → Login screen: the preview follows what is
//      typed before anything is saved; a javascript: link is refused and
//      nothing is written; a colour change saves and the public page shows it
//      at once — which only happens if saving clears the page's cache. Then
//      the picture: uploading one puts the public page on it, served from the
//      public bucket, and "Use the original picture" puts it back and removes
//      the file.
//   3. A counsellor is refused the Setup page, and the database refuses their
//      update and their upload (0292).
//   4. Signing in: a student by Student ID, typed in lower case, lands in the
//      portal; with "Keep me signed in" unticked the session cookies carry no
//      expiry, so closing the browser signs them out; ticked, they last. A
//      wrong password and an unknown Student ID get the same answer. A staff
//      member signs in by email on the Counsellor tab.
//
// What it changes on the live page is the accent colour, by one step of blue
// (#0b7a52 to #0b7a53 — nobody can see it), and the picture, for a copy of the
// same picture; both are put back through the same page, and the finally
// block writes back whatever was stored if the run stops part-way.
//
// Needs migration 0292 applied.
import { readFileSync } from "node:fs";
import { BASE, FIXTURE_PASSWORD, apiAs, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:login");

const { admin, url, anonKey } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const STUDENT_EMAIL = "zztmp-login-student@hmark-test.local";
const EMOJI = /\p{Extended_Pictographic}/u;

async function poll(fn, seconds = 45) {
  for (let i = 0; i < seconds; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

/** Waits until React owns the form — typing before hydration is lost. */
async function hydrated(page, selector) {
  await page
    .waitForFunction((sel) => {
      const el = document.querySelector(sel);
      return Boolean(el && Object.keys(el).some((k) => k.startsWith("__reactFiber")));
    }, selector, { timeout: 60_000 })
    .catch(() => {});
}

async function publicPage(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-login-screen]").waitFor({ timeout: 60_000 });
  return { context, page };
}

async function publicAccent(browser) {
  const { context, page } = await publicPage(browser);
  const accent = await page.locator("[data-login-screen]").evaluate((el) => el.style.getPropertyValue("--login-accent").trim());
  const picture = await page.locator("[data-login-picture]").evaluate((img) => ({ src: img.currentSrc || img.src }));
  await context.close();
  return { accent, picture };
}

let restore = null;
let studentId = null;
let portalUserId = null;
let browser = null;
try {
  const { data: stored, error: readError } = await admin.from("login_screen").select("content, image_path").eq("id", true).single();
  if (readError) throw new Error(`login_screen is not readable — is 0292 applied? ${readError.message}`);
  const original = { content: stored.content ?? {}, image_path: stored.image_path ?? null };
  const originalAccent = original.content.accentColor ?? "#0b7a52";
  const nudged = originalAccent.toLowerCase() === "#0b7a53" ? "#0b7a52" : "#0b7a53";

  browser = await openBrowser();

  // ------------------------------------------------- 1. the public page
  {
    const { context, page } = await publicPage(browser);
    const text = await page.locator("[data-login-screen]").innerText();
    const headline = (await page.locator("[data-login-headline]").innerText()).trim();
    ok("the login page shows the headline", headline === (original.content.headline ?? "Your Future Goes Beyond Borders"), headline);
    ok("...the greeting and both tabs",
      (await page.locator("[data-login-welcome]").innerText()).trim() === (original.content.welcomeTitle ?? "Welcome back")
      && (await page.locator('[data-login-tab="student"]').innerText()).trim() === (original.content.studentTab ?? "Student")
      && (await page.locator('[data-login-tab="staff"]').innerText()).trim() === (original.content.staffTab ?? "Counsellor"));
    const pictureWidth = await page.locator("[data-login-picture]").evaluate((img) => img.decode().then(() => img.naturalWidth, () => 0));
    ok("...and the picture loads", pictureWidth > 0, String(pictureWidth));
    const forgot = await page.locator("[data-forgot-password]").getAttribute("href");
    ok("Forgot password? goes to the configured link", forgot === (original.content.forgotUrl ?? forgot) && (original.content.forgotUrl ? true : /^https:\/\/wa\.me\/\d+\?text=/.test(forgot)), forgot);
    ok("...and the counselling link has somewhere to go", Boolean(await page.locator("[data-signup-link]").getAttribute("href")));
    const footer = (await page.locator("[data-login-footer]").first().innerText()).replace(/\s+/g, " ");
    ok("the footer carries this year's copyright and the partner registration link",
      footer.includes(`© ${new Date().getFullYear()} `) && (await page.locator('[data-login-footer] a[href="/register/partner"]').count()) > 0, footer);
    ok("there is no emoji anywhere on the page", !EMOJI.test(text.replace(/©/g, "")), (text.match(new RegExp(EMOJI.source, "gu")) ?? []).join(" "));
    await context.close();
  }

  // --------------------------------------------- 2. a Super Admin edits it
  const sa = await fx.staff("login-super", ["super_admin"]);
  const saPage = await signIn(browser, sa.email);
  ok("super admin: Login screen is in the Setup menu", (await saPage.locator('aside a[href="/setup/login-screen"]').count()) > 0);
  await saPage.goto(`${BASE}/setup/login-screen`, { waitUntil: "domcontentloaded" });
  const form = saPage.locator("[data-login-screen-form]");
  await form.waitFor({ timeout: 60_000 });
  await hydrated(saPage, '[data-login-screen-form] input[name="headline"]');

  // The preview follows typing, before anything is saved.
  await form.locator('input[name="headline"]').fill("zztmp Preview Headline");
  const previewed = await poll(async () => (await saPage.locator("[data-login-screen] [data-login-headline]").innerText()).includes("zztmp Preview Headline"), 10);
  ok("super admin: the preview shows a headline as it is typed", Boolean(previewed));
  await saPage.reload({ waitUntil: "domcontentloaded" });
  await form.waitFor({ timeout: 60_000 });
  await hydrated(saPage, '[data-login-screen-form] input[name="ctaUrl"]');

  // An unsafe link is refused and nothing is written.
  await form.locator('input[name="ctaUrl"]').fill("javascript:alert(1)");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  const refusal = await poll(async () => {
    const t = await form.innerText();
    return /give a full web address/.test(t) ? t : null;
  }, 30);
  const { data: afterBad } = await admin.from("login_screen").select("content").eq("id", true).single();
  ok("super admin: a javascript: link is refused, saying why", Boolean(refusal));
  ok("...and nothing is written", JSON.stringify(afterBad.content ?? {}) === JSON.stringify(original.content));
  await saPage.reload({ waitUntil: "domcontentloaded" });
  await form.waitFor({ timeout: 60_000 });
  await hydrated(saPage, '[data-login-screen-form] input[name="accentColor"]');

  // A colour change saves and reaches the public page at once.
  restore = original;
  await form.locator('input[name="accentColor"]').fill(nudged);
  await form.getByRole("button", { name: "Save", exact: true }).click();
  const saved = await form.locator('[data-action-status="done"]').first().waitFor({ timeout: 60_000 }).then(() => true, () => false);
  ok("super admin: saving is confirmed", saved);
  const { data: afterSave } = await admin.from("login_screen").select("content").eq("id", true).single();
  ok("...and stored", afterSave.content?.accentColor === nudged, JSON.stringify(afterSave.content));
  const shown = await poll(async () => ((await publicAccent(browser)).accent === nudged ? true : null), 30);
  ok("the public login page shows the change at once", Boolean(shown));

  await saPage.reload({ waitUntil: "domcontentloaded" });
  await form.waitFor({ timeout: 60_000 });
  await hydrated(saPage, '[data-login-screen-form] input[name="accentColor"]');
  await form.locator('input[name="accentColor"]').fill(originalAccent);
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await form.locator('[data-action-status="done"]').first().waitFor({ timeout: 60_000 }).catch(() => {});
  const { data: afterRestore } = await admin.from("login_screen").select("content").eq("id", true).single();
  ok("super admin: putting it back leaves exactly what was stored", JSON.stringify(afterRestore.content ?? {}) === JSON.stringify(original.content),
    `${JSON.stringify(afterRestore.content)} vs ${JSON.stringify(original.content)}`);

  // The picture: a copy of the shipped one, so the public page looks the same.
  // Only while the shipped one is in use: uploading replaces and deletes the
  // current file, and an office's own picture is not the check's to delete.
  const pictureForm = saPage.locator("[data-login-picture-form]");
  if (original.image_path) console.log("SKIP  the picture test — the office has its own picture on the login page");
  else {
  await hydrated(saPage, '[data-login-picture-form] input[type="file"]');
  await pictureForm.locator('input[type="file"]').setInputFiles({
    name: "zztmp-login-picture.webp",
    mimeType: "image/webp",
    buffer: readFileSync(new URL("../public/login/beyond-borders.webp", import.meta.url)),
  });
  await pictureForm.getByRole("button", { name: /Upload picture/ }).click();
  const uploadedPath = await poll(async () => {
    const { data } = await admin.from("login_screen").select("image_path").eq("id", true).single();
    return data.image_path && data.image_path !== original.image_path ? data.image_path : null;
  }, 45);
  ok("super admin: a new picture is stored", Boolean(uploadedPath), String(uploadedPath));
  if (uploadedPath) {
    const onPage = await poll(async () => {
      const p = await publicAccent(browser);
      return p.picture.src.includes(`/storage/v1/object/public/site-assets/${uploadedPath}`) ? p : null;
    }, 30);
    ok("...and the public page shows it, from the public bucket", Boolean(onPage));
    await saPage.reload({ waitUntil: "domcontentloaded" });
    await pictureForm.waitFor({ timeout: 60_000 });
    await hydrated(saPage, '[data-login-picture-form] button');
    {
      await pictureForm.getByRole("button", { name: /Use the original picture/ }).click();
      const reset = await poll(async () => {
        const { data } = await admin.from("login_screen").select("image_path").eq("id", true).single();
        return data.image_path === null ? true : null;
      }, 45);
      ok("super admin: Use the original picture puts it back", Boolean(reset));
      const { data: left } = await admin.storage.from("site-assets").list("login", { search: uploadedPath.split("/")[1] });
      ok("...and removes the uploaded file", (left ?? []).length === 0, JSON.stringify(left));
      const back = await poll(async () => ((await publicAccent(browser)).picture.src.endsWith("/login/beyond-borders.webp") ? true : null), 30);
      ok("...and the public page is on the shipped picture again", Boolean(back));
    }
  }
  }
  restore = null;

  // --------------------------------------------------- 3. a counsellor
  const counselor = await fx.staff("login-counselor", ["counselor"]);
  const cPage = await signIn(browser, counselor.email);
  await cPage.goto(`${BASE}/setup/login-screen`, { waitUntil: "domcontentloaded" });
  await cPage.locator("[data-no-page-access], [data-login-screen-form]").first().waitFor({ timeout: 60_000 });
  ok("counsellor: the Setup page is refused", (await cPage.locator("[data-no-page-access]").count()) === 1);
  const asCounselor = await apiAs(url, anonKey, counselor.email);
  const write = await asCounselor.from("login_screen").update({ content: { headline: "zztmp" } }).eq("id", true).select("id");
  ok("counsellor: the database refuses them changing it", !(write.data ?? []).length, JSON.stringify(write.data));
  const upload = await asCounselor.storage.from("site-assets").upload("login/zztmp-counsellor.png", Buffer.from("x"), { contentType: "image/png" });
  ok("counsellor: ...or uploading a picture", Boolean(upload.error), JSON.stringify(upload.data));
  if (!upload.error) await admin.storage.from("site-assets").remove(["login/zztmp-counsellor.png"]);

  // ------------------------------------------------------ 4. signing in
  const { data: italy } = await admin.from("destinations").select("id").eq("display_name", "Italy (Public)").single();
  studentId = await fx.lead({
    full_name: "zztmp Login Student", email: "zztmp-login@example.invalid", contact_number: "0300-9999994",
    status: "registered", registration_status: "registered", registered_at: new Date().toISOString(),
    date_of_inquiry: new Date().toISOString().slice(0, 10), country_of_interest: "Italy (Public)", intake: "Fall 2099",
  });
  await admin.from("lead_destinations").insert({ lead_id: studentId, destination_id: italy.id });
  const coded = await poll(async () => {
    const { data } = await admin.from("leads").select("student_code").eq("id", studentId).single();
    return data?.student_code ?? null;
  }, 20);
  ok("the fixture student has a Student ID", Boolean(coded), String(coded));
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of users?.users ?? []) if (u.email === STUDENT_EMAIL) await admin.auth.admin.deleteUser(u.id).catch(() => {});
  const { data: made } = await admin.auth.admin.createUser({ email: STUDENT_EMAIL, password: FIXTURE_PASSWORD, email_confirm: true });
  portalUserId = made.user.id;
  await admin.from("leads").update({ auth_user_id: portalUserId, portal_active: true }).eq("id", studentId);

  const attempt = async ({ identifier, password = FIXTURE_PASSWORD, keep = false, tab = "student" }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await hydrated(page, 'input[name="email"]');
    if (tab === "staff") await page.locator('[data-login-tab="staff"]').click();
    await page.fill('input[name="email"]', identifier);
    await page.fill('input[name="password"]', password);
    if (keep) await page.locator("[data-keep-signed-in]").check();
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const left = await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 }).then(() => true, () => false);
    const error = left ? null : await page.locator("[data-login-error]").innerText().catch(() => null);
    const auth = (await context.cookies()).filter((c) => /^sb-.*-auth-token/.test(c.name));
    return { context, page, left, error, auth };
  };

  if (coded) {
    const byId = await attempt({ identifier: coded.toLowerCase() });
    ok("a student signs in with their Student ID, in any case", byId.left, byId.error ?? "");
    ok("...unticked, the session cookies carry no expiry — closing the browser signs them out",
      byId.auth.length > 0 && byId.auth.every((c) => c.expires === -1), JSON.stringify(byId.auth.map((c) => [c.name, c.expires])));
    await byId.context.close();

    const kept = await attempt({ identifier: STUDENT_EMAIL, keep: true });
    const inAYear = Date.now() / 1000 + 300 * 86400;
    ok("...and by email with Keep me signed in ticked, they last",
      kept.left && kept.auth.length > 0 && kept.auth.every((c) => c.expires > inAYear), JSON.stringify(kept.auth.map((c) => [c.name, c.expires])));
    await kept.context.close();

    const wrong = await attempt({ identifier: coded, password: "zztmp-not-the-password" });
    const unknown = await attempt({ identifier: "HMC-FALL99-ZZ-9999", password: "zztmp-not-the-password" });
    ok("a wrong password with a Student ID is refused", !wrong.left && Boolean(wrong.error), String(wrong.error));
    ok("...with the same words as a Student ID that does not exist", Boolean(wrong.error) && wrong.error === unknown.error, `${wrong.error} | ${unknown.error}`);
    await wrong.context.close();
    await unknown.context.close();
  }

  const staffIn = await attempt({ identifier: counselor.email, tab: "staff" });
  ok("a staff member signs in by email on the Counsellor tab", staffIn.left, staffIn.error ?? "");
  await staffIn.context.close();
} catch (e) {
  ok(`the check itself stopped: ${e?.stack ?? e}`, false);
} finally {
  await browser?.close().catch(() => {});
  if (restore) {
    // Only reached if the run stopped before putting things back. Written back
    // directly; the login page's cache clears within a day or the next time
    // anyone saves Setup → Login screen.
    const { data: now } = await admin.from("login_screen").select("image_path").eq("id", true).single();
    await admin.from("login_screen").update({ content: restore.content, image_path: restore.image_path }).eq("id", true);
    if (now?.image_path && now.image_path !== restore.image_path) await admin.storage.from("site-assets").remove([now.image_path]);
    console.log("NOTE  the login screen was restored directly; open Setup → Login screen and press Save to refresh the login page.");
  }
  if (studentId) await admin.from("lead_destinations").delete().eq("lead_id", studentId);
  const removed = await fx.cleanup();
  if (portalUserId) await admin.auth.admin.deleteUser(portalUserId).catch(() => {});
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
