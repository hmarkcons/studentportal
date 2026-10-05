// Several files chosen for one document, joined into one PDF before upload
// (src/lib/combinePdf.ts), end to end against a deployed portal:
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:multiupload
//
// On a student's Documents tab: a tall photo, a two-page PDF and a wide photo
// are chosen for one requirement and put in another order; what is stored is
// one PDF, its pages in that order — the photos on A4, upright and on its side,
// the PDF's pages as they were. A Word file cannot be joined and says so; two
// PDFs too big together are refused before anything is uploaded; one file
// alone is uploaded as it is, a Word file included.
//
// In the student portal: a signed agreement photographed as two pages is
// joined and submitted as one PDF.
//
// Fixtures are named zztmp; their rows, files and the student's login are
// removed in a finally.
import { BASE, FIXTURE_PASSWORD, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:multiupload");

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();
const STUDENT_EMAIL = "zztmp-multiupload-student@hmark-test.local";

async function poll(fn, seconds = 30) {
  const until = Date.now() + seconds * 1000;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v || Date.now() > until) return v;
    await new Promise((r) => setTimeout(r, 400));
  }
}

const { PDFDocument } = await import("pdf-lib");
const { default: sharp } = await import("sharp");

async function photo(width, height) {
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#e6efff"/><text x="40" y="140" font-size="90" fill="#123">zztmp ${width}x${height}</text></svg>`);
  return sharp(svg).jpeg({ quality: 85 }).toBuffer();
}
async function letterPdf(pages) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([612, 792]).drawText(`zztmp page ${i + 1}`, { x: 72, y: 700, size: 24 });
  return Buffer.from(await doc.save());
}
/** A PDF of incompressible noise, about `mb` megabytes, to be too big when joined. */
async function heavyPdf(mb) {
  const side = Math.round(Math.sqrt((mb * 1024 * 1024) / 3));
  const noise = Buffer.alloc(side * side * 3);
  for (let i = 0; i < noise.length; i++) noise[i] = (Math.random() * 256) | 0;
  const png = await sharp(noise, { raw: { width: side, height: side, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
  const doc = await PDFDocument.create();
  const img = await doc.embedPng(png);
  doc.addPage([side, side]).drawImage(img, { x: 0, y: 0, width: side, height: side });
  return Buffer.from(await doc.save());
}
async function pageSizes(bytes) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((p) => {
    const { width, height } = p.getSize();
    return `${Math.round(width)}x${Math.round(height)}`;
  });
}

let browser = null;
const students = [];

try {
  const sup = await fx.staff("multiup", ["super_admin"]);

  // =================================================== the Documents tab
  console.log("\n--- a student's Documents tab ---");
  const staffStudent = await fx.lead({
    full_name: "zztmp Multi Upload Student",
    contact_number: "0300-9999931",
    status: "registered",
    registration_status: "registered",
    registered_at: new Date().toISOString(),
  });
  students.push(staffStudent);
  const row = (key, name) => ({ id: crypto.randomUUID(), student_id: staffStudent, category: "admission", custom_name: `zztmp ${name}`, status: "missing", file_path: null, key });
  const docs = { joined: row("joined", "Transcript"), word: row("word", "CV"), heavy: row("heavy", "Bank statement"), single: row("single", "Reference letter") };
  const { error: docError } = await admin.from("student_documents").insert(Object.values(docs).map(({ key, ...r }) => (void key, r)));
  if (docError) throw new Error(`documents: ${docError.message}`);

  const tall = { name: "front.jpg", mimeType: "image/jpeg", buffer: await photo(800, 1100) };
  const wide = { name: "back.jpg", mimeType: "image/jpeg", buffer: await photo(1400, 900) };
  const twoPages = { name: "pages.pdf", mimeType: "application/pdf", buffer: await letterPdf(2) };
  const docx = { name: "cv.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from("PK\u0003\u0004 zztmp") };

  browser = await openBrowser();
  const page = await signIn(browser, sup.email);
  await page.setViewportSize({ width: 1400, height: 1000 });
  // ?doc= opens the section holding that requirement.
  const openRow = async (id) => {
    await page.goto(`${BASE}/students/${staffStudent}/documents?doc=${id}`, { waitUntil: "domcontentloaded" });
    const r = page.locator(`[data-document-row="${id}"]`);
    await r.waitFor({ timeout: 120000 });
    await page.waitForFunction((rid) => {
      const input = document.querySelector(`[data-document-row="${rid}"] input[type="file"]`);
      return Boolean(input && Object.keys(input).some((k) => k.startsWith("__reactProps")));
    }, id, { timeout: 60000 });
    return r;
  };

  let r = await openRow(docs.joined.id);
  ok("the upload takes several files", (await r.locator('input[type="file"]').getAttribute("multiple")) !== null);
  await r.locator('input[type="file"]').setInputFiles([tall, twoPages, wide]);
  const list = r.locator("[data-joined-files]");
  await list.waitFor({ timeout: 30000 });
  ok("...listed in the order chosen", (await list.locator("[data-joined-file]").allInnerTexts()).map((t) => t.split(/\s+/)[1]).join(",") === "front.jpg,pages.pdf,back.jpg");
  await list.getByRole("button", { name: "Move back.jpg up" }).click();
  const joinedNote = await poll(async () => {
    const text = (await r.innerText()).replace(/\s+/g, " ");
    return /3 files joined into one PDF · 4 pages/.test(text) && /Uploaded|joined/.test(text) && (await r.getByRole("button", { name: /Upload/ }).first().isEnabled()) ? text : null;
  }, 60);
  ok("...joined into one PDF of all their pages", Boolean(joinedNote), joinedNote ?? (await r.innerText()).slice(0, 300));
  await r.getByRole("button", { name: /Upload/ }).first().click();
  const stored = await poll(async () => {
    const { data } = await admin.from("student_documents").select("file_path, status").eq("id", docs.joined.id).single();
    return data?.file_path ? data : null;
  }, 60);
  const { data: joinedFile } = stored ? await admin.storage.from("documents").download(stored.file_path) : { data: null };
  const sizes = joinedFile ? await pageSizes(Buffer.from(await joinedFile.arrayBuffer())) : [];
  ok("what is stored is one PDF, its pages in the order chosen", /\.pdf$/.test(stored?.file_path ?? "") && sizes.join(",") === "595x842,842x595,612x792,612x792",
    `${stored?.file_path} → ${sizes.join(",")}`);

  r = await openRow(docs.word.id);
  await r.locator('input[type="file"]').setInputFiles([docx, tall]);
  const wordError = await poll(async () => ((await r.innerText()).includes("is a Word file, which cannot be joined") ? true : null), 20);
  ok("a Word file cannot be joined, and says what to do instead", Boolean(wordError));
  ok("...and nothing can be uploaded until it is sorted", !(await r.getByRole("button", { name: /Upload/ }).first().isEnabled()));

  r = await openRow(docs.heavy.id);
  await r.locator('input[type="file"]').setInputFiles([
    { name: "statement-1.pdf", mimeType: "application/pdf", buffer: await heavyPdf(3) },
    { name: "statement-2.pdf", mimeType: "application/pdf", buffer: await heavyPdf(3) },
  ]);
  const heavyError = await poll(async () => ((await r.innerText()).match(/Joined, these come to [\d.]+ MB, over the 5 MB limit/) ? true : null), 60);
  ok("files too big together are refused, before anything is uploaded", Boolean(heavyError), (await r.innerText()).slice(0, 300));

  r = await openRow(docs.single.id);
  await r.locator('input[type="file"]').setInputFiles([docx]);
  await poll(async () => (await r.getByRole("button", { name: /Upload/ }).first().isEnabled()) || null, 30);
  await r.getByRole("button", { name: /Upload/ }).first().click();
  const single = await poll(async () => {
    const { data } = await admin.from("student_documents").select("file_path").eq("id", docs.single.id).single();
    return data?.file_path ?? null;
  }, 60);
  ok("one file alone is uploaded as it is, a Word file included", /\.docx$/.test(single ?? ""), String(single));
  const { data: untouched } = await admin.from("student_documents").select("custom_name, file_path").in("id", [docs.word.id, docs.heavy.id]);
  ok("...and the refused ones stored nothing", (untouched ?? []).every((d) => d.file_path === null), JSON.stringify(untouched));

  // =================================================== a signed agreement
  console.log("\n--- a signed agreement, photographed in pages ---");
  const { data: italy } = await admin.from("destinations").select("id").eq("display_name", "Italy (Public)").single();
  const { data: template } = await admin.from("agreement_templates").select("id").eq("destination_id", italy.id).limit(1).single();
  const portalStudent = await fx.lead({
    full_name: "zztmp Multi Upload Signer",
    email: STUDENT_EMAIL,
    contact_number: "0300-9999932",
    status: "registered",
    registration_status: "registered",
    registered_at: new Date().toISOString(),
    country_of_interest: "Italy (Public)",
    date_of_birth: "2002-04-17",
    address: "12 Test Street, Karachi",
    // Without an intake there is no Student ID, and without one no portal.
    intake: "Fall 2099",
  });
  students.push(portalStudent);
  await admin.from("lead_destinations").insert({ lead_id: portalStudent, destination_id: italy.id });
  await poll(async () => (await admin.from("leads").select("student_code").eq("id", portalStudent).single()).data?.student_code ?? null, 15);
  const { data: agreement, error: agreementError } = await admin
    .from("agreements")
    .insert({ student_id: portalStudent, template_id: template.id, signing_method: "e_signature", status: "pending_signature" })
    .select("id")
    .single();
  if (agreementError) throw new Error(`agreement: ${agreementError.message}`);
  await admin.from("leads").update({ portal_active: true }).eq("id", portalStudent);
  const { data: listed } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of listed?.users ?? []) if (u.email === STUDENT_EMAIL) await admin.auth.admin.deleteUser(u.id).catch(() => {});
  const { data: made, error: madeError } = await admin.auth.admin.createUser({ email: STUDENT_EMAIL, password: FIXTURE_PASSWORD, email_confirm: true });
  if (madeError || !made?.user) throw new Error(`student login: ${madeError?.message}`);
  await admin.from("leads").update({ auth_user_id: made.user.id }).eq("id", portalStudent);

  const sp = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
  await sp.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await sp.fill('input[name="email"]', STUDENT_EMAIL);
  await sp.fill('input[type="password"]', FIXTURE_PASSWORD);
  await sp.click('button[type="submit"]');
  await sp.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 40000 });
  await sp.goto(`${BASE}/portal/agreement`, { waitUntil: "domcontentloaded" });
  const documentInput = sp.locator("[data-agreement-document-input]");
  await documentInput.waitFor({ state: "attached", timeout: 120000 });
  await sp.waitForFunction(() => {
    const i = document.querySelector("[data-agreement-document-input]");
    return Boolean(i && Object.keys(i).some((k) => k.startsWith("__reactProps")));
  }, null, { timeout: 60000 });
  await sp.locator('input[type="file"][accept*="video"]').first().setInputFiles({ name: "consent.webm", mimeType: "video/webm", buffer: Buffer.from("zztmp consent recording") });
  await documentInput.setInputFiles([
    { name: "agreement-page-1.jpg", mimeType: "image/jpeg", buffer: await photo(900, 1250) },
    { name: "agreement-page-2.jpg", mimeType: "image/jpeg", buffer: await photo(900, 1250) },
  ]);
  const submit = sp.getByRole("button", { name: /Submit signed agreement/i });
  const ready = await poll(async () => {
    const text = (await sp.locator("form").first().innerText()).replace(/\s+/g, " ");
    return /2 files joined into one PDF · 2 pages/.test(text) && (await submit.isEnabled()) ? text : null;
  }, 60);
  ok("the signed agreement's pages are joined into one PDF", Boolean(ready), (await sp.locator("form").first().innerText()).replace(/\s+/g, " ").slice(0, 300));
  await submit.click();
  const submitted = await poll(async () => {
    const { data } = await admin.from("agreements").select("signed_file_path").eq("id", agreement.id).single();
    return data?.signed_file_path ?? null;
  }, 60);
  const { data: signed } = submitted ? await admin.storage.from("documents").download(submitted) : { data: null };
  const signedPages = signed ? await pageSizes(Buffer.from(await signed.arrayBuffer())) : [];
  ok("...and submitted as one PDF of both pages", signedPages.join(",") === "595x842,595x842", `${submitted} → ${signedPages.join(",")}`);
  await sp.close();
} catch (e) {
  ok(`the check itself stopped: ${e?.stack ?? e}`, false);
} finally {
  await browser?.close().catch(() => {});
  for (const id of students) {
    for (const folder of [id, `${id}/agreements`]) {
      const { data: stored } = await admin.storage.from("documents").list(folder, { limit: 100 });
      const files = (stored ?? []).filter((f) => f.id);
      if (files.length) await admin.storage.from("documents").remove(files.map((f) => `${folder}/${f.name}`));
    }
  }
  const { data: listed } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of listed?.users ?? []) if (u.email === STUDENT_EMAIL) await admin.auth.admin.deleteUser(u.id).catch(() => {});
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
