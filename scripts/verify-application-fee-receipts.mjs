// Receipts from universities (0365, 0366) — end to end against a portal:
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:feereceipts
//
//   * Processing uploads two receipts chosen together and a third on its own,
//     on the application: three files, each kept as its own, in one approved
//     "Application fee receipt" requirement, stored under the receipts' folder;
//   * hidden from the student until shown — not on their application, not in
//     their Documents, not through the API, not in storage, and no alert;
//   * a partner university never sees them, though it sees the application's
//     other documents and the student's other files;
//   * Management, who may open the application but not file receipts, sees
//     them there read only;
//   * the staff Documents tab has no Receipts - Universities section until the
//     first receipt, then lists them there, by the
//     university's name, read only,
//     pointing back to the application, which keeps them out of its checklist;
//   * "Show to the student" ticked: the student is alerted, and sees them on
//     the application and in Documents › Receipts - Universities, to open only — they
//     can neither add, change nor remove one;
//   * a receipt removed goes to the 90-day trash; hidden again, the student
//     sees nothing; the last one removed takes the requirement with it;
//   * "Documents from the university" files an invoice typed as such with the
//     receipts — never as an acceptance letter — and moves no stage;
//   * and a specific requirement of the university in Other: with a file,
//     approved; with none, asked of the student; named with the university
//     and programme, one university's kept together in the order added.
//
// Everything is named zztmp and removed in a finally, with its files.
import { BASE, FIXTURE_PASSWORD, apiAs, clients, fixtures, openBrowser, removeStagedFiles, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";
import { isFeeReceiptPath } from "../src/lib/applicationFeeReceipts.ts";

requireConfirmation("check:feereceipts");

const { admin, url, anonKey } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const RUN = Date.now().toString(36);
const STUDENT = `zztmp Fee Student ${RUN}`;
const STUDENT_EMAIL = `zztmp-fee-${RUN}@hmark-test.local`;
const PARTNER_EMAIL = `zztmp-fee-partner-${RUN}@hmark-test.local`;
const UNI = `zztmp Fee University ${RUN}`;
const PROGRAMME = `zztmp Fee Programme ${RUN}`;

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

let browser = null;
let studentId = null;
let studentUserId = null;
let partnerUserId = null;
let universityId = null;
let applicationId = null;
const extraPaths = [];

try {
  const proc = await fx.staff(`feeproc${RUN}`, ["processing"]);
  const manager = await fx.staff(`feemgmt${RUN}`, ["management"]);
  const { data: italy } = await admin.from("destinations").select("id, display_name").eq("display_name", "Italy (Public)").single();
  studentId = await fx.lead({
    full_name: STUDENT, email: STUDENT_EMAIL, contact_number: "0300-9999942",
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

  // A partner university that sees its students in full — so what it cannot see is the receipts alone.
  const { data: uni, error: uniError } = await admin.from("universities")
    .insert({ destination_id: italy.id, name: UNI, short_name: "zztmp Fee U", city: "zztmp City", type: "public", student_visibility_mode: "full" })
    .select("id").single();
  if (uniError) throw new Error(`university: ${uniError.message}`);
  universityId = uni.id;
  const { data: programme, error: programmeError } = await admin.from("programs").insert({ university_id: uni.id, level: "masters", name: PROGRAMME }).select("id").single();
  if (programmeError) throw new Error(`programme: ${programmeError.message}`);
  const { data: app, error: appError } = await admin.from("applications").insert({ student_id: studentId, university_id: uni.id, program_id: programme.id, intake: "Fall 2099", current_stage: "documents_pending" }).select("id").single();
  if (appError) throw new Error(`application: ${appError.message}`);
  applicationId = app.id;
  const { data: madePartner, error: partnerError } = await admin.auth.admin.createUser({ email: PARTNER_EMAIL, password: FIXTURE_PASSWORD, email_confirm: true });
  if (partnerError) throw new Error(`partner login: ${partnerError.message}`);
  partnerUserId = madePartner.user.id;
  await admin.from("partner_university_accounts").insert({ id: partnerUserId, university_id: uni.id, staff_name: "zztmp Fee Partner", status: "active" });
  // The controls: a document of the application's the partner does see, and a file of the student's it can open.
  const { data: control } = await admin.from("student_documents")
    .insert({ student_id: studentId, application_id: applicationId, category: "admission", custom_name: `zztmp Transcript ${RUN}`, status: "missing" })
    .select("id").single();
  const controlPath = `${studentId}/zztmp-control/${RUN}.pdf`;
  await admin.storage.from("documents").upload(controlPath, await pdf("control"), { contentType: "application/pdf" });
  extraPaths.push(controlPath);

  const receiptDoc = async () => (await admin.from("student_documents").select("id, status, custom_name, uploaded_by_role, cycle_id").eq("application_id", applicationId).eq("category", "application_fee").maybeSingle()).data;
  const receiptFiles = async (docId) => (await admin.from("student_document_files").select("id, file_name, file_path, source_names, status, uploaded_by_role").eq("document_id", docId).order("uploaded_at").order("created_at")).data ?? [];
  const alerts = async () => (await admin.from("notifications").select("kind, title, link").eq("user_id", studentUserId).in("kind", ["fee_receipt", "document_approved"])).data ?? [];

  // ------------------------------------------------------------ Processing files them
  browser = await openBrowser();
  const page = await signIn(browser, proc.email);
  await page.setViewportSize({ width: 1400, height: 1100 });
  page.on("dialog", (d) => void d.accept());
  const appUrl = `${BASE}/students/${studentId}/applications/${applicationId}`;
  const openCard = async (p = page) => {
    await p.goto(appUrl, { waitUntil: "domcontentloaded" });
    const card = p.locator("[data-fee-receipts]");
    await card.waitFor({ timeout: 120000 });
    return card;
  };
  const upload = async (chosen, count) => {
    const card = await openCard();
    await page.waitForFunction(() => {
      const input = document.querySelector("[data-fee-receipt-upload] input[type=file]");
      return Boolean(input && Object.keys(input).some((k) => k.startsWith("__reactProps")));
    }, null, { timeout: 60000 });
    await card.locator("[data-fee-receipt-upload] input[type=file]").setInputFiles(chosen);
    const button = card.getByRole("button", { name: chosen.length > 1 ? `Upload ${chosen.length} receipts` : "Upload receipt" });
    await poll(async () => (await button.isEnabled()) || null, 60);
    await button.click();
    return poll(async () => {
      const doc = await receiptDoc();
      const list = doc ? await receiptFiles(doc.id) : [];
      return list.length === count ? { doc, list } : null;
    }, 60);
  };

  // No receipt yet: the Documents tab has no Receipts - Universities section at all.
  // Read as shown (innerText): the page's data carries every section's name either way.
  await page.goto(`${BASE}/students/${studentId}/documents`, { waitUntil: "domcontentloaded" });
  await page.getByText("Admission Documents").first().waitFor({ timeout: 120000 });
  ok("before any receipt, the Documents tab shows no Receipts - Universities section", !(await page.evaluate(() => document.body.innerText.includes("Receipts - Universities"))));

  let filed = await upload([await file("receipt-bank.pdf"), await file("receipt-portal.pdf")], 2);
  ok("two receipts chosen together are each kept as a file of their own", filed?.list.map((f) => f.file_name).join("|") === "receipt-bank.pdf|receipt-portal.pdf" && filed.list.every((f) => !f.source_names), JSON.stringify(filed?.list));
  filed = await upload([await file("receipt-later.pdf")], 3);
  ok("a third, uploaded on its own, joins them", filed?.list.map((f) => f.file_name).includes("receipt-later.pdf"));
  const docId = filed?.doc.id;
  const { count: reqCount } = await admin.from("student_documents").select("id", { count: "exact", head: true }).eq("application_id", applicationId).eq("category", "application_fee");
  ok("...all in one requirement, \"Application fee receipt\", approved", reqCount === 1 && filed?.doc.custom_name === "Application fee receipt" && filed.doc.status === "verified" && filed.list.every((f) => f.status === "verified" && f.uploaded_by_role === "staff"), JSON.stringify(filed?.doc));
  ok("...stored in the receipts' folder: <student>/fee-receipts/<application>/", Boolean(filed?.list.length) && filed.list.every((f) => isFeeReceiptPath(f.file_path) && f.file_path.startsWith(`${studentId}/fee-receipts/${applicationId}/`)), JSON.stringify(filed?.list.map((f) => f.file_path)));
  let card = await openCard();
  ok("the application lists the three, unticked: hidden from the student", (await card.locator("[data-fee-receipt]").count()) === 3 && !(await card.locator("[data-fee-receipts-visible] input[type=checkbox]").isChecked()));
  ok("...and keeps them out of its own documents checklist", (await page.locator(`[data-document-row="${docId}"]`).count()) === 0);
  await shot(page, "fee-staff-application");
  const [bank, portal, later] = filed?.list ?? [];

  // ------------------------------------------------------------ hidden from the student
  const student = await apiAs(url, anonKey, STUDENT_EMAIL);
  const studentReads = async () => {
    const { data: docs } = await student.from("student_documents").select("id").eq("application_id", applicationId).eq("category", "application_fee");
    const { data: fls } = await student.from("student_document_files").select("id").eq("document_id", docId);
    return { docs: docs?.length ?? 0, files: fls?.length ?? 0 };
  };
  let reads = await studentReads();
  ok("hidden: the student's API returns neither the requirement nor its files", reads.docs === 0 && reads.files === 0, JSON.stringify(reads));
  const { data: dl1, error: dl1Error } = await student.storage.from("documents").download(bank.file_path);
  ok("...nor the file itself, from storage", !dl1 && Boolean(dl1Error));
  const { error: signedError } = await student.storage.from("documents").createSignedUrl(bank.file_path, 60);
  ok("...nor a link to it", Boolean(signedError));
  const { data: ownControl } = await student.storage.from("documents").download(controlPath);
  ok("...while their other files open as before", Boolean(ownControl));
  ok("...and no alert about them", (await alerts()).length === 0, JSON.stringify(await alerts()));

  const sp = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  await sp.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await sp.waitForFunction(() => Boolean(document.querySelector('input[name="email"]') && Object.keys(document.querySelector('input[name="email"]')).some((k) => k.startsWith("__reactFiber"))), null, { timeout: 60000 }).catch(() => {});
  await sp.fill('input[name="email"]', STUDENT_EMAIL);
  await sp.fill('input[type="password"]', FIXTURE_PASSWORD);
  await sp.click('button[type="submit"]');
  await sp.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 40000 });
  const portalApp = async () => {
    await sp.goto(`${BASE}/portal/applications/${applicationId}`, { waitUntil: "domcontentloaded" });
    await sp.locator("[data-documents-pointer]").waitFor({ timeout: 60000 });
  };
  const portalDocs = async () => {
    await sp.goto(`${BASE}/portal/documents?guide=${docId}`, { waitUntil: "domcontentloaded" });
    await sp.locator("[data-upload-limit]").first().waitFor({ timeout: 60000 });
  };
  await portalApp();
  ok("hidden: not on the student's application page", (await sp.locator("[data-fee-receipts]").count()) === 0);
  await portalDocs();
  ok("...nor on their Documents page", (await sp.locator(`[data-document-row="${docId}"]`).count()) === 0);

  // ------------------------------------------------------------ a partner never
  const partner = await apiAs(url, anonKey, PARTNER_EMAIL);
  const partnerReads = async () => {
    const { data } = await partner.from("student_documents").select("id, category").eq("application_id", applicationId);
    return data ?? [];
  };
  let seen = await partnerReads();
  ok("the partner university sees the application's other documents", seen.some((d) => d.id === control?.id), JSON.stringify(seen));
  ok("...but not its fee receipts", !seen.some((d) => d.category === "application_fee"));
  const { data: partnerControl } = await partner.storage.from("documents").download(controlPath);
  const { data: partnerReceipt } = await partner.storage.from("documents").download(bank.file_path);
  ok("...and opens the student's other files, but not a receipt", Boolean(partnerControl) && !partnerReceipt);

  // ------------------------------------------------------------ Management, read only
  const cp = await signIn(browser, manager.email);
  await cp.setViewportSize({ width: 1400, height: 1100 });
  const cCard = await openCard(cp);
  await cCard.locator("[data-fee-receipt]").first().waitFor({ timeout: 30000 }).catch(() => {});
  ok("Management sees the receipts on the application", (await cCard.locator("[data-fee-receipt]").count()) === 3);
  ok("...read only: no upload, no Remove, no switch", (await cCard.locator("[data-fee-receipt-upload]").count()) === 0 && (await cCard.getByRole("button", { name: /^Remove / }).count()) === 0 && (await cCard.locator("input[type=checkbox]").count()) === 0);
  ok("...told they are hidden from the student", ((await cCard.locator("[data-fee-receipts-visible]").getAttribute("data-fee-receipts-visible")) ?? "") === "hidden");
  await cp.close();

  // ------------------------------------------------------------ the staff Documents tab
  await page.goto(`${BASE}/students/${studentId}/documents?doc=${docId}`, { waitUntil: "domcontentloaded" });
  const row = page.locator(`[data-document-row="${docId}"]`);
  await row.waitFor({ timeout: 120000 });
  ok("the Documents tab lists them as one requirement under Receipts - Universities", (await row.getAttribute("data-fee-receipt-row")) !== null && (await page.evaluate(() => document.body.innerText.includes("Receipts - Universities"))));
  ok("...named for the university", ((await row.locator("p").first().textContent()) ?? "").trim().endsWith(UNI) && !((await row.textContent()) ?? "").includes("Application fee receipt"), await row.locator("p").first().textContent());
  ok("...each file by name", (await row.locator("[data-file-name]").allTextContents()).sort().join("|") === "receipt-bank.pdf|receipt-later.pdf|receipt-portal.pdf");
  ok("...read only: no upload, no review, no remove there", (await row.locator("input[type=file]").count()) === 0 && (await row.getByRole("button").count()) === 0);
  ok("...pointing to the application, and saying they are hidden", ((await row.locator("[data-fee-receipt-application]").getAttribute("href")) ?? "").endsWith(`/applications/${applicationId}`) && (await row.locator("[data-receipts-shown]").getAttribute("data-receipts-shown")) === "no");
  await shot(page, "fee-staff-documents");

  // ------------------------------------------------------------ shown to the student
  card = await openCard();
  await press(page, card.locator("[data-fee-receipts-visible] input[type=checkbox]"));
  const shown = await poll(async () => ((await admin.from("applications").select("fee_receipts_visible").eq("id", applicationId).single()).data?.fee_receipts_visible ? true : null));
  ok("ticking \"Show to the student\" shows them", Boolean(shown));
  const told = await poll(async () => {
    const a = (await alerts()).filter((n) => n.kind === "fee_receipt");
    return a.length ? a : null;
  }, 30);
  ok("...and the student is told, once, with a link to the application", told?.length === 1 && told[0].title.includes(UNI) && told[0].link === `/portal/applications/${applicationId}`, JSON.stringify(told));
  ok("...with no \"document approved\" alert beside it", !(await alerts()).some((n) => n.kind === "document_approved"));
  reads = await studentReads();
  ok("shown: the student's API returns the requirement and its three files", reads.docs === 1 && reads.files === 3, JSON.stringify(reads));
  const { data: dl2 } = await student.storage.from("documents").download(bank.file_path);
  ok("...and the file opens", Boolean(dl2) && dl2.size > 100);
  await portalApp();
  const portalCard = sp.locator("[data-fee-receipts]");
  ok("the student sees them on the application, each a link", (await portalCard.count()) === 1 && (await portalCard.locator("[data-fee-receipt] a[href]").count()) === 3);
  await shot(sp, "fee-student-application");
  await portalDocs();
  const sRow = sp.locator(`[data-document-row="${docId}"]`);
  await sRow.waitFor({ timeout: 30000 }).catch(() => {});
  ok("...and in their Documents, each file by name", (await sRow.locator("[data-file-name]").count()) === 3);
  ok("...under the university's name", ((await sRow.textContent()) ?? "").includes(UNI) && !((await sRow.textContent()) ?? "").includes("Application fee receipt"));
  ok("...to open only: no upload and no Remove", (await sRow.locator("input[type=file]").count()) === 0 && (await sRow.getByRole("button", { name: /^Remove / }).count()) === 0);
  await shot(sp, "fee-student-documents");

  // They cannot add, change or remove one, however they ask.
  const { error: putError } = await student.storage.from("documents").upload(`${studentId}/fee-receipts/${applicationId}/zz/mine.pdf`, await pdf("mine"), { contentType: "application/pdf" });
  ok("the student cannot put a file in the receipts' folder", Boolean(putError));
  if (!putError) extraPaths.push(`${studentId}/fee-receipts/${applicationId}/zz/mine.pdf`);
  const elsewhere = `${studentId}/zztmp-mine-${RUN}.pdf`;
  const { error: elsewhereError } = await student.storage.from("documents").upload(elsewhere, await pdf("mine"), { contentType: "application/pdf" });
  if (!elsewhereError) extraPaths.push(elsewhere);
  const { error: addError } = await student.rpc("add_student_document_file", { p_document_id: docId, p_path: elsewhere, p_name: "mine.pdf", p_sources: null, p_role: "student", p_status: "submitted" });
  ok("...nor add one to the requirement", Boolean(addError));
  const { data: changed } = await student.from("student_documents").update({ status: "submitted" }).eq("id", docId).select("id");
  ok("...nor change it", (changed ?? []).length === 0);
  const { error: removeError } = await student.rpc("remove_student_document_file", { p_file_id: bank.id });
  ok("...nor remove one", Boolean(removeError) && (await receiptFiles(docId)).length === 3);
  seen = await partnerReads();
  ok("shown to the student, still not to the partner", !seen.some((d) => d.category === "application_fee"));

  // ------------------------------------------------------------ removed, hidden again
  card = await openCard();
  await press(page, card.getByRole("button", { name: `Remove ${bank.file_name}` }));
  const two = await poll(async () => ((await receiptFiles(docId)).length === 2 ? true : null));
  ok("Processing removes one receipt", Boolean(two));
  const trashed = await poll(async () => ((await admin.from("trashed_files").select("id").eq("path", bank.file_path).is("restored_at", null)).data?.length ? true : null), 20);
  ok("...its file kept for 90 days, to restore", Boolean(trashed));
  card = await openCard();
  await press(page, card.locator("[data-fee-receipts-visible] input[type=checkbox]"));
  const hidden = await poll(async () => ((await admin.from("applications").select("fee_receipts_visible").eq("id", applicationId).single()).data?.fee_receipts_visible === false ? true : null));
  reads = await studentReads();
  ok("unticked: hidden from the student again", Boolean(hidden) && reads.docs === 0 && reads.files === 0, JSON.stringify(reads));
  for (const f of [portal, later]) {
    card = await openCard();
    await press(page, card.getByRole("button", { name: `Remove ${f.file_name}` }));
    await poll(async () => ((await receiptFiles(docId)).some((x) => x.id === f.id) ? null : true));
  }
  const gone = await poll(async () => ((await receiptDoc()) ? null : true));
  ok("the last one removed takes the requirement with it", Boolean(gone));

  // ------------------------------------------------------------ from "Documents from the university"
  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  const box = page.locator("[data-university-upload]");
  await box.waitFor({ timeout: 120000 });
  await page.waitForFunction(() => {
    const input = document.querySelector("[data-university-upload] input[name=name]");
    return Boolean(input && Object.keys(input).some((k) => k.startsWith("__reactProps")));
  }, null, { timeout: 60000 });
  const kindSelect = box.locator("select[name=kind]");
  await box.locator("input[name=name]").fill("zztmp Acceptance letter");
  ok("the university box files a letter as a letter", (await kindSelect.inputValue()) === "letter");
  await box.locator("input[name=name]").fill("zztmp Fee Invoice");
  ok("...and a name saying invoice as a receipt", (await kindSelect.inputValue()) === "receipt");
  await box.locator("input[type=file]").setInputFiles([await file("invoice-scan.pdf")]);
  const boxButton = box.getByRole("button", { name: "Upload" });
  await poll(async () => (await boxButton.isEnabled()) || null, 60);
  await boxButton.click();
  const fromBox = await poll(async () => {
    const doc = await receiptDoc();
    const list = doc ? await receiptFiles(doc.id) : [];
    return list.length === 1 ? list : null;
  }, 60);
  ok("...into the receipts, under the name typed", fromBox?.[0]?.file_name === "zztmp Fee Invoice.pdf" && isFeeReceiptPath(fromBox[0].file_path), JSON.stringify(fromBox));
  const { count: letters } = await admin.from("student_documents").select("id", { count: "exact", head: true }).eq("application_id", applicationId).eq("category", "acceptance_letters");
  const { data: stageNow } = await admin.from("applications").select("current_stage").eq("id", applicationId).single();
  ok("...not as an acceptance letter, and no stage moved", letters === 0 && stageNow?.current_stage === "documents_pending", JSON.stringify({ letters, stage: stageNow?.current_stage }));
  reads = await studentReads();
  ok("...hidden from the student", reads.docs === 0);

  // ------------------------------------------------------------ a specific requirement of the university, in Other
  const otherDocs = async () => (await admin.from("student_documents").select("id, custom_name, status, category, application_id, created_at").eq("student_id", studentId).eq("category", "other").order("created_at")).data ?? [];
  const fileUnder = async (name, kind, chosen) => {
    await page.goto(appUrl, { waitUntil: "domcontentloaded" });
    const b = page.locator("[data-university-upload]");
    await b.waitFor({ timeout: 120000 });
    await page.waitForFunction(() => {
      const input = document.querySelector("[data-university-upload] select[name=kind]");
      return Boolean(input && Object.keys(input).some((k) => k.startsWith("__reactProps")));
    }, null, { timeout: 60000 });
    await b.locator("input[name=name]").fill(name);
    await b.locator("select[name=kind]").selectOption(kind);
    if (chosen) await b.locator("input[type=file]").setInputFiles(chosen);
    const go = b.getByRole("button", { name: chosen ? "Upload" : "Add requirement" });
    await poll(async () => (await go.isEnabled()) || null, 60);
    await go.click();
  };
  await fileUnder("zztmp Motivation form", "requirement", [await file("motivation.pdf")]);
  const first = await poll(async () => (await otherDocs()).find((d) => d.custom_name === "zztmp Motivation form") ?? null, 60);
  const firstFiles = first ? await receiptFiles(first.id) : [];
  ok("a specific requirement with a file is filed in Other, approved, on the application", first?.application_id === applicationId && first.status === "verified" && firstFiles.length === 1 && firstFiles[0].status === "verified", JSON.stringify({ first, firstFiles }));
  ok("...and moves no stage", (await admin.from("applications").select("current_stage").eq("id", applicationId).single()).data?.current_stage === "documents_pending");
  // Something else in Other in between, so keeping a university's together is something the page has to do.
  const { data: general } = await admin.from("student_documents").insert({ student_id: studentId, category: "other", custom_name: `zztmp General ${RUN}`, status: "missing" }).select("id").single();
  await new Promise((r) => setTimeout(r, 1200));
  await fileUnder("zztmp Language certificate", "requirement", null);
  const second = await poll(async () => (await otherDocs()).find((d) => d.custom_name === "zztmp Language certificate") ?? null, 60);
  ok("...with no file, the student is asked for it", second?.application_id === applicationId && second.status === "missing", JSON.stringify(second));

  await page.goto(`${BASE}/students/${studentId}/documents?doc=${first.id}`, { waitUntil: "domcontentloaded" });
  await page.locator(`[data-document-row="${first.id}"]`).waitFor({ timeout: 120000 });
  const staffOrder = await page.locator("[data-document-row]").evaluateAll((rows) => rows.map((r) => r.getAttribute("data-document-row")));
  const at = (order, id) => order.indexOf(id);
  ok("the Documents tab keeps the university's together in Other, in the order added", at(staffOrder, first.id) >= 0 && at(staffOrder, second.id) === at(staffOrder, first.id) + 1 && at(staffOrder, general.id) > at(staffOrder, second.id), JSON.stringify({ first: at(staffOrder, first.id), second: at(staffOrder, second.id), general: at(staffOrder, general.id) }));
  const firstName = ((await page.locator(`[data-document-row="${first.id}"] p`).first().textContent()) ?? "").trim();
  ok("...named with the university and the programme", firstName.endsWith(`zztmp Motivation form — ${UNI} — ${PROGRAMME}`), firstName);
  await shot(page, "fee-staff-other");

  await sp.goto(`${BASE}/portal/documents?guide=${second.id}`, { waitUntil: "domcontentloaded" });
  await sp.locator(`[data-document-row="${second.id}"]`).waitFor({ timeout: 60000 });
  const studentOrder = await sp.locator("[data-document-row]").evaluateAll((rows) => rows.map((r) => r.getAttribute("data-document-row")));
  ok("the student sees them the same way, together and in order", at(studentOrder, second.id) === at(studentOrder, first.id) + 1 && at(studentOrder, general.id) > at(studentOrder, second.id), JSON.stringify({ first: at(studentOrder, first.id), second: at(studentOrder, second.id), general: at(studentOrder, general.id) }));
  const secondRow = sp.locator(`[data-document-row="${second.id}"]`);
  ok("...named with the university and the programme, and asked to upload the one with no file", ((await secondRow.textContent()) ?? "").includes(`zztmp Language certificate — ${UNI} — ${PROGRAMME}`) && (await secondRow.locator("input[type=file]").count()) === 1);
  await shot(sp, "fee-student-other");
} catch (e) {
  ok("the run finished", false, e?.stack ?? String(e));
} finally {
  await browser?.close().catch(() => {});
  if (studentId) {
    const { data: kept } = await admin.from("student_document_files").select("file_path").eq("student_id", studentId);
    const paths = [...(kept ?? []).map((f) => f.file_path), ...extraPaths].filter(Boolean);
    if (paths.length) await admin.storage.from("documents").remove(paths);
    const { data: listed } = await admin.storage.from("documents").list(`${studentId}/fee-receipts/${applicationId}`, { limit: 100 });
    for (const folder of listed ?? []) {
      const { data: inside } = await admin.storage.from("documents").list(`${studentId}/fee-receipts/${applicationId}/${folder.name}`, { limit: 100 });
      if (inside?.length) await admin.storage.from("documents").remove(inside.map((o) => `${studentId}/fee-receipts/${applicationId}/${folder.name}/${o.name}`));
    }
    const { data: trashed } = await admin.from("trashed_files").select("id, trash_path").like("path", `${studentId}/%`);
    if (trashed?.length) {
      await admin.storage.from("documents").remove(trashed.map((t) => t.trash_path));
      await admin.from("trashed_files").delete().in("id", trashed.map((t) => t.id));
    }
  }
  if (studentUserId) await admin.from("notifications").delete().eq("user_id", studentUserId);
  if (universityId) {
    await admin.from("applications").delete().eq("university_id", universityId);
    if (partnerUserId) await admin.from("partner_university_accounts").delete().eq("id", partnerUserId);
    await admin.from("programs").delete().eq("university_id", universityId);
    await admin.from("universities").delete().eq("id", universityId);
  }
  for (const id of [studentUserId, partnerUserId]) {
    if (!id) continue;
    await removeStagedFiles(admin, id);
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
