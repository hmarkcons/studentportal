// A test's upload follows the documentation tracker, end to end against a portal:
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:testuploads
//
//   * an Italy bachelors student with no test ticked is asked for no test:
//     neither the checklist's CEnT-S nor any scorecard;
//   * ticking IMAT and CEnT-S in the tracker, and saving — no date or score
//     yet — puts "IMAT — scorecard" and the checklist's own CEnT-S on the
//     Documents tab, and CEnT-S once, not twice;
//   * unticking them takes CEnT-S off, and keeps IMAT, which has a file;
//   * a test sat twice (a retest, two scores on the Profile) is one
//     requirement, to hold both scorecards.
//
// Everything is named zztmp and removed in a finally.
import { BASE, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:testuploads");

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();
const RUN = Date.now().toString(36);

async function poll(fn, seconds = 60) {
  for (let i = 0; i < seconds * 2; i++) {
    const v = await fn().catch(() => null);
    if (v) return v;
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

let browser = null;

try {
  const sup = await fx.staff(`testuploads${RUN}`, ["super_admin"]);
  const { data: italy } = await admin.from("destinations").select("id, display_name").eq("display_name", "Italy (Public)").single();
  const { data: uni } = await admin.from("universities").select("id").eq("destination_id", italy.id).limit(1).single();
  const { data: cents } = await admin.from("document_templates").select("id").eq("destination_id", italy.id).eq("name", "CEnT-S").maybeSingle();

  const studentId = await fx.lead({
    full_name: `zztmp Test Uploads ${RUN}`, email: `zztmp-testuploads-${RUN}@example.invalid`,
    status: "registered", registration_status: "registered", registered_at: new Date().toISOString(),
    country_of_interest: italy.display_name, level_applying_for: "bachelors",
  });
  await admin.from("lead_destinations").insert({ lead_id: studentId, destination_id: italy.id });
  // 80%: nothing is pre-ticked, so the tracker starts empty.
  await admin.from("student_qualifications").insert({ student_id: studentId, qualification_type: "high_school", grade_percentage: "80%" });
  const { data: app } = await admin.from("applications").insert({ student_id: studentId, university_id: uni.id }).select("id").single();

  browser = await openBrowser();
  const page = await signIn(browser, sup.email);
  const rows = async () => (await admin.from("student_documents").select("id, template_id, derived_key, custom_name, file_path").eq("student_id", studentId)).data ?? [];
  const openDocuments = async () => {
    await page.goto(`${BASE}/students/${studentId}/documents`, { waitUntil: "domcontentloaded" });
    await page.locator("[data-doc-section]").first().waitFor({ timeout: 120000 });
  };
  const openTracker = async () => {
    await page.goto(`${BASE}/students/${studentId}`, { waitUntil: "domcontentloaded" });
    const header = page.locator('button[aria-expanded="false"]').filter({ hasText: "Documentation tracker" }).first();
    await header.waitFor({ timeout: 60000 });
    await page.waitForFunction(() => {
      const b = [...document.querySelectorAll("button[aria-expanded]")].find((x) => x.textContent?.includes("Documentation tracker"));
      return Boolean(b && Object.keys(b).some((k) => k.startsWith("__reactProps")));
    }, null, { timeout: 30000 });
    await header.click();
    const save = page.getByRole("button", { name: "Save tracker fields" });
    await save.waitFor({ timeout: 30000 });
    return save;
  };
  const tick = (label) => page.locator("label", { hasText: new RegExp(`^${label}$`) }).locator('input[type="checkbox"]').first();
  const ticks = async () =>
    JSON.parse((await admin.from("application_country_extra").select("field_value").eq("application_id", app.id).eq("field_key", "test_status").maybeSingle()).data?.field_value ?? "[]");

  // ------------------------------------------------------------ nothing ticked
  await openDocuments();
  let now = await rows();
  ok("the checklist has a CEnT-S item for Italy bachelors", Boolean(cents));
  ok("with no test ticked, CEnT-S is not asked for", !now.some((r) => r.template_id === cents?.id));
  ok("...nor any scorecard", !now.some((r) => (r.derived_key ?? "").startsWith("test:")));

  // ------------------------------------------------------------ ticked
  let save = await openTracker();
  await tick("IMAT").check();
  await tick("CEnT-S").check();
  await save.click();
  await poll(async () => {
    const t = await ticks();
    return t.includes("IMAT") && t.includes("CEnT-S") ? t : null;
  });
  await openDocuments();
  now = await rows();
  const imat = now.find((r) => r.derived_key === "test:imat");
  ok("ticking IMAT asks for its scorecard straight away, before any date or score", imat?.custom_name === "IMAT — scorecard", JSON.stringify(now.filter((r) => r.derived_key)));
  ok("ticking CEnT-S brings the checklist's own CEnT-S item", now.some((r) => r.template_id === cents?.id));
  ok("...and asks for it once, not also as a scorecard", !now.some((r) => r.derived_key === "test:cent_s"));
  ok("the Documents tab lists IMAT's scorecard", (await page.locator(`[data-document-row="${imat?.id}"]`).count()) === 1 || (await page.getByText("IMAT — scorecard").count()) > 0);

  // A file sent for IMAT, then both unticked.
  const { error: fileError } = await admin.from("student_document_files").insert({
    document_id: imat.id, student_id: studentId, file_path: `${studentId}/documents/${imat.id}/zztmp/imat.pdf`, file_name: "imat.pdf", uploaded_by_role: "student",
  });
  ok("(a file is on record for IMAT)", !fileError, fileError?.message);
  save = await openTracker();
  await tick("IMAT").uncheck();
  await tick("CEnT-S").uncheck();
  await save.click();
  await poll(async () => ((await ticks()).length === 0 ? true : null));
  await openDocuments();
  now = await rows();
  ok("unticking CEnT-S takes its item off, nothing having been sent", !now.some((r) => r.template_id === cents?.id));
  ok("...and IMAT, with a file sent, stays", now.some((r) => r.id === imat.id));

  // ------------------------------------------------------------ retest
  await admin.from("student_test_scores").insert([
    { student_id: studentId, test_type: "ielts", score: "5.5", test_date: "2026-05-01" },
    { student_id: studentId, test_type: "ielts", score: "6.5", test_date: "2026-08-01" },
  ]);
  await openDocuments();
  now = await rows();
  ok("a test sat twice is one requirement, to hold both scorecards", now.filter((r) => r.derived_key === "test:ielts").length === 1, JSON.stringify(now.filter((r) => (r.derived_key ?? "").startsWith("test:"))));
} catch (e) {
  ok("the run finished", false, e?.stack ?? String(e));
} finally {
  await browser?.close().catch(() => {});
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
