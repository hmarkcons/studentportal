// The audit log's way back (0322), end to end against a deployed portal:
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:audit
//
//   * a Super Admin deletes a student from their page; the student's file is
//     kept (trash/, trashed_files) while the original is gone;
//   * the student is listed on the audit log's Registered students tab as
//     deleted; their deletion opens to the record as it was, says what went
//     with it, and Restore brings back the student, their application and
//     document — the same rows, by id — and the file, byte for byte;
//   * an edit opens to Before / After / Now, flags a field changed again
//     since, and Revert sets back only the field that edit changed;
//   * an addition is taken back with Remove what was added, after a confirm;
//   * a counsellor can neither read the log nor restore, revert or take back
//     anything, by the API or the page;
//   * every tab lists what it should, and the student's page links to their
//     history.
//
// Fixtures are named zztmp and removed in a finally, with their files and the
// kept copies of them.
import { BASE, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn, apiAs } from "./verify-portal-lib.mjs";

requireConfirmation("check:audit");

const { admin, url, anonKey } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const NAME = `zztmp Audit Student ${Date.now().toString(36)}`;
const FILE_BYTES = Buffer.from(`%PDF-1.4\n% zztmp audit restore ${NAME}\n%%EOF\n`);

/** Polls until `fn` returns something truthy, or gives up after `seconds`. */
async function poll(fn, seconds = 30, every = 500) {
  const until = Date.now() + seconds * 1000;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v || Date.now() > until) return v;
    await new Promise((r) => setTimeout(r, every));
  }
}

const hydrated = (page, selector) =>
  page.waitForFunction((s) => {
    const el = document.querySelector(s);
    return Boolean(el && Object.keys(el).some((k) => k.startsWith("__reactProps")));
  }, selector, { timeout: 60000 });

const shot = async (page, name) => {
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/${name}.png`, fullPage: true });
};

async function lastEvent(filter) {
  let q = admin.from("audit_log").select("id, action_type, source_event, changed").order("created_at", { ascending: false }).limit(1);
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  const { data } = await q;
  return data?.[0] ?? null;
}

/** Opens one event of the student's log and waits for its detail. */
async function openEvent(page, studentId, eventId) {
  await page.goto(`${BASE}/admin/audit-log?tab=students&s=${studentId}`, { waitUntil: "domcontentloaded" });
  const row = `[data-audit-event="${eventId}"]`;
  await page.waitForSelector(row, { timeout: 60000 });
  await hydrated(page, row);
  await page.click(row);
  await page.waitForSelector(`[data-audit-detail="${eventId}"]`, { timeout: 60000 });
  return page.locator(`[data-audit-detail="${eventId}"]`);
}

async function messageAfter(page, action) {
  await page.click(`[data-audit-action="${action}"]`);
  const el = page.locator("[data-audit-message]");
  await el.waitFor({ timeout: 60000 });
  return { tone: await el.getAttribute("data-audit-message"), text: await el.innerText() };
}

let browser = null;
let studentId = null;
let filePath = null;

try {
  const sup = await fx.staff("auditsuper", ["super_admin"]);
  const counsellor = await fx.staff("auditcounsel", ["counselor"]);

  // A registered student with an application and a document that has a file.
  const { data: program } = await admin.from("programs").select("id, university_id").limit(1).single();
  studentId = await fx.lead({
    full_name: NAME, contact_number: "0300-9999961", status: "registered", registration_status: "registered",
    registered_at: new Date().toISOString(), date_of_inquiry: new Date().toISOString().slice(0, 10),
  });
  const { data: app, error: appError } = await admin
    .from("applications").insert({ student_id: studentId, university_id: program.university_id, program_id: program.id }).select("id").single();
  if (appError) throw new Error(`application: ${appError.message}`);
  filePath = `${studentId}/zztmp-audit-restore.pdf`;
  const { error: upError } = await admin.storage.from("documents").upload(filePath, FILE_BYTES, { contentType: "application/pdf" });
  if (upError) throw new Error(`file: ${upError.message}`);
  const { data: doc, error: docError } = await admin
    .from("student_documents").insert({ student_id: studentId, category: "zztmp_audit", status: "submitted", file_path: filePath }).select("id").single();
  if (docError) throw new Error(`document: ${docError.message}`);

  browser = await openBrowser();
  const page = await signIn(browser, sup.email);
  page.on("dialog", (d) => d.accept());

  // 1. Deleted from the student's page, as anyone with the right would.
  await page.goto(`${BASE}/students/${studentId}`, { waitUntil: "domcontentloaded" });
  const history = page.locator("[data-audit-history]");
  await history.waitFor({ timeout: 60000 });
  ok("the student's page links a Super Admin to their history", ((await history.getAttribute("href")) ?? "").includes(`s=${studentId}`));
  const del = page.getByRole("button", { name: "Delete student" });
  await del.waitFor({ timeout: 60000 });
  await page.waitForFunction((el) => Object.keys(el).some((k) => k.startsWith("__reactProps")), await del.elementHandle(), { timeout: 60000 });
  await del.click();
  const gone = await poll(async () => (await admin.from("leads").select("id").eq("id", studentId).maybeSingle()).data === null, 60);
  ok("the student is deleted", gone);
  const kept = await poll(async () => {
    const { data } = await admin.from("trashed_files").select("trash_path").eq("bucket", "documents").eq("path", filePath).is("restored_at", null);
    return data?.length ? data : null;
  }, 60);
  ok("their file is kept for 90 days", Boolean(kept));
  const { error: originalGone } = await admin.storage.from("documents").download(filePath);
  ok("and gone from where it was", Boolean(originalGone));

  // 2. Listed as deleted, and restored from its deletion.
  await page.goto(`${BASE}/admin/audit-log?tab=students&q=${encodeURIComponent(NAME)}`, { waitUntil: "domcontentloaded" });
  const subject = page.locator(`[data-audit-subject="${studentId}"]`);
  await subject.waitFor({ timeout: 60000 });
  ok("Registered students lists the deleted student, marked deleted", /Deleted/.test(await subject.innerText()));
  await shot(page, "audit-subjects");

  const deletion = await lastEvent({ entity_type: "leads", entity_id: studentId, action_type: "DELETE" });
  ok("the deletion is in the log", Boolean(deletion));
  await page.goto(`${BASE}/admin/audit-log?tab=students&s=${studentId}`, { waitUntil: "domcontentloaded" });
  const line = page.locator(`[data-audit-event="${deletion.id}"]`);
  await line.waitFor({ timeout: 60000 });
  const lineText = await line.innerText();
  ok("it is one line, led by the student, listing what went with it", /Student/.test(lineText) && /With Document × \d+/.test(lineText) && (await page.locator(`[data-audit-expand="${deletion.id}"]`).count()) === 1, lineText);
  let detail = await openEvent(page, studentId, deletion.id);
  const detailText = await detail.innerText();
  ok("it opens to the record as it was", detailText.includes(NAME) && (await detail.locator('[data-audit-field="full_name"]').count()) === 1);
  ok("and says what was deleted with it", /Application/.test(detailText) && /Document/.test(detailText), detailText.slice(0, 400));
  await shot(page, "audit-deletion");
  const restored = await messageAfter(page, "restore");
  ok("Restore reports the records and the file back", restored.tone === "success" && /Restored/.test(restored.text) && /1 file brought back/.test(restored.text), restored.text);

  const backLead = (await admin.from("leads").select("id, full_name").eq("id", studentId).maybeSingle()).data;
  const backApp = (await admin.from("applications").select("id").eq("id", app.id).maybeSingle()).data;
  const backDoc = (await admin.from("student_documents").select("id, file_path").eq("id", doc.id).maybeSingle()).data;
  ok("the student is back, the same record", backLead?.full_name === NAME);
  ok("with their application and document, by the same ids", Boolean(backApp) && backDoc?.file_path === filePath);
  const { data: file } = await admin.storage.from("documents").download(filePath);
  ok("and the file, byte for byte", Boolean(file) && Buffer.from(await file.arrayBuffer()).equals(FILE_BYTES));
  const { data: restoreEvents } = await admin.from("audit_log").select("id").eq("action_type", "RESTORE").eq("source_event", deletion.id);
  ok("the restore is logged as its own event", (restoreEvents?.length ?? 0) >= 3);

  // 3. An edit: Before / After / Now, a field changed again since, and Revert.
  await admin.from("leads").update({ full_name: `${NAME} Renamed` }).eq("id", studentId);
  const rename = await poll(() => lastEvent({ entity_type: "leads", entity_id: studentId, action_type: "UPDATE" }), 10);
  await admin.from("leads").update({ full_name: `${NAME} Again`, contact_number: "0300-9999962" }).eq("id", studentId);
  await poll(async () => (await lastEvent({ entity_type: "leads", entity_id: studentId, action_type: "UPDATE" }))?.id !== rename.id, 10);
  detail = await openEvent(page, studentId, rename.id);
  const nameRow = detail.locator('[data-audit-field="full_name"]');
  ok("an edit shows the field before", (await nameRow.locator('[data-cell="before"]').innerText()).trim() === NAME);
  ok("after", (await nameRow.locator('[data-cell="then"]').innerText()).trim() === `${NAME} Renamed`);
  const nowCell = await nameRow.locator('[data-cell="now"]').innerText();
  ok("and now, flagged as changed again since", nowCell.includes(`${NAME} Again`) && /changed since/.test(nowCell), nowCell);
  ok("only the field it changed", (await detail.locator("[data-audit-field]").count()) === 1);
  await shot(page, "audit-edit");
  const reverted = await messageAfter(page, "revert");
  ok("Revert reports one field set back", reverted.tone === "success" && /1 field/.test(reverted.text), reverted.text);
  const afterRevert = (await admin.from("leads").select("full_name, contact_number").eq("id", studentId).single()).data;
  ok("the name is what it was before that edit", afterRevert.full_name === NAME, afterRevert.full_name);
  ok("and the later change to another field is left alone", afterRevert.contact_number === "0300-9999962", afterRevert.contact_number);

  // 4. An addition, taken back — only after the confirm.
  const { data: score, error: scoreError } = await admin
    .from("student_test_scores").insert({ student_id: studentId, test_type: "ielts", score: "7.5" }).select("id").single();
  if (scoreError) throw new Error(`test score: ${scoreError.message}`);
  const added = await poll(() => lastEvent({ entity_type: "student_test_scores", entity_id: score.id, action_type: "INSERT" }), 10);
  detail = await openEvent(page, studentId, added.id);
  await page.click('[data-audit-action="remove"]');
  const stillThere = (await admin.from("student_test_scores").select("id").eq("id", score.id).maybeSingle()).data;
  ok("Remove what was added asks first, and removes nothing yet", Boolean(stillThere) && (await page.locator('[data-audit-action="remove-confirm"]').count()) === 1);
  const removed = await messageAfter(page, "remove-confirm");
  ok("then takes the addition back", removed.tone === "success" && (await admin.from("student_test_scores").select("id").eq("id", score.id).maybeSingle()).data === null, removed.text);
  const takenBack = await lastEvent({ entity_type: "student_test_scores", entity_id: score.id, action_type: "DELETE" });
  ok("as a deletion that names what it undid", takenBack?.source_event === added.id);

  // 5. Nobody else.
  const api = await apiAs(url, anonKey, counsellor.email);
  const { data: readable } = await api.from("audit_log").select("id").eq("subject_id", studentId).limit(5);
  ok("a counsellor reads nothing of the log", (readable ?? []).length === 0);
  for (const [fn, event] of [["audit_restore", deletion.id], ["audit_revert", rename.id], ["audit_undo_insert", added.id], ["audit_current_row", rename.id]]) {
    const { error } = await api.rpc(fn, { p_event: event });
    ok(`a counsellor is refused ${fn}`, /Super Admin/.test(error?.message ?? ""), error?.message ?? "no error");
  }
  const { error: subjectsError } = await api.rpc("audit_subjects", { p_kind: "student" });
  ok("and the list of whose changes there are", /Super Admin/.test(subjectsError?.message ?? ""));
  const other = await signIn(browser, counsellor.email);
  await other.goto(`${BASE}/admin/audit-log?tab=students&s=${studentId}`, { waitUntil: "domcontentloaded" });
  await other.waitForLoadState("networkidle").catch(() => {});
  ok("and the page shows them nothing", (await other.locator("[data-audit-subjects], [data-audit-events]").count()) === 0 && !(await other.content()).includes(NAME));

  // 6. Every tab.
  await page.goto(`${BASE}/admin/audit-log?tab=staff&q=${encodeURIComponent(sup.name)}`, { waitUntil: "domcontentloaded" });
  ok("Staff lists a staff member's log", await page.locator(`[data-audit-subject="${sup.id}"]`).waitFor({ timeout: 60000 }).then(() => true, () => false));
  for (const tab of ["universities", "other", "leads"]) {
    await page.goto(`${BASE}/admin/audit-log?tab=${tab}`, { waitUntil: "domcontentloaded" });
    const listed = await page.locator("[data-audit-subject]").first().waitFor({ timeout: 60000 }).then(() => true, () => false);
    ok(`${tab} lists whose changes there are`, listed);
  }
  await page.goto(`${BASE}/admin/audit-log?tab=all`, { waitUntil: "domcontentloaded" });
  ok("All activity lists changes, newest first", await page.locator("[data-audit-event]").first().waitFor({ timeout: 60000 }).then(() => true, () => false));
  await shot(page, "audit-all");
} catch (e) {
  ok("the run finished", false, e?.stack ?? String(e));
} finally {
  await browser?.close().catch(() => {});
  if (filePath) {
    const { data: copies } = await admin.from("trashed_files").select("id, trash_path").eq("path", filePath);
    if (copies?.length) {
      await admin.storage.from("documents").remove(copies.map((c) => c.trash_path));
      await admin.from("trashed_files").delete().in("id", copies.map((c) => c.id));
    }
    await admin.storage.from("documents").remove([filePath]);
  }
  const removedCount = await fx.cleanup();
  process.exitCode = finish(removedCount) ? 1 : 0;
}
