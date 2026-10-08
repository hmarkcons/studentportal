// Searching the leads and registered students lists by email (0327), end to
// end against a portal:
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:emailsearch
//
//   * a lead is found by their whole email address, underscore and all —
//     the search used to turn an underscore into a space and find nobody;
//   * a registered student is found on both lists by the email on their
//     record, and by the different address they sign in to the portal with;
//   * the search at the top of every page finds them by the sign-in address;
//   * a counsellor who is not theirs does not find them by it;
//   * both search boxes say they search email.
//
// Everything is named zztmp and removed in a finally.
import { BASE, FIXTURE_PASSWORD, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:emailsearch");

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const RUN = Date.now().toString(36);
const LEAD = `zztmp Email Lead ${RUN}`;
const LEAD_EMAIL = `zztmp_under_${RUN}@hmark-test.local`;
const STUDENT = `zztmp Email Student ${RUN}`;
const RECORD_EMAIL = `zztmp-record-${RUN}@hmark-test.local`;
const LOGIN_EMAIL = `zztmp-signin-${RUN}@hmark-test.local`;

/** Whether a list, searched for `q`, shows a row naming `name`. */
async function finds(page, path, q, name) {
  await page.goto(`${BASE}${path}?q=${encodeURIComponent(q)}`, { waitUntil: "domcontentloaded" });
  await page.locator("table").first().waitFor({ timeout: 60000 }).catch(() => {});
  return page.locator("tr", { hasText: name }).first().waitFor({ timeout: 20000 }).then(() => true, () => false);
}

let browser = null;
let studentUserId = null;

try {
  const sup = await fx.staff(`emailsup${RUN}`, ["super_admin"]);
  const stranger = await fx.staff(`emailcou${RUN}`, ["counselor"]);
  await fx.lead({ full_name: LEAD, email: LEAD_EMAIL, contact_number: "0300-9999931", status: "unattended", date_of_inquiry: new Date().toISOString().slice(0, 10) });
  const studentId = await fx.lead({
    full_name: STUDENT, email: RECORD_EMAIL, contact_number: "0300-9999932",
    status: "registered", registration_status: "registered", registered_at: new Date().toISOString(),
    date_of_inquiry: new Date().toISOString().slice(0, 10),
  });
  const { data: made, error } = await admin.auth.admin.createUser({ email: LOGIN_EMAIL, password: FIXTURE_PASSWORD, email_confirm: true });
  if (error) throw new Error(`student login: ${error.message}`);
  studentUserId = made.user.id;
  await admin.from("leads").update({ auth_user_id: studentUserId }).eq("id", studentId);

  browser = await openBrowser();
  const page = await signIn(browser, sup.email);

  ok("a lead is found by their whole email address, underscore and all", await finds(page, "/leads", LEAD_EMAIL, LEAD));
  ok("...and by its first part", await finds(page, "/leads", `zztmp_under_${RUN}`, LEAD));
  const leadsBox = await page.locator('input[placeholder*="email"]').count();
  ok("the leads search box says it searches email", leadsBox > 0);

  ok("a registered student is found by the email on their record", await finds(page, "/students", RECORD_EMAIL, STUDENT));
  ok("...and by the different address they sign in with", await finds(page, "/students", LOGIN_EMAIL, STUDENT));
  ok("the students search box says it searches email", (await page.locator('input[placeholder*="email"]').count()) > 0);
  ok("the leads list finds them by it too", await finds(page, "/leads", LOGIN_EMAIL, STUDENT));
  ok("a lead is not on the registered students list", !(await finds(page, "/students", LEAD_EMAIL, LEAD)));

  const top = await page.evaluate(async (q) => (await fetch(`/api/search?q=${encodeURIComponent(q)}`)).json(), LOGIN_EMAIL);
  ok("the search at the top of every page finds them by the sign-in address", (top.students ?? []).some((s) => s.label === STUDENT), JSON.stringify(top));
  const topLead = await page.evaluate(async (q) => (await fetch(`/api/search?q=${encodeURIComponent(q)}`)).json(), LEAD_EMAIL);
  ok("...and a lead by an address with an underscore", (topLead.students ?? []).some((s) => s.label === LEAD), JSON.stringify(topLead));

  const other = await signIn(browser, stranger.email);
  ok("a counsellor who is not theirs does not find them by it", !(await finds(other, "/students", LOGIN_EMAIL, STUDENT)));
} catch (e) {
  ok("the run finished", false, e?.stack ?? String(e));
} finally {
  await browser?.close().catch(() => {});
  const removed = await fx.cleanup();
  if (studentUserId) await admin.auth.admin.deleteUser(studentUserId).catch(() => {});
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
