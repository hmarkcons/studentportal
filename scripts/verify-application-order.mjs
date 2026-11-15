// A registered student's applications: the submitted first, the first
// submitted on top and the last at the end of them, then the rest — on the
// staff Applications tab and on the student's own Applications page alike:
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:apporder
//
// Five applications, made in the order P1, S2, S1, R, P2. S1 is submitted,
// then S2, then S1 moves on to Under Review (still first submitted); R is
// submitted and then rejected. Expected:
//   staff:   S1, S2, then the office's rule — P1, P2 (in progress), R (rejected)
//   student: S1, S2, then in the order they were added — P1, R, P2
//
// Everything is named zztmp and removed in a finally.
import { BASE, FIXTURE_PASSWORD, clients, fixtures, openBrowser, removeStagedFiles, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:apporder");

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const RUN = Date.now().toString(36);
const STUDENT_EMAIL = `zztmp-apporder-${RUN}@hmark-test.local`;
const UNI = `zztmp Order University ${RUN}`;
const NAMES = ["P1", "S2", "S1", "R", "P2"];
const programme = (k) => `zztmp Order ${k} ${RUN}`;

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function poll(fn, seconds = 45, every = 500) {
  const until = Date.now() + seconds * 1000;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v || Date.now() > until) return v;
    await pause(every);
  }
}

let browser = null;
let studentId = null;
let studentUserId = null;
let universityId = null;

try {
  const proc = await fx.staff(`apporder${RUN}`, ["processing"]);
  const { data: italy } = await admin.from("destinations").select("id, display_name, pipeline_stages").eq("display_name", "Italy (Public)").single();
  for (const s of ["documents_pending", "documents_verified", "application_submitted", "under_review"]) {
    if (!italy.pipeline_stages.includes(s)) throw new Error(`Italy (Public)'s pipeline has no ${s}: ${italy.pipeline_stages.join(", ")}`);
  }
  studentId = await fx.lead({
    full_name: `zztmp App Order ${RUN}`, email: STUDENT_EMAIL, contact_number: "0300-9999945",
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

  const { data: uni, error: uniError } = await admin.from("universities").insert({ destination_id: italy.id, name: UNI, city: "zztmp City", type: "public" }).select("id").single();
  if (uniError) throw new Error(`university: ${uniError.message}`);
  universityId = uni.id;
  const app = {};
  for (const k of NAMES) {
    const { data: prog } = await admin.from("programs").insert({ university_id: uni.id, level: "masters", name: programme(k) }).select("id").single();
    const { data: row, error } = await admin.from("applications")
      .insert({ student_id: studentId, university_id: uni.id, program_id: prog.id, intake: "Fall 2099", current_stage: k === "P2" ? "documents_verified" : "documents_pending" })
      .select("id").single();
    if (error) throw new Error(`application ${k}: ${error.message}`);
    app[k] = row.id;
    await pause(300);
  }
  const stage = async (k, s) => {
    const { error } = await admin.from("applications").update({ current_stage: s }).eq("id", app[k]);
    if (error) throw new Error(`${k} → ${s}: ${error.message}`);
    await pause(1200);
  };
  await stage("S1", "application_submitted");
  await stage("S2", "application_submitted");
  await stage("S1", "under_review");
  await stage("R", "application_submitted");
  await stage("R", "rejected");

  const orderOf = (texts) => texts.map((t) => NAMES.find((k) => t.includes(programme(k)))).filter(Boolean);

  // ------------------------------------------------------------ staff
  browser = await openBrowser();
  const page = await signIn(browser, proc.email);
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto(`${BASE}/students/${studentId}/applications`, { waitUntil: "domcontentloaded" });
  await page.locator("tbody tr[data-row]").first().waitFor({ timeout: 120000 });
  await poll(async () => ((await page.locator("tbody tr[data-row]").count()) >= NAMES.length ? true : null), 30);
  const staffOrder = orderOf(await page.locator("tbody tr[data-row]").allTextContents());
  ok("staff: submitted first, the first submitted on top", JSON.stringify(staffOrder.slice(0, 2)) === JSON.stringify(["S1", "S2"]), staffOrder.join(", "));
  ok("staff: then the rest by the office's rule — in progress, then rejected", JSON.stringify(staffOrder) === JSON.stringify(["S1", "S2", "P1", "P2", "R"]), staffOrder.join(", "));

  // ------------------------------------------------------------ the student
  const sp = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  await sp.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await sp.waitForFunction(() => Boolean(document.querySelector('input[name="email"]') && Object.keys(document.querySelector('input[name="email"]')).some((k) => k.startsWith("__reactFiber"))), null, { timeout: 60000 }).catch(() => {});
  await sp.fill('input[name="email"]', STUDENT_EMAIL);
  await sp.fill('input[type="password"]', FIXTURE_PASSWORD);
  await sp.click('button[type="submit"]');
  await sp.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 40000 });
  await sp.goto(`${BASE}/portal/applications`, { waitUntil: "domcontentloaded" });
  await sp.locator("[data-applications]").waitFor({ timeout: 60000 });
  const studentOrder = orderOf(await sp.locator("[data-applications] > div").allTextContents());
  ok("student: submitted first, the first submitted on top", JSON.stringify(studentOrder.slice(0, 2)) === JSON.stringify(["S1", "S2"]), studentOrder.join(", "));
  ok("student: then the rest in the order they were added", JSON.stringify(studentOrder) === JSON.stringify(["S1", "S2", "P1", "R", "P2"]), studentOrder.join(", "));

  // ------------------------------------------------------------ a third submission goes last among the submitted
  await stage("P2", "application_submitted");
  await page.goto(`${BASE}/students/${studentId}/applications`, { waitUntil: "domcontentloaded" });
  await page.locator("tbody tr[data-row]").first().waitFor({ timeout: 120000 });
  await poll(async () => ((await page.locator("tbody tr[data-row]").count()) >= NAMES.length ? true : null), 30);
  const staffAfter = orderOf(await page.locator("tbody tr[data-row]").allTextContents());
  ok("staff: the last submitted joins the end of the submitted", JSON.stringify(staffAfter) === JSON.stringify(["S1", "S2", "P2", "P1", "R"]), staffAfter.join(", "));
  await sp.goto(`${BASE}/portal/applications`, { waitUntil: "domcontentloaded" });
  await sp.locator("[data-applications]").waitFor({ timeout: 60000 });
  const studentAfter = orderOf(await sp.locator("[data-applications] > div").allTextContents());
  ok("student: the same", JSON.stringify(studentAfter) === JSON.stringify(["S1", "S2", "P2", "P1", "R"]), studentAfter.join(", "));
} catch (e) {
  ok("the run finished", false, e?.stack ?? String(e));
} finally {
  await browser?.close().catch(() => {});
  if (studentUserId) {
    await removeStagedFiles(admin, studentUserId);
    await admin.from("notifications").delete().eq("user_id", studentUserId);
    await admin.auth.admin.deleteUser(studentUserId).catch(() => {});
  }
  if (universityId) {
    await admin.from("applications").delete().eq("university_id", universityId);
    await admin.from("programs").delete().eq("university_id", universityId);
    await admin.from("universities").delete().eq("id", universityId);
  }
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
