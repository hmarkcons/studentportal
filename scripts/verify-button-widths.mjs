// Every button as wide as its text, across the portal as it really renders.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:buttons
//   PORTAL_URL=http://localhost:3000 ...      (against a local `next start`)
//
// Why a browser check and not a lint rule: a stretched button is almost never
// the button's own doing. A flex column or a grid cell stretches whatever it
// holds, so the Save on a student's profile ran the width of the page while
// its own classes said nothing about width at all (and the justify-self-start
// meant to stop it is a grid property, inert in the flex column it sat in).
// Only the rendered layout can tell.
//
// Signs in as a Super Admin and as a registered student, visits every page
// their navigation links to plus a few detail pages, and for each visible
// button compares its width with its content's own width (measured by setting
// width: max-content for an instant). More than 16px wider is stretched.
//
// Exempt, because full width is what they are: rows of a menu (role="menu"
// or [data-menu]) and anything inside [data-full-width].
//
// Also asserts one Save end to end: pressing it shows the confirmation beside
// the button, which is the other half of the same request.
import { BASE, FIXTURE_PASSWORD, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:buttons");

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();
const SLACK_PX = 16;

/** Every stretched button on the page, as `text (width vs content)`. */
async function stretchedButtons(page) {
  return page.evaluate((slack) => {
    const found = [];
    for (const el of document.querySelectorAll("button, input[type=submit], [role=button]")) {
      if (!(el instanceof HTMLElement) || el.offsetParent === null) continue;
      if (el.closest('[role="menu"], [data-menu], [data-full-width]')) continue;
      const width = el.getBoundingClientRect().width;
      if (width === 0) continue;
      const saved = [el.style.width, el.style.flex, el.style.minWidth, el.style.maxWidth];
      el.style.width = "max-content";
      el.style.flex = "none";
      el.style.minWidth = "0";
      el.style.maxWidth = "none";
      const natural = el.getBoundingClientRect().width;
      [el.style.width, el.style.flex, el.style.minWidth, el.style.maxWidth] = saved;
      if (width - natural > slack) {
        const text = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("value") || "?").trim().replace(/\s+/g, " ");
        found.push(`"${text.slice(0, 40)}" ${Math.round(width)}px for ${Math.round(natural)}px`);
      }
    }
    return found;
  }, SLACK_PX);
}

/** The pages a portal's navigation links to, same-origin and deduplicated. */
async function navPages(page, prefix) {
  const hrefs = await page.evaluate(() => [...document.querySelectorAll("nav a[href], aside a[href]")].map((a) => a.getAttribute("href")));
  return [...new Set(hrefs.filter((h) => h && h.startsWith(prefix) && !h.includes("#")))].sort();
}

async function sweep(page, label, paths) {
  let clean = 0;
  for (const path of paths) {
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 60_000 });
    } catch {
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    }
    // Open every collapsed section, so the forms inside them are measured too.
    await page.evaluate(() => {
      document.querySelectorAll("details:not([open])").forEach((d) => (d.open = true));
      document
        .querySelectorAll('[data-collapsible-toggle][aria-expanded="false"]')
        .forEach((b) => b instanceof HTMLElement && b.click());
    });
    await page.waitForTimeout(300);
    const stretched = await stretchedButtons(page);
    if (stretched.length === 0) clean += 1;
    ok(`${label} ${path}: no stretched buttons`, stretched.length === 0, stretched.join("; "));
  }
  return clean;
}

try {
  // ------------------------------------------------------------ fixtures
  const superUser = await fx.staff("btnsuper", ["super_admin"]);

  const { data: destination } = await admin
    .from("destinations").select("id").eq("status", "active").order("display_name").limit(1).single();
  const studentLead = await fx.lead({
    full_name: "zztmp btnstudent",
    status: "registered",
    registration_status: "registered",
    registered_at: new Date().toISOString(),
    intake: "Fall 2099",
    // Required by the profile form; without it the browser refuses the submit
    // before the app ever sees it, and the Save test below reads as broken.
    date_of_birth: "2000-01-15",
  });
  await admin.from("lead_destinations").insert({ lead_id: studentLead, destination_id: destination.id, is_backup: false });
  let coded = false;
  for (let i = 0; i < 20 && !coded; i++) {
    const { data } = await admin.from("leads").select("student_code").eq("id", studentLead).single();
    coded = Boolean(data?.student_code);
    if (!coded) await new Promise((r) => setTimeout(r, 500));
  }
  if (!coded) throw new Error("the fixture student never got a Student ID, so cannot reach the portal");
  const studentEmail = "zztmp-btnstudent@hmark-test.local";
  const { data: made, error: madeError } = await admin.auth.admin.createUser({
    email: studentEmail, password: FIXTURE_PASSWORD, email_confirm: true,
  });
  if (madeError) throw new Error(`could not create the student login: ${madeError.message}`);
  var studentAuthId = made.user.id;
  await admin.from("leads").update({ auth_user_id: studentAuthId, portal_active: true }).eq("id", studentLead);

  const browser = await openBrowser();

  // ------------------------------------------------------------- staff
  const staffPage = await signIn(browser, superUser.email);
  const staffPaths = await navPages(staffPage, "/");
  const { data: someUniversity } = await admin.from("universities").select("id").limit(1).single();
  const extra = [`/students/${studentLead}`, `/students/${studentLead}/profile`, `/setup/universities/${someUniversity.id}`];
  console.log(`staff: ${staffPaths.length + extra.length} pages`);
  await sweep(staffPage, "staff", [...staffPaths.filter((p) => !p.startsWith("/portal")), ...extra]);

  // ------------------------------------------------ one Save, end to end
  // The profile the office pointed at: its Save ran the width of the page.
  await staffPage.goto(`${BASE}/students/${studentLead}/profile`, { waitUntil: "domcontentloaded" });
  await staffPage.waitForLoadState("networkidle").catch(() => {});
  await staffPage.evaluate(() =>
    document
      .querySelectorAll('[data-collapsible-toggle][aria-expanded="false"]')
      .forEach((b) => b instanceof HTMLElement && b.click())
  );
  // That form's own Save — the page has others (credentials, registration).
  const save = staffPage
    .locator('form:has(input[name="date_of_birth"])')
    .getByRole("button", { name: "Save", exact: true });
  if (await save.count()) {
    await save.click();
    const status = staffPage.locator('[data-action-status="done"]').first();
    // Either answer ends the wait; only the confirmation passes. An error is
    // printed, because "no Saved." and "the save was refused" need different fixes.
    const refusal = staffPage.locator('form .text-danger, form [role="alert"]').first();
    await Promise.race([status.waitFor({ timeout: 60_000 }), refusal.waitFor({ timeout: 60_000 })]).catch(() => {});
    const shown = await status.isVisible();
    ok("pressing Save says so beside the button", shown, shown ? "" : (await refusal.innerText().catch(() => "no answer within 60s")).slice(0, 300));
    if (shown) {
      const [b, s] = await Promise.all([save.boundingBox(), status.boundingBox()]);
      ok("...on the same line, to its right",
        b && s && Math.abs(b.y + b.height / 2 - (s.y + s.height / 2)) < b.height && s.x >= b.x + b.width - 1,
        JSON.stringify({ b, s }));
    }
  } else {
    const names = await staffPage.getByRole("button").allInnerTexts();
    ok("the student profile has a Save button to press", false, names.join(" | ").slice(0, 400));
  }
  await staffPage.close();

  // ----------------------------------------------------------- student
  const studentPage = await signIn(browser, studentEmail, { landing: "/portal" }).catch(async () => {
    const context = await browser.newContext();
    const p = await context.newPage();
    await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await p.fill('input[name="email"]', studentEmail);
    await p.fill('input[name="password"]', FIXTURE_PASSWORD);
    await p.click('button[type="submit"]');
    await p.waitForURL((u) => u.pathname.startsWith("/portal"), { timeout: 60_000 });
    return p;
  });
  await studentPage.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded" });
  const studentPaths = await navPages(studentPage, "/portal");
  console.log(`student: ${studentPaths.length} pages`);
  await sweep(studentPage, "student", studentPaths.length ? studentPaths : ["/portal"]);

  // ------------------------------------------------------ signed out
  const anon = await (await browser.newContext()).newPage();
  await sweep(anon, "public", ["/login", "/register/partner"]);

  await browser.close();
} finally {
  // The lead first: it points at the login, and the login cannot be deleted
  // while it does. The other way round left the login behind and blocked
  // the next run from creating it.
  const removed = await fx.cleanup();
  if (typeof studentAuthId !== "undefined") {
    const { error } = await admin.auth.admin.deleteUser(studentAuthId);
    if (error) console.log(`could not remove the fixture student login: ${error.message}`);
  }
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
