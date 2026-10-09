// Several files to a requirement, each reviewed on its own, and requirements
// that stay deleted (0328) — end to end against a portal:
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:docfiles
//
//   * staff upload one file, then another: two files, each kept under the
//     name it was uploaded with; two chosen together are joined into one PDF
//     that says what it was joined from;
//   * each file is approved or sent back on its own, the requirement sent back
//     while any file is, approved once all are;
//   * the student sees every file by name, and the one sent back with its
//     reason; their next upload replaces only that one, which goes to the
//     history by name; they can remove their own file before it is approved,
//     and not one that is approved;
//   * Download all counts the files, not the requirements;
//   * a requirement deleted from the student's checklist is not added back
//     when the page is opened again, is listed as removed, and comes back
//     with Bring back.
//
// Everything is named zztmp and removed in a finally, with its files.
import { BASE, FIXTURE_PASSWORD, apiAs, clients, fixtures, openBrowser, removeStagedFiles, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:docfiles");

const { admin, url, anonKey } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const RUN = Date.now().toString(36);
const STUDENT = `zztmp Files Student ${RUN}`;
const STUDENT_EMAIL = `zztmp-files-${RUN}@hmark-test.local`;
const REQUIREMENT = `zztmp Passport ${RUN}`;

async function poll(fn, seconds = 45, every = 500) {
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

const { PDFDocument } = await import("pdf-lib");
async function pdf(label) {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]).drawText(`zztmp ${label}`, { x: 50, y: 760, size: 24 });
  return Buffer.from(await doc.save());
}
const file = async (name) => ({ name, mimeType: "application/pdf", buffer: await pdf(name) });

const files = async (docId) => {
  const { data } = await admin.from("student_document_files").select("id, file_name, source_names, status, rejected_reason, uploaded_by_role").eq("document_id", docId).order("uploaded_at");
  return data ?? [];
};
const docStatus = async (docId) => (await admin.from("student_documents").select("status, rejected_reason").eq("id", docId).single()).data;

let browser = null;
let studentId = null;
let studentUserId = null;

try {
  const proc = await fx.staff(`filesproc${RUN}`, ["processing"]);
  const { data: italy } = await admin.from("destinations").select("id, display_name").eq("display_name", "Italy (Public)").single();
  studentId = await fx.lead({
    full_name: STUDENT, email: STUDENT_EMAIL, contact_number: "0300-9999941",
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
  const { data: req } = await admin.from("student_documents").insert({ student_id: studentId, category: "other", custom_name: REQUIREMENT, status: "missing" }).select("id").single();

  browser = await openBrowser();
  const page = await signIn(browser, proc.email);
  await page.setViewportSize({ width: 1400, height: 1100 });
  const openRow = async (id) => {
    await page.goto(`${BASE}/students/${studentId}/documents?doc=${id}`, { waitUntil: "domcontentloaded" });
    const r = page.locator(`[data-document-row="${id}"]`);
    await r.waitFor({ timeout: 120000 });
    await page.waitForFunction((rid) => {
      const input = document.querySelector(`[data-document-row="${rid}"] input[type="file"]`);
      return Boolean(input && Object.keys(input).some((k) => k.startsWith("__reactProps")));
    }, id, { timeout: 60000 });
    return r;
  };
  const staffUpload = async (chosen, count) => {
    const r = await openRow(req.id);
    await r.locator('input[type="file"]').setInputFiles(chosen);
    const button = r.locator("[data-document-upload]").getByRole("button", { name: /Upload|Add file|replacement/ });
    await poll(async () => (await button.isEnabled()) || null, 60);
    await button.click();
    return poll(async () => ((await files(req.id)).length === count ? files(req.id) : null), 60);
  };

  // ------------------------------------------------------------ staff
  let list = await staffUpload([await file("front side.pdf")], 1);
  ok("staff upload a file: kept under the name it was uploaded with", list?.[0]?.file_name === "front side.pdf" && list[0].status === "submitted", JSON.stringify(list));
  list = await staffUpload([await file("back.pdf")], 2);
  ok("another, uploaded on its own, is a second file beside it", list?.map((f) => f.file_name).join("|") === "front side.pdf|back.pdf");
  list = await staffUpload([await file("visa-1.pdf"), await file("visa-2.pdf")], 3);
  const joined = list?.[2];
  ok("two chosen together are joined into one file", Boolean(joined) && /\.pdf$/.test(joined.file_name));
  ok("...which says what it was joined from", JSON.stringify(joined?.source_names) === JSON.stringify(["visa-1.pdf", "visa-2.pdf"]), JSON.stringify(joined));
  let r = await openRow(req.id);
  const shownNames = await r.locator("[data-file-name]").allInnerTexts();
  ok("the page names every file", shownNames.includes("front side.pdf") && shownNames.includes("back.pdf") && shownNames.length === 3, JSON.stringify(shownNames));
  ok("...and the joined one's sources", (await r.locator("[data-file-sources]").innerText()).includes("visa-1.pdf, visa-2.pdf"));
  await shot(page, "staff-files");

  // Each on its own.
  const [front, back, visa] = list;
  await press(page, r.locator(`[data-document-file="${front.id}"]`).getByRole("button", { name: "Approve" }));
  await poll(async () => (await files(req.id)).find((f) => f.id === front.id)?.status === "verified" || null);
  ok("one file approved: the requirement still waits for the others", (await docStatus(req.id))?.status === "submitted");
  r = await openRow(req.id);
  await press(page, r.locator(`[data-document-file="${back.id}"]`).getByRole("button", { name: "Send back" }));
  await r.locator(`[data-document-file="${back.id}"] input`).fill("zztmp The back is blurred");
  await r.locator(`[data-document-file="${back.id}"]`).getByRole("button", { name: "Send back" }).click();
  const sentBack = await poll(async () => {
    const d = await docStatus(req.id);
    return d?.status === "rejected" ? d : null;
  });
  ok("one sent back: the requirement is sent back, with that file's reason", Boolean(sentBack) && sentBack.rejected_reason.includes("back.pdf: zztmp The back is blurred"), JSON.stringify(sentBack));

  // ------------------------------------------------------------ the student
  const sp = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  await sp.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await sp.waitForFunction(() => Boolean(document.querySelector('input[name="email"]') && Object.keys(document.querySelector('input[name="email"]')).some((k) => k.startsWith("__reactFiber"))), null, { timeout: 60000 }).catch(() => {});
  await sp.fill('input[name="email"]', STUDENT_EMAIL);
  await sp.fill('input[type="password"]', FIXTURE_PASSWORD);
  await sp.click('button[type="submit"]');
  await sp.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 40000 });
  const studentRow = async () => {
    // ?guide= opens the section holding it (sections start closed).
    await sp.goto(`${BASE}/portal/documents?guide=${req.id}`, { waitUntil: "domcontentloaded" });
    const row = sp.locator(`[data-document-row="${req.id}"]`);
    await row.waitFor({ timeout: 60000 });
    return row;
  };
  let row = await studentRow();
  const studentNames = await row.locator("[data-file-name]").allInnerTexts();
  ok("the student sees every file by name", ["front side.pdf", "back.pdf"].every((n) => studentNames.includes(n)) && studentNames.length === 3, JSON.stringify(studentNames));
  ok("...the one sent back with its reason", (await row.locator(`[data-document-file="${back.id}"] [data-file-reason]`).innerText()).includes("zztmp The back is blurred"));
  ok("...and no Remove on a file staff uploaded", (await row.getByRole("button", { name: /^Remove / }).count()) === 0);
  await shot(sp, "student-files");

  // Their replacement takes the place of the one sent back.
  await sp.waitForFunction((rid) => {
    const input = document.querySelector(`[data-document-row="${rid}"] input[type="file"]`);
    return Boolean(input && Object.keys(input).some((k) => k.startsWith("__reactProps")));
  }, req.id, { timeout: 60000 });
  await row.locator('input[type="file"]').setInputFiles([await file("back-clear.pdf")]);
  await press(sp, row.getByRole("button", { name: "Submit document" }));
  const replaced = await poll(async () => {
    const l = await files(req.id);
    return l.length === 3 && l.some((f) => f.file_name === "back-clear.pdf") && !l.some((f) => f.id === back.id) ? l : null;
  });
  ok("the student's upload replaces only the file sent back", Boolean(replaced) && replaced.some((f) => f.id === front.id) && replaced.some((f) => f.id === visa.id), JSON.stringify(replaced?.map((f) => f.file_name)));
  ok("...the requirement waiting for review again", (await docStatus(req.id))?.status === "submitted");
  row = await studentRow();
  ok("...and the one replaced is in the history by name", (await row.locator("[data-history-file]").allInnerTexts()).some((t) => t.includes("back.pdf")));

  // Their own, before approval: removable. An approved one: not.
  const clear = replaced.find((f) => f.file_name === "back-clear.pdf");
  sp.on("dialog", (d) => void d.accept());
  await press(sp, row.getByRole("button", { name: "Remove back-clear.pdf" }));
  const removed = await poll(async () => ((await files(req.id)).some((f) => f.id === clear.id) ? null : true));
  ok("the student removes their own file before it is approved", Boolean(removed));
  const api = await apiAs(url, anonKey, STUDENT_EMAIL);
  const { error: refused } = await api.rpc("remove_student_document_file", { p_file_id: front.id });
  ok("...and cannot remove an approved one", Boolean(refused));

  // ------------------------------------------------------------ an earlier version deleted
  page.on("dialog", (d) => void d.accept());
  const archivedBefore = (await admin.from("student_document_archive").select("id, file_path").eq("document_id", req.id)).data ?? [];
  r = await openRow(req.id);
  await press(page, r.locator(`[data-delete-version="${archivedBefore[0]?.id}"]`));
  const versionGone = await poll(async () => ((await admin.from("student_document_archive").select("id").eq("id", archivedBefore[0]?.id)).data?.length === 0 ? true : null));
  ok("staff delete the version that was replaced from the history, at any time", archivedBefore.length === 1 && Boolean(versionGone), JSON.stringify(archivedBefore));
  const versionKept = await poll(async () => ((await admin.from("trashed_files").select("id").eq("path", archivedBefore[0]?.file_path).is("restored_at", null)).data?.length ? true : null), 20);
  ok("...its file kept for 90 days, to restore", Boolean(versionKept));
  row = await studentRow();
  ok("...and the student no longer sees it", (await row.locator("[data-history-file]").count()) === 0);

  // ------------------------------------------------------------ approved once all are
  r = await openRow(req.id);
  await press(page, r.locator(`[data-document-file="${visa.id}"]`).getByRole("button", { name: "Approve" }));
  const approved = await poll(async () => ((await docStatus(req.id))?.status === "verified" ? true : null));
  ok("every file approved: the requirement is approved", Boolean(approved));
  r = await openRow(req.id);
  const downloadLabel = await page.getByRole("button", { name: /Download all/ }).first().innerText();
  ok("Download all counts the files, not the requirements", /\(2\)/.test(downloadLabel), downloadLabel);

  // ------------------------------------------------------------ a deleted requirement stays deleted
  const { data: templated } = await admin.from("student_documents").select("id, template_id").eq("student_id", studentId).not("template_id", "is", null).limit(1);
  const victim = templated?.[0];
  ok("the student has a checklist requirement from a template to delete", Boolean(victim));
  if (victim) {
    r = await openRow(victim.id);
    await press(page, r.getByRole("button", { name: "Remove requirement" }));
    await poll(async () => ((await admin.from("student_documents").select("id").eq("id", victim.id).maybeSingle()).data ? null : true));
    await page.goto(`${BASE}/students/${studentId}/documents`, { waitUntil: "domcontentloaded" });
    await page.locator("[data-removed-requirements]").waitFor({ timeout: 60000 }).catch(() => {});
    const back = await admin.from("student_documents").select("id").eq("student_id", studentId).eq("template_id", victim.template_id);
    ok("a deleted requirement is not added back when the page is opened again", (back.data ?? []).length === 0);
    const removedItem = page.locator("[data-removed-requirement]").first();
    ok("...it is listed as removed", (await page.locator("[data-removed-requirement]").count()) === 1);
    await press(page, removedItem.getByRole("button", { name: "Bring back" }));
    const returned = await poll(async () => {
      const { data } = await admin.from("student_documents").select("id, status").eq("student_id", studentId).eq("template_id", victim.template_id);
      return data?.length ? data[0] : null;
    });
    ok("...and Bring back puts it on the checklist again", returned?.status === "missing");
  }
} catch (e) {
  ok("the run finished", false, e?.stack ?? String(e));
} finally {
  await browser?.close().catch(() => {});
  if (studentId) {
    // Every file the fixture student's documents had, kept or replaced.
    const { data: kept } = await admin.from("student_document_files").select("file_path").eq("student_id", studentId);
    const { data: docs } = await admin.from("student_documents").select("id").eq("student_id", studentId);
    const { data: archived } = docs?.length ? await admin.from("student_document_archive").select("file_path").in("document_id", docs.map((d) => d.id)) : { data: [] };
    const paths = [...(kept ?? []), ...(archived ?? [])].map((f) => f.file_path).filter(Boolean);
    if (paths.length) await admin.storage.from("documents").remove(paths);
    const { data: trashed } = await admin.from("trashed_files").select("id, trash_path").like("path", `${studentId}/%`);
    if (trashed?.length) {
      await admin.storage.from("documents").remove(trashed.map((t) => t.trash_path));
      await admin.from("trashed_files").delete().in("id", trashed.map((t) => t.id));
    }
  }
  if (studentUserId) {
    await removeStagedFiles(admin, studentUserId);
    await admin.auth.admin.deleteUser(studentUserId).catch(() => {});
  }
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
