// The login page kept beside every saved login (src/lib/portalLink.ts, 0326),
// end to end against a portal:
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:portallinks
//
//   * on a student's Portal credentials, Gmail's link comes filled in
//     (mail.google.com), saved with the login and opened from "Open login
//     page"; a portal added by name keeps the link typed for it, a bare
//     address given https://; a "javascript:" link is refused;
//   * a link changed with the username and password left blank keeps the
//     username and password (Reveal shows all three);
//   * the WhatsApp message of the logins says "Sign in here" with the link;
//   * an application's university portal login offers the programme's
//     application-portal link from the catalogue;
//   * the student sees "Go to login page" beside their visa appointment login,
//     and can change the link themselves;
//   * an interview login's page is kept, refused by the database when it is
//     not a web address, and shown to the student when the login is shared;
//   * HMARK's own login shows the portal's own sign-in page.
//
// Everything is named zztmp and removed in a finally.
import { BASE, FIXTURE_PASSWORD, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:portallinks");

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const RUN = Date.now().toString(36);
const STUDENT = `zztmp Links Student ${RUN}`;
const STUDENT_EMAIL = `zztmp-links-${RUN}@hmark-test.local`;
const UNI = `zztmp Links University ${RUN}`;
const PORTAL_ON_FILE = `apply.zztmp-${RUN}.example/login`;

async function poll(fn, seconds = 30, every = 500) {
  const until = Date.now() + seconds * 1000;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v || Date.now() > until) return v;
    await new Promise((r) => setTimeout(r, every));
  }
}

async function press(page, locator) {
  await locator.waitFor({ timeout: 60000 });
  await page.waitForFunction((el) => Object.keys(el).some((k) => k.startsWith("__reactProps")), await locator.elementHandle(), { timeout: 60000 });
  await locator.click();
}

const shot = async (page, name) => {
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/${name}.png`, fullPage: true });
};

/** Saves one login field and waits for its answer. */
async function save(page, field, { username = "", password = "", link } = {}) {
  if (username) await field.locator('input[name="username"]').fill(username);
  if (password) await field.locator('input[name="password"]').fill(password);
  if (link !== undefined) await field.locator('input[name="link"]').fill(link);
  await press(page, field.getByRole("button", { name: "Save", exact: true }));
  // Its answer replaces the last one only once it is back: wait out the busy button first.
  await field.locator('button[aria-busy="true"]').waitFor({ timeout: 5000 }).catch(() => {});
  await field.locator('button[aria-busy="true"]').waitFor({ state: "detached", timeout: 45000 }).catch(() => {});
  return poll(async () => {
    const text = await field.innerText();
    return /Saved\.|has to be a web address|Enter a username/.test(text) ? text : null;
  }, 45);
}

const openLink = (field) => field.locator("a", { hasText: "Open login page" }).getAttribute("href").catch(() => null);

let browser = null;
let studentUserId = null;
let universityId = null;
let studentId = null;
let appId = null;

try {
  const proc = await fx.staff(`linksproc${RUN}`, ["processing"]);
  const { data: italy } = await admin.from("destinations").select("id, display_name").eq("display_name", "Italy (Public)").single();
  const { data: uni } = await admin.from("universities").insert({ destination_id: italy.id, name: UNI, city: "zztmp City", type: "public" }).select("id").single();
  universityId = uni.id;
  const { data: program } = await admin.from("programs").insert({ university_id: uni.id, name: `zztmp MSc Links ${RUN}`, level: "masters", application_portal_link: PORTAL_ON_FILE }).select("id").single();

  studentId = await fx.lead({
    full_name: STUDENT, email: STUDENT_EMAIL, contact_number: "0300-9999991",
    status: "registered", registration_status: "registered", registered_at: new Date().toISOString(),
    date_of_inquiry: new Date().toISOString().slice(0, 10), processing_officer_id: proc.id, assigned_counselor_id: proc.id,
    date_of_birth: "2002-04-17", address: "12 Test Street, Karachi", intake: "Fall 2099", level_applying_for: "masters",
    country_of_interest: italy.display_name,
  });
  await admin.from("lead_destinations").insert({ lead_id: studentId, destination_id: italy.id, is_backup: false });
  await poll(async () => (await admin.from("leads").select("student_code").eq("id", studentId).single()).data?.student_code, 20);
  const { data: madeStudent, error: authError } = await admin.auth.admin.createUser({ email: STUDENT_EMAIL, password: FIXTURE_PASSWORD, email_confirm: true });
  if (authError) throw new Error(`student login: ${authError.message}`);
  studentUserId = madeStudent.user.id;
  await admin.from("leads").update({ auth_user_id: studentUserId, portal_active: true }).eq("id", studentId);
  const { data: app } = await admin.from("applications").insert({ student_id: studentId, university_id: uni.id, program_id: program.id, is_finalized: true }).select("id").single();
  appId = app.id;

  browser = await openBrowser();
  const page = await signIn(browser, proc.email);

  // ------------------------------------------------------ Portal credentials
  await page.goto(`${BASE}/students/${studentId}?open=portal-credentials`, { waitUntil: "domcontentloaded" });
  let gmail = page.locator('[data-credential="gmail"]');
  await gmail.waitFor({ timeout: 60000 });
  ok("Gmail's login page comes filled in", (await gmail.locator('input[name="link"]').inputValue()) === "https://mail.google.com/");
  ok("...said to be a suggestion until it is saved", (await gmail.locator("[data-credential-suggested]").count()) === 1);
  const savedGmail = await save(page, gmail, { username: "ayesha.links@gmail.com", password: "G-pass-1" });
  ok("the login saves with its page", /Saved\./.test(savedGmail ?? ""), savedGmail);
  await page.reload({ waitUntil: "domcontentloaded" });
  gmail = page.locator('[data-credential="gmail"]');
  await gmail.waitFor({ timeout: 60000 });
  ok("...and opens from Open login page", (await openLink(gmail)) === "https://mail.google.com/");

  // A blank username and password keep the saved ones; the link changes.
  await save(page, gmail, { link: "https://accounts.google.com/" });
  await press(page, gmail.getByRole("button", { name: "Reveal" }));
  const revealed = await poll(async () => {
    const t = await gmail.innerText();
    return t.includes("Username:") ? t : null;
  });
  ok("a link changed alone keeps the username and password", Boolean(revealed) && revealed.includes("ayesha.links@gmail.com") && revealed.includes("G-pass-1") && revealed.includes("https://accounts.google.com/"), revealed);

  // A portal added by name, with a bare address.
  await page.getByPlaceholder("Portal name (e.g. Visa appointment portal)").fill("zztmp Agency");
  await press(page, page.getByRole("button", { name: "+ Add credential" }));
  const agency = page.locator('[data-credential="zztmp_agency"]');
  await agency.waitFor({ timeout: 15000 });
  const savedAgency = await save(page, agency, { username: "agency-user", password: "A-1", link: `portal.zztmp-agency-${RUN}.example/login` });
  ok("a portal added by name saves with the link typed for it", /Saved\./.test(savedAgency ?? ""), savedAgency);

  // A link that is not one.
  const visa = page.locator('[data-credential="visa_appointment_portal"]');
  const refused = await save(page, visa, { username: "visa-user", password: "V-1", link: "javascript:alert(1)" });
  ok("a javascript: link is refused, and says why", /has to be a web address/.test(refused ?? ""), refused);
  const savedVisa = await save(page, visa, { username: "visa-user", password: "V-1", link: "https://visa.zztmp.example/appointments" });
  ok("...and a real one is kept", /Saved\./.test(savedVisa ?? ""));

  await page.reload({ waitUntil: "domcontentloaded" });
  const agencyAfter = page.locator('[data-credential="zztmp_agency"]');
  await agencyAfter.waitFor({ timeout: 60000 });
  ok("...a bare address given https://", (await openLink(agencyAfter)) === `https://portal.zztmp-agency-${RUN}.example/login`);
  await shot(page, "portal-credentials");

  // The message to WhatsApp: Sign in here.
  const bar = page.locator('[data-send-credentials="section"]');
  await press(page, bar.getByRole("button", { name: /Copy as message/ }));
  await page.locator('[data-credential-choice="gmail"]').waitFor({ timeout: 30000 });
  await page.locator('[data-credential-choice="gmail"]').check();
  await press(page, bar.getByRole("button", { name: /^Copy 1 as a message$/ }));
  await bar.locator("[data-credentials-copied]").waitFor({ timeout: 30000 });
  // Shown already when the browser would not copy it; otherwise asked for.
  if ((await bar.locator("[data-credentials-text]").count()) === 0) await bar.getByRole("button", { name: "Show message" }).click();
  const message = await bar.locator("[data-credentials-text]").inputValue();
  ok("the WhatsApp message says Sign in here with the link", message.includes("Sign in here: https://accounts.google.com/"), message);

  // --------------------------------------------------- the application page
  await page.goto(`${BASE}/students/${studentId}/applications/${app.id}`, { waitUntil: "domcontentloaded" });
  const uniPortal = page.locator('[data-credential="university_portal"]');
  await uniPortal.waitFor({ timeout: 60000 });
  ok("the university portal login offers the programme's application portal", (await uniPortal.locator('input[name="link"]').inputValue()) === `https://${PORTAL_ON_FILE}`);
  await save(page, uniPortal, { username: "uni-user", password: "U-1" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('[data-credential="university_portal"]').waitFor({ timeout: 60000 });
  ok("...and saves it", (await openLink(page.locator('[data-credential="university_portal"]'))) === `https://${PORTAL_ON_FILE}`);

  // ------------------------------------------------- HMARK's own login
  await page.goto(`${BASE}/students/${studentId}?open=registration-portal-access`, { waitUntil: "domcontentloaded" });
  const signInLink = page.locator("[data-hmark-sign-in]").first();
  const shown = await signInLink.waitFor({ timeout: 60000 }).then(() => true, () => false);
  ok("HMARK's own login shows the portal's own sign-in page", shown && (await signInLink.getAttribute("href")) === `${new URL(BASE).origin}/login`);

  // ----------------------------------------------------------- interviews
  const { data: interview } = await admin
    .from("application_interviews")
    .insert({ application_id: app.id, round_label: "First round", status: "scheduled", platform: "other", platform_other: "zztmp platform", confirmed_datetime: new Date(Date.now() + 3 * 86_400_000).toISOString() })
    .select("id")
    .single();
  const { error: badLink } = await admin.from("application_interview_credentials").insert({ interview_id: interview.id, login_username: "x", login_link: "javascript:alert(1)", share_with_student: true });
  ok("the database refuses an interview login page that is not a web address", Boolean(badLink));
  await admin
    .from("application_interview_credentials")
    .insert({ interview_id: interview.id, login_username: "iv-user", login_password: "IV-1", login_link: "https://interviews.zztmp.example/login", share_with_student: true });

  // ------------------------------------------------------------ the student
  const sp = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  await sp.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await sp.waitForFunction(() => Boolean(document.querySelector('input[name="email"]') && Object.keys(document.querySelector('input[name="email"]')).some((k) => k.startsWith("__reactFiber"))), null, { timeout: 60000 }).catch(() => {});
  await sp.fill('input[name="email"]', STUDENT_EMAIL);
  await sp.fill('input[type="password"]', FIXTURE_PASSWORD);
  await sp.click('button[type="submit"]');
  await sp.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 40000 });

  await sp.goto(`${BASE}/portal/visa`, { waitUntil: "domcontentloaded" });
  const go = sp.locator('[data-login-page="visa_appointment_portal"]');
  const goShown = await go.waitFor({ timeout: 60000 }).then(() => true, () => false);
  ok("the student sees Go to login page beside their visa appointment login", goShown && (await go.getAttribute("href")) === "https://visa.zztmp.example/appointments");
  await shot(sp, "student-visa");
  if (goShown) {
    await press(sp, sp.getByRole("button", { name: "I changed this login" }));
    await sp.locator('input[aria-label="Login page link"]').fill("https://visa.zztmp.example/new-login");
    await press(sp, sp.getByRole("button", { name: "Save", exact: true }));
    const moved = await poll(async () => {
      await sp.reload({ waitUntil: "domcontentloaded" });
      const href = await sp.locator('[data-login-page="visa_appointment_portal"]').getAttribute("href", { timeout: 20000 }).catch(() => null);
      return href === "https://visa.zztmp.example/new-login" ? href : null;
    }, 45, 2000);
    ok("...and can change the link themselves, keeping their login", Boolean(moved));
  }

  await sp.goto(`${BASE}/portal/appointments`, { waitUntil: "domcontentloaded" });
  const ivGo = sp.locator("[data-interview-login-page]").first();
  const ivShown = await ivGo.waitFor({ timeout: 60000 }).then(() => true, () => false);
  ok("a shared interview login shows its Go to login page", ivShown && (await ivGo.getAttribute("href")) === "https://interviews.zztmp.example/login");
} catch (e) {
  ok("the run finished", false, e?.stack ?? String(e));
} finally {
  await browser?.close().catch(() => {});
  // Saved logins have no foreign key to go with the student: removed by owner.
  for (const id of [studentId, appId]) if (id) await admin.from("encrypted_credentials").delete().eq("owner_id", id);
  const removed = await fx.cleanup();
  if (universityId) {
    await admin.from("programs").delete().eq("university_id", universityId);
    await admin.from("universities").delete().eq("id", universityId);
  }
  if (studentUserId) await admin.auth.admin.deleteUser(studentUserId).catch(() => {});
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
