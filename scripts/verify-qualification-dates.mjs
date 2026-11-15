// Start and completion dates for each education level (0367) — end to end:
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:academicdates
//
//   * on a registered student's Profile tab, Academics: High School given a
//     start and a completion date, saved and shown;
//   * an additional qualification (a Bachelors) added with its own dates,
//     the completion ahead — studies under way;
//   * a completion before the start is refused, and nothing changes;
//   * the student sees the same dates on their own Profile page.
//
// Everything is named zztmp and removed in a finally.
import { BASE, FIXTURE_PASSWORD, clients, fixtures, openBrowser, removeStagedFiles, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:academicdates");

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const RUN = Date.now().toString(36);
const STUDENT_EMAIL = `zztmp-academic-${RUN}@hmark-test.local`;

async function poll(fn, seconds = 45, every = 500) {
  const until = Date.now() + seconds * 1000;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v || Date.now() > until) return v;
    await new Promise((r) => setTimeout(r, every));
  }
}

const qualification = async (type) =>
  (await admin.from("student_qualifications").select("id, institution_name, start_date, completion_date").eq("student_id", studentId).eq("qualification_type", type).maybeSingle()).data;

let browser = null;
let studentId = null;
let studentUserId = null;

try {
  const proc = await fx.staff(`academic${RUN}`, ["processing"]);
  const { data: italy } = await admin.from("destinations").select("id, display_name").eq("display_name", "Italy (Public)").single();
  studentId = await fx.lead({
    full_name: `zztmp Academic ${RUN}`, email: STUDENT_EMAIL, contact_number: "0300-9999946",
    status: "registered", registration_status: "registered", registered_at: new Date().toISOString(),
    date_of_inquiry: new Date().toISOString().slice(0, 10), processing_officer_id: proc.id, assigned_counselor_id: proc.id,
    date_of_birth: "2002-04-17", address: "12 Test Street, Karachi", intake: "Fall 2099", level_applying_for: "masters",
    country_of_interest: italy.display_name,
  });
  await admin.from("lead_destinations").insert({ lead_id: studentId, destination_id: italy.id, is_backup: false });
  await poll(async () => (await admin.from("leads").select("student_code").eq("id", studentId).single()).data?.student_code, 20);
  const { data: made, error: authError } = await admin.auth.admin.createUser({ email: STUDENT_EMAIL, password: FIXTURE_PASSWORD, email_confirm: true });
  if (authError) throw new Error(`student login: ${authError.message}`);
  studentUserId = made.user.id;
  await admin.from("leads").update({ auth_user_id: studentUserId, portal_active: true }).eq("id", studentId);

  browser = await openBrowser();
  const page = await signIn(browser, proc.email);
  await page.setViewportSize({ width: 1400, height: 1100 });
  const profile = `${BASE}/students/${studentId}/profile`;
  const hydrated = (selector) =>
    page.waitForFunction((sel) => {
      const el = document.querySelector(sel);
      return Boolean(el && Object.keys(el).some((k) => k.startsWith("__reactProps")));
    }, selector, { timeout: 60000 });

  // ------------------------------------------------------------ High School: a start and a completion
  await page.goto(profile, { waitUntil: "domcontentloaded" });
  // High School has no record yet, so it opens as a form.
  const highSchool = page.locator("form").filter({ has: page.locator('input[value="high_school"]') });
  await highSchool.waitFor({ timeout: 120000 });
  await hydrated("form input[value=high_school]");
  ok("the form asks for a start and a completion date", (await highSchool.locator("[data-qualification-start]").count()) === 1 && (await highSchool.locator("[data-qualification-completion]").count()) === 1);
  await highSchool.locator('input[name="institution_name"]').fill(`zztmp College ${RUN}`);
  await highSchool.locator("[data-qualification-start]").fill("2018-09-01");
  await highSchool.locator("[data-qualification-completion]").fill("2020-06-30");
  await highSchool.getByRole("button", { name: "Save" }).click();
  const hs = await poll(async () => {
    const q = await qualification("high_school");
    return q?.start_date ? q : null;
  });
  ok("High School saved with its dates", hs?.start_date === "2018-09-01" && hs.completion_date === "2020-06-30", JSON.stringify(hs));

  await page.goto(profile, { waitUntil: "domcontentloaded" });
  const shownDates = page.locator("[data-qualification-dates]").filter({ hasText: "2018" }).first();
  await shownDates.waitFor({ timeout: 60000 }).catch(() => {});
  ok("...and shown on the profile", /Start: Sep 1, 2018 · Completion: Jun 30, 2020/.test((await shownDates.textContent()) ?? ""), await shownDates.textContent().catch(() => ""));

  // ------------------------------------------------------------ a completion before the start: refused
  await hydrated("[data-qualification-dates]");
  await page.locator("[data-qualification-dates]", { hasText: "2018" }).locator("xpath=ancestor::div[.//button[contains(., 'Edit')]][1]").getByRole("button", { name: "Edit" }).click();
  const editForm = page.locator("form").filter({ has: page.locator('input[value="high_school"]') });
  await editForm.waitFor({ timeout: 30000 });
  await editForm.locator("[data-qualification-completion]").fill("2017-06-30");
  await editForm.getByRole("button", { name: "Save" }).click();
  const refused = await poll(async () => ((await editForm.locator('[role="alert"]').textContent().catch(() => "")) ?? "").includes("before the start") || null, 20);
  ok("a completion before the start is refused, saying why", Boolean(refused));
  const unchanged = await qualification("high_school");
  ok("...and nothing changes", unchanged?.completion_date === "2020-06-30", JSON.stringify(unchanged));

  // ------------------------------------------------------------ a Bachelors under way
  await page.goto(profile, { waitUntil: "domcontentloaded" });
  // Choose the type, then "+ Add qualification" (AddQualificationButton).
  const picker = page.locator("select").filter({ has: page.locator('option[value="bachelors_4yr"]') }).first();
  await picker.waitFor({ timeout: 60000 });
  await page.waitForFunction(() => {
    const el = [...document.querySelectorAll("select")].find((s) => s.querySelector('option[value="bachelors_4yr"]'));
    return Boolean(el && Object.keys(el).some((k) => k.startsWith("__reactProps")));
  }, null, { timeout: 60000 });
  await picker.selectOption("bachelors_4yr");
  await page.getByRole("button", { name: "+ Add qualification" }).click();
  const bach = page.locator("form").filter({ has: page.locator('input[value="bachelors_4yr"]') });
  await bach.waitFor({ timeout: 30000 });
  await bach.locator('input[name="institution_name"]').fill(`zztmp University ${RUN}`);
  await bach.locator("[data-qualification-start]").fill("2025-09-01");
  await bach.locator("[data-qualification-completion]").fill("2029-06-30");
  await bach.getByRole("button", { name: "Save" }).click();
  const b = await poll(async () => {
    const q = await qualification("bachelors_4yr");
    return q?.start_date ? q : null;
  });
  ok("a Bachelors under way, its completion ahead, is saved", b?.start_date === "2025-09-01" && b.completion_date === "2029-06-30", JSON.stringify(b));

  // ------------------------------------------------------------ the student's own Profile
  const sp = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  await sp.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await sp.waitForFunction(() => Boolean(document.querySelector('input[name="email"]') && Object.keys(document.querySelector('input[name="email"]')).some((k) => k.startsWith("__reactFiber"))), null, { timeout: 60000 }).catch(() => {});
  await sp.fill('input[name="email"]', STUDENT_EMAIL);
  await sp.fill('input[type="password"]', FIXTURE_PASSWORD);
  await sp.click('button[type="submit"]');
  await sp.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 40000 });
  await sp.goto(`${BASE}/portal/profile`, { waitUntil: "domcontentloaded" });
  await sp.locator("[data-qualification-dates]").first().waitFor({ timeout: 60000 });
  const studentSees = (await sp.locator("[data-qualification-dates]").allTextContents()).join(" | ");
  ok("the student sees the same dates on their Profile", studentSees.includes("Start: Sep 1, 2018 · Completion: Jun 30, 2020") && studentSees.includes("Start: Sep 1, 2025 · Completion: Jun 30, 2029"), studentSees);
} catch (e) {
  ok("the run finished", false, e?.stack ?? String(e));
} finally {
  await browser?.close().catch(() => {});
  if (studentUserId) {
    await removeStagedFiles(admin, studentUserId);
    await admin.from("notifications").delete().eq("user_id", studentUserId);
    await admin.auth.admin.deleteUser(studentUserId).catch(() => {});
  }
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
