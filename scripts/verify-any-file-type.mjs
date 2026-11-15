// Any file type, wherever a file is kept (2026-11-15) — end to end:
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:anyfiletype
//
//   * staff upload a .zip to a requirement on the Documents tab, and the
//     picker no longer filters by type;
//   * the student uploads a .txt to theirs on their Documents page;
//   * both are stored as they are, under their own names, and open;
//   * the 5 MB limit still holds.
//
// Everything is named zztmp and removed in a finally, with its files.
import { BASE, FIXTURE_PASSWORD, clients, fixtures, openBrowser, removeStagedFiles, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:anyfiletype");

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const RUN = Date.now().toString(36);
const STUDENT_EMAIL = `zztmp-anytype-${RUN}@hmark-test.local`;

async function poll(fn, seconds = 45, every = 500) {
  const until = Date.now() + seconds * 1000;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v || Date.now() > until) return v;
    await new Promise((r) => setTimeout(r, every));
  }
}

const filesOf = async (docId) => (await admin.from("student_document_files").select("file_name, file_path, status").eq("document_id", docId)).data ?? [];

let browser = null;
let studentId = null;
let studentUserId = null;

try {
  const proc = await fx.staff(`anytype${RUN}`, ["processing"]);
  const { data: italy } = await admin.from("destinations").select("id, display_name").eq("display_name", "Italy (Public)").single();
  studentId = await fx.lead({
    full_name: `zztmp Any Type ${RUN}`, email: STUDENT_EMAIL, contact_number: "0300-9999944",
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
  const [{ data: staffReq }, { data: studentReq }] = await Promise.all([
    admin.from("student_documents").insert({ student_id: studentId, category: "other", custom_name: `zztmp Archive ${RUN}`, status: "missing" }).select("id").single(),
    admin.from("student_documents").insert({ student_id: studentId, category: "other", custom_name: `zztmp Notes ${RUN}`, status: "missing" }).select("id").single(),
  ]);

  // ------------------------------------------------------------ staff, a .zip
  browser = await openBrowser();
  const page = await signIn(browser, proc.email);
  await page.goto(`${BASE}/students/${studentId}/documents?doc=${staffReq.id}`, { waitUntil: "domcontentloaded" });
  const row = page.locator(`[data-document-row="${staffReq.id}"]`);
  await row.waitFor({ timeout: 120000 });
  await page.waitForFunction((id) => {
    const input = document.querySelector(`[data-document-row="${id}"] input[type="file"]`);
    return Boolean(input && Object.keys(input).some((k) => k.startsWith("__reactProps")));
  }, staffReq.id, { timeout: 60000 });
  ok("the staff picker no longer filters by type", !(await row.locator('input[type="file"]').getAttribute("accept")));
  ok("...and says any file type", ((await row.textContent()) ?? "").includes("Any file type"));
  await row.locator('input[type="file"]').setInputFiles([{ name: "scans.zip", mimeType: "application/zip", buffer: Buffer.from("PK\u0003\u0004 zztmp archive") }]);
  const upload = row.getByRole("button", { name: "Upload" });
  await poll(async () => (await upload.isEnabled()) || null, 60);
  await upload.click();
  const zip = await poll(async () => (await filesOf(staffReq.id))[0] ?? null, 60);
  ok("staff upload a .zip: stored under its own name", zip?.file_name === "scans.zip" && /\.zip$/.test(zip.file_path), JSON.stringify(zip));
  const { data: zipBack } = zip ? await admin.storage.from("documents").download(zip.file_path) : { data: null };
  ok("...as it was sent", Boolean(zipBack) && (await zipBack.text()).includes("zztmp archive"));

  // ------------------------------------------------------------ the student, a .txt
  const sp = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  await sp.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await sp.waitForFunction(() => Boolean(document.querySelector('input[name="email"]') && Object.keys(document.querySelector('input[name="email"]')).some((k) => k.startsWith("__reactFiber"))), null, { timeout: 60000 }).catch(() => {});
  await sp.fill('input[name="email"]', STUDENT_EMAIL);
  await sp.fill('input[type="password"]', FIXTURE_PASSWORD);
  await sp.click('button[type="submit"]');
  await sp.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 40000 });
  await sp.goto(`${BASE}/portal/documents?guide=${studentReq.id}`, { waitUntil: "domcontentloaded" });
  const srow = sp.locator(`[data-document-row="${studentReq.id}"]`);
  await srow.waitFor({ timeout: 60000 });
  ok("the student's Documents page says any type", ((await sp.locator("[data-upload-limit]").first().textContent()) ?? "").includes("of any type"));
  await sp.waitForFunction((id) => {
    const input = document.querySelector(`[data-document-row="${id}"] input[type="file"]`);
    return Boolean(input && Object.keys(input).some((k) => k.startsWith("__reactProps")));
  }, studentReq.id, { timeout: 60000 });
  ok("...and their picker no longer filters by type", !(await srow.locator('input[type="file"]').getAttribute("accept")));
  await srow.locator('input[type="file"]').setInputFiles([{ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("zztmp plain notes") }]);
  const submit = srow.getByRole("button", { name: "Submit document" });
  await poll(async () => (await submit.isEnabled()) || null, 60);
  await submit.click();
  const txt = await poll(async () => (await filesOf(studentReq.id))[0] ?? null, 60);
  ok("the student uploads a .txt: stored under its own name, waiting for review", txt?.file_name === "notes.txt" && txt.status === "submitted", JSON.stringify(txt));

  // ------------------------------------------------------------ the limit holds
  await page.goto(`${BASE}/students/${studentId}/documents?doc=${staffReq.id}`, { waitUntil: "domcontentloaded" });
  await row.waitFor({ timeout: 120000 });
  await page.waitForFunction((id) => {
    const input = document.querySelector(`[data-document-row="${id}"] input[type="file"]`);
    return Boolean(input && Object.keys(input).some((k) => k.startsWith("__reactProps")));
  }, staffReq.id, { timeout: 60000 });
  await row.locator('input[type="file"]').setInputFiles([{ name: "huge.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(5 * 1024 * 1024 + 1024, 1) }]);
  const refused = await poll(async () => (/(over|limit|too large|MB)/i.test((await row.textContent()) ?? "") && !(await row.getByRole("button", { name: /Upload|Add file/ }).isEnabled()) ? true : null), 20);
  ok("a file over 5 MB is still refused, whatever its type", Boolean(refused), ((await row.textContent()) ?? "").slice(0, 300));
} catch (e) {
  ok("the run finished", false, e?.stack ?? String(e));
} finally {
  await browser?.close().catch(() => {});
  if (studentId) {
    const { data: kept } = await admin.from("student_document_files").select("file_path").eq("student_id", studentId);
    const paths = (kept ?? []).map((f) => f.file_path).filter(Boolean);
    if (paths.length) await admin.storage.from("documents").remove(paths);
  }
  if (studentUserId) {
    await removeStagedFiles(admin, studentUserId);
    await admin.from("notifications").delete().eq("user_id", studentUserId);
    await admin.auth.admin.deleteUser(studentUserId).catch(() => {});
  }
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
