// Profile photos, at their sizes, end to end against a portal:
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:avatars
//
//   * the top bar shows the person's own photo beside their name — a staff
//     member's and a student's — at 48 pixels, and their initials, the same
//     size, when they have none;
//   * every other photo is drawn at its size: the staff list (40), the
//     student's photo at the top of their page (96), the counsellor and
//     processing officer cards there (64), the student's Dashboard team card
//     (88), their Messages (56) and the photo on their profile (120);
//   * the calendar, which fills the window under the top bar, still fits it.
//
// Everything is named zztmp and removed in a finally.
import { BASE, FIXTURE_PASSWORD, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:avatars");

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();
const RUN = Date.now().toString(36);
const STUDENT_EMAIL = `zztmp-avatars-${RUN}@hmark-test.local`;
// A real image, one pixel, so the browser has something to draw at each size.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

async function poll(fn, seconds = 30, every = 500) {
  const until = Date.now() + seconds * 1000;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v || Date.now() > until) return v;
    await new Promise((r) => setTimeout(r, every));
  }
}

/** The drawn size of the first element matching, once it has been drawn; and whether an image loaded. */
async function drawn(page, selector) {
  let last = null;
  // Waits for an image to arrive, not only for its box: a lazy one is laid out before it loads.
  const settled = await poll(async () => {
    const el = page.locator(selector).first();
    if (!(await el.count())) return null;
    await el.scrollIntoViewIfNeeded();
    const box = await el.boundingBox();
    if (!box) return null;
    const loaded = await el.evaluate((e) => (e.tagName === "IMG" ? e.complete && e.naturalWidth > 0 : true));
    last = { w: Math.round(box.width), h: Math.round(box.height), loaded };
    return loaded ? last : null;
  });
  return settled ?? last;
}

const is = (size, px) => Boolean(size) && size.w === px && size.h === px && size.loaded;

const uploaded = [];
async function photo(path) {
  const { error } = await admin.storage.from("documents").upload(path, PNG, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`could not upload ${path}: ${error.message}`);
  uploaded.push(path);
  return path;
}

let browser = null;
let studentUserId = null;

try {
  const sup = await fx.staff(`avsup${RUN}`, ["super_admin"]);
  const officer = await fx.staff(`avoff${RUN}`, ["processing"]);
  const counsellor = await fx.staff(`avcoun${RUN}`, ["counselor"]);
  const supPhoto = await photo(`staff-photos/${sup.id}/photo-zztmp-${RUN}.png`);
  const counsellorPhoto = await photo(`staff-photos/${counsellor.id}/photo-zztmp-${RUN}.png`);
  await admin.from("staff").update({ photo_path: supPhoto }).eq("id", sup.id);
  await admin.from("staff").update({ photo_path: counsellorPhoto }).eq("id", counsellor.id);

  const { data: italy } = await admin.from("destinations").select("id, display_name").eq("display_name", "Italy (Public)").single();
  // An intake, so the student has a Student ID and a portal.
  const studentId = await fx.lead({
    full_name: `zztmp Avatar Student ${RUN}`,
    email: STUDENT_EMAIL,
    contact_number: "0300-9999994",
    status: "registered",
    registration_status: "registered",
    registered_at: new Date().toISOString(),
    date_of_inquiry: new Date().toISOString().slice(0, 10),
    processing_officer_id: officer.id,
    assigned_counselor_id: counsellor.id,
    intake: "Fall 2099",
    level_applying_for: "masters",
    country_of_interest: italy.display_name,
  });
  await admin.from("lead_destinations").insert({ lead_id: studentId, destination_id: italy.id, is_backup: false });
  await poll(async () => (await admin.from("leads").select("student_code").eq("id", studentId).single()).data?.student_code, 20);
  const studentPhoto = await photo(`${studentId}/photo-zztmp-${RUN}.png`);
  await admin.from("student_profiles").upsert({ student_id: studentId, photo_path: studentPhoto }, { onConflict: "student_id" });
  const { data: made, error: authError } = await admin.auth.admin.createUser({ email: STUDENT_EMAIL, password: FIXTURE_PASSWORD, email_confirm: true });
  if (authError) throw new Error(`student login: ${authError.message}`);
  studentUserId = made.user.id;
  await admin.from("leads").update({ auth_user_id: studentUserId, portal_active: true }).eq("id", studentId);

  browser = await openBrowser();

  // ------------------------------------------------------------ staff
  const page = await signIn(browser, sup.email);
  const supTop = await drawn(page, '[data-app-header] img[data-header-avatar="photo"]');
  ok("a staff member with a photo sees it in the top bar, at 48", is(supTop, 48), JSON.stringify(supTop));
  ok("...their own", (await page.locator('[data-app-header] img[data-header-avatar="photo"]').getAttribute("src"))?.includes(`staff-photos/${sup.id}/`));

  await page.goto(`${BASE}/admin/staff`, { waitUntil: "domcontentloaded" });
  const listed = await drawn(page, `img[src*="staff-photos/${counsellor.id}/"]`);
  ok("the staff list draws a photo at 40", is(listed, 40), JSON.stringify(listed));

  await page.goto(`${BASE}/students/${studentId}`, { waitUntil: "domcontentloaded" });
  const studentTop = await drawn(page, `img[src*="${studentId}/photo-zztmp"]`);
  ok("the student's photo at the top of their page is 96", is(studentTop, 96), JSON.stringify(studentTop));
  const counsellorCard = await drawn(page, `main img[src*="staff-photos/${counsellor.id}/"]`);
  ok("the counsellor's card there is 64", is(counsellorCard, 64), JSON.stringify(counsellorCard));

  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.goto(`${BASE}/calendar`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const fits = await page.evaluate(() => ({ scroll: document.documentElement.scrollHeight, window: window.innerHeight }));
  ok("the calendar still fits under the taller top bar", fits.scroll <= fits.window, JSON.stringify(fits));
  await page.close();

  const officerPage = await signIn(browser, officer.email);
  const initials = await drawn(officerPage, '[data-app-header] [data-header-avatar="initials"]');
  const initialsText = (
    await officerPage
      .locator('[data-app-header] [data-header-avatar="initials"]')
      .innerText()
      .catch(() => "")
  ).trim();
  ok("one with no photo sees their initials, the same size", is(initials, 48) && initialsText === "ZA", `${JSON.stringify(initials)} ${initialsText}`);
  ok("...and no photo", (await officerPage.locator('[data-app-header] img[data-header-avatar="photo"]').count()) === 0);
  await officerPage.close();

  // ------------------------------------------------------------ the student
  const sp = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  await sp.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await sp
    .waitForFunction(
      () =>
        Boolean(
          document.querySelector('input[name="email"]') && Object.keys(document.querySelector('input[name="email"]')).some((k) => k.startsWith("__reactFiber")),
        ),
      null,
      { timeout: 60000 },
    )
    .catch(() => {});
  await sp.fill('input[name="email"]', STUDENT_EMAIL);
  await sp.fill('input[type="password"]', FIXTURE_PASSWORD);
  await sp.click('button[type="submit"]');
  await sp.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 40000 });

  await sp.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded" });
  const studentBar = await drawn(sp, '[data-app-header] img[data-header-avatar="photo"]');
  ok("a student sees their own photo in the top bar, at 48", is(studentBar, 48), JSON.stringify(studentBar));
  ok("...theirs", (await sp.locator('[data-app-header] img[data-header-avatar="photo"]').getAttribute("src"))?.includes(`${studentId}/photo-zztmp`));
  const team = await drawn(sp, "img[data-team-photo]");
  ok("their counsellor's card on the Dashboard is 88", is(team, 88), JSON.stringify(team));

  await sp.goto(`${BASE}/portal/messages`, { waitUntil: "domcontentloaded" });
  const messages = await drawn(sp, "[data-message-counsellor] img");
  ok("their counsellor on Messages is 56", is(messages, 56), JSON.stringify(messages));

  await sp.goto(`${BASE}/portal/profile`, { waitUntil: "domcontentloaded" });
  const own = await drawn(sp, 'img[alt="Profile photo"]');
  ok("their photo on their profile is 120", is(own, 120), JSON.stringify(own));
} catch (e) {
  ok("the run finished", false, e?.stack ?? String(e));
} finally {
  await browser?.close().catch(() => {});
  // Test files only, uploaded above: nothing points at them once the fixtures go.
  if (uploaded.length) await admin.storage.from("documents").remove(uploaded);
  const removed = await fx.cleanup();
  if (studentUserId) await admin.auth.admin.deleteUser(studentUserId).catch(() => {});
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
