// Where signing in lands (src/lib/signInLanding.ts), end to end against a portal:
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:signinlanding
//
//   * staff of every role, signing in, land on their own Dashboard — and so
//     does one who opened Reports, a list of leads or a report signed out,
//     as a browser that remembers portal…/reports does;
//   * a link to one record (a student's page) opens after sign-in, and so do
//     a link the portal emailed (marked via=email, the mark dropped on the
//     way) and the office QR check-in;
//   * a student lands on their portal Dashboard, from a section's page too;
//   * "next" never takes anyone off the site.
//
// Everything is named zztmp and removed in a finally.
import { BASE, FIXTURE_PASSWORD, clients, fixtures, openBrowser, reporter, requireConfirmation } from "./verify-portal-lib.mjs";

requireConfirmation("check:signinlanding");

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();
const RUN = Date.now().toString(36);
const STUDENT_EMAIL = `zztmp-landing-${RUN}@hmark-test.local`;

async function poll(fn, seconds = 30, every = 500) {
  const until = Date.now() + seconds * 1000;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v || Date.now() > until) return v;
    await new Promise((r) => setTimeout(r, every));
  }
}

/** Opens `start` signed out, signs in on the page it is sent to, and says where that ends up once the address settles. */
async function landing(browser, email, start) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  try {
    const page = await context.newPage();
    await page.goto(`${BASE}${start}`, { waitUntil: "domcontentloaded" });
    await page
      .waitForFunction(
        () =>
          Boolean(
            document.querySelector('input[name="email"]') &&
            Object.keys(document.querySelector('input[name="email"]')).some((k) => k.startsWith("__reactFiber")),
          ),
        null,
        { timeout: 60000 },
      )
      .catch(() => {});
    await page.fill('input[name="email"]', email);
    await page.fill('input[type="password"]', FIXTURE_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 });
    let last = page.url();
    let still = 0;
    while (still < 6) {
      await page.waitForTimeout(500);
      still = page.url() === last ? still + 1 : 0;
      last = page.url();
    }
    const url = new URL(last);
    return { at: url.pathname + url.search, origin: url.origin };
  } finally {
    await context.close();
  }
}

let browser = null;
let studentUserId = null;

try {
  const roles = [["super_admin"], ["management"], ["counselor"], ["processing"], ["finance"], ["marketing"]];
  const people = [];
  for (const r of roles) people.push(await fx.staff(`landing${r[0].replace(/_/g, "")}${RUN}`, r));
  const counsellor = people[2];

  const { data: italy } = await admin.from("destinations").select("id, display_name").eq("display_name", "Italy (Public)").single();
  // An intake, so the student has a Student ID and a portal.
  const studentId = await fx.lead({
    full_name: `zztmp Landing Student ${RUN}`,
    email: STUDENT_EMAIL,
    contact_number: "0300-9999995",
    status: "registered",
    registration_status: "registered",
    registered_at: new Date().toISOString(),
    date_of_inquiry: new Date().toISOString().slice(0, 10),
    assigned_counselor_id: counsellor.id,
    intake: "Fall 2099",
    level_applying_for: "masters",
    country_of_interest: italy.display_name,
  });
  await admin.from("lead_destinations").insert({ lead_id: studentId, destination_id: italy.id, is_backup: false });
  await poll(async () => (await admin.from("leads").select("student_code").eq("id", studentId).single()).data?.student_code, 20);
  const { data: made, error: authError } = await admin.auth.admin.createUser({ email: STUDENT_EMAIL, password: FIXTURE_PASSWORD, email_confirm: true });
  if (authError) throw new Error(`student login: ${authError.message}`);
  studentUserId = made.user.id;
  await admin.from("leads").update({ auth_user_id: studentUserId, portal_active: true }).eq("id", studentId);

  browser = await openBrowser();

  // ------------------------------------------------------------ staff
  for (const [i, p] of people.entries()) {
    const { at } = await landing(browser, p.email, "/login");
    ok(`${roles[i][0]}: signing in lands on their Dashboard`, at === "/dashboard", at);
  }
  for (const start of ["/reports", "/leads?status=new", "/reports/visa-approval"]) {
    const { at } = await landing(browser, people[1].email, start);
    ok(`opened ${start} signed out: still their Dashboard`, at === "/dashboard", at);
  }
  const record = await landing(browser, counsellor.email, `/students/${studentId}`);
  ok("a link to one student opens that student", record.at === `/students/${studentId}`, record.at);
  const emailed = await landing(browser, people[3].email, "/my-leave?via=email");
  ok("a link the portal emailed opens, without its mark", emailed.at === "/my-leave", emailed.at);
  const qr = await landing(browser, people[3].email, `/attendance/checkin?token=zztmp-not-a-token-${RUN}`);
  ok("the office QR check-in opens, token and all", qr.at === `/attendance/checkin?token=zztmp-not-a-token-${RUN}`, qr.at);
  const away = await landing(browser, people[0].email, `/login?next=${encodeURIComponent("//evil.example/x")}`);
  ok("a next that leaves the site is not followed", away.origin === new URL(BASE).origin && away.at === "/dashboard", JSON.stringify(away));

  // ------------------------------------------------------------ a student
  const student = await landing(browser, STUDENT_EMAIL, "/login");
  ok("a student lands on their portal Dashboard", student.at === "/portal", student.at);
  const section = await landing(browser, STUDENT_EMAIL, "/portal/documents");
  ok("...from a section's page too", section.at === "/portal", section.at);
} catch (e) {
  ok("the run finished", false, e?.stack ?? String(e));
} finally {
  await browser?.close().catch(() => {});
  const removed = await fx.cleanup();
  if (studentUserId) await admin.auth.admin.deleteUser(studentUserId).catch(() => {});
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
