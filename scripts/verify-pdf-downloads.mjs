// Every stored file downloaded as a PDF (2026-11-17) — end to end:
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:pdfdownloads
//
// One requirement holds a file of each kind — a photo (PNG), a Word file
// with a heading, bold text, a list and a table, an Excel workbook with two
// sheets, a text file, a CSV, a PDF and a .zip. On the staff Documents tab
// each is downloaded by clicking it: every one but the .zip comes down as a
// PDF named after it, the PDF unchanged; the .zip comes down as it is, and
// the page says why. Staff have an "original" link beside each file that is
// not a PDF; the student has no such link and no address of the file at all,
// and their download is a PDF too. Download all makes one PDF of everything
// that can be one and names the .zip as left out.
//
// An iPhone HEIC photo is converted by the same path (heic2any), but there is
// no HEIC encoder here to make one, so it is not in this check.
//
// Everything is named zztmp and removed in a finally, with its files.
import { readFileSync, writeFileSync } from "fs";
import { deflateSync } from "zlib";
import JSZip from "jszip";
import writeXlsxFile from "write-excel-file/node";
import { BASE, FIXTURE_PASSWORD, clients, fixtures, openBrowser, removeStagedFiles, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:pdfdownloads");

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const RUN = Date.now().toString(36);
const STUDENT_EMAIL = `zztmp-pdfdl-${RUN}@hmark-test.local`;

async function poll(fn, seconds = 45, every = 500) {
  const until = Date.now() + seconds * 1000;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v || Date.now() > until) return v;
    await new Promise((r) => setTimeout(r, every));
  }
}

// ------------------------------------------------------------ the files

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function png(width, height) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const at = y * (width * 3 + 1) + 1 + x * 3;
      raw[at] = (x * 255) / width;
      raw[at + 1] = (y * 255) / height;
      raw[at + 2] = 160;
    }
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

async function docx() {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
  );
  const p = (text, bold = false) => `<w:p><w:r>${bold ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  const cell = (text) => `<w:tc><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`;
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
      p("zztmp Curriculum Vitae", true) +
      p("Born in Karachi, studied in Lahore — è, ü, ñ kept.") +
      `<w:tbl><w:tr>${cell("Year")}${cell("Degree")}</w:tr><w:tr>${cell("2020")}${cell("BSc Computer Science")}</w:tr></w:tbl>` +
      Array.from({ length: 60 }, (_, i) => p(`Line ${i + 1} of a long document, so it runs to a second page.`)).join("") +
      `</w:body></w:document>`
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

async function xlsx() {
  const sheet = (title) => [
    [{ value: "Name" }, { value: "Fee" }, { value: "Paid" }],
    [{ value: `zztmp ${title} one` }, { value: 30 }, { value: true }],
    [{ value: `zztmp ${title} two` }, { value: 45.5 }, { value: false }],
  ];
  return writeXlsxFile([
    { data: sheet("A"), sheet: "Fees" },
    { data: sheet("B"), sheet: "Others" },
  ]).toBuffer();
}

async function pdf() {
  const { PDFDocument } = await import("pdf-lib");
  const d = await PDFDocument.create();
  d.addPage([595, 842]).drawText("zztmp already a PDF", { x: 50, y: 760, size: 20 });
  return Buffer.from(await d.save());
}

async function zip() {
  const z = new JSZip();
  z.file("inside.txt", "zztmp inside");
  return z.generateAsync({ type: "nodebuffer" });
}

const pageCount = async (bytes) => {
  const { PDFDocument } = await import("pdf-lib");
  return (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount();
};

let browser = null;
let studentId = null;
let studentUserId = null;
const paths = [];

try {
  const FILES = [
    { name: "zztmp photo.png", type: "image/png", bytes: png(320, 200), pdf: true },
    { name: "zztmp cv.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: await docx(), pdf: true, pages: 2 },
    { name: "zztmp fees.xlsx", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes: await xlsx(), pdf: true, pages: 2 },
    { name: "zztmp notes.txt", type: "text/plain", bytes: Buffer.from("zztmp notes\nline two\n"), pdf: true },
    { name: "zztmp marks.csv", type: "text/csv", bytes: Buffer.from('Subject,Mark\nMaths,91\n"Physics, lab",88\n'), pdf: true },
    { name: "zztmp scan.pdf", type: "application/pdf", bytes: await pdf(), pdf: true, same: true },
    { name: "zztmp archive.zip", type: "application/zip", bytes: await zip(), pdf: false },
  ];

  const proc = await fx.staff(`pdfdl${RUN}`, ["processing"]);
  const { data: italy } = await admin.from("destinations").select("id, display_name").eq("display_name", "Italy (Public)").single();
  studentId = await fx.lead({
    full_name: `zztmp PDF Downloads ${RUN}`, email: STUDENT_EMAIL, contact_number: "0300-9999947",
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

  const { data: req } = await admin.from("student_documents").insert({ student_id: studentId, category: "other", custom_name: `zztmp Every kind ${RUN}`, status: "missing" }).select("id").single();
  const fileIds = {};
  for (const [i, f] of FILES.entries()) {
    const path = `${studentId}/zztmp-pdfdl/${RUN}-${i}-${f.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
    const { error: upError } = await admin.storage.from("documents").upload(path, f.bytes, { contentType: f.type });
    if (upError) throw new Error(`upload ${f.name}: ${upError.message}`);
    paths.push(path);
    const { data: row, error } = await admin
      .from("student_document_files")
      .insert({ document_id: req.id, student_id: studentId, file_path: path, file_name: f.name, status: "submitted", uploaded_by_role: "staff", uploaded_at: new Date(Date.now() + i * 1000).toISOString() })
      .select("id")
      .single();
    if (error) throw new Error(`file row ${f.name}: ${error.message}`);
    fileIds[f.name] = row.id;
  }

  const save = async (page, locator) => {
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 90000 }), locator.click()]);
    const at = await download.path();
    const bytes = at ? readFileSync(at) : Buffer.alloc(0);
    // SAVE_DIR=<folder> keeps what came down, to look at.
    if (process.env.SAVE_DIR) writeFileSync(`${process.env.SAVE_DIR}/${download.suggestedFilename()}`, bytes);
    return { name: download.suggestedFilename(), bytes };
  };

  // ------------------------------------------------------------ staff
  browser = await openBrowser();
  const page = await signIn(browser, proc.email);
  await page.setViewportSize({ width: 1400, height: 1100 });
  await page.goto(`${BASE}/students/${studentId}/documents?doc=${req.id}`, { waitUntil: "domcontentloaded" });
  const row = page.locator(`[data-document-row="${req.id}"]`);
  await row.waitFor({ timeout: 120000 });
  await page.waitForFunction((id) => {
    const b = document.querySelector(`[data-document-row="${id}"] [data-file-download]`);
    return Boolean(b && Object.keys(b).some((k) => k.startsWith("__reactProps")));
  }, req.id, { timeout: 60000 });

  for (const f of FILES) {
    const fileRow = row.locator(`[data-document-file="${fileIds[f.name]}"]`);
    const got = await save(page, fileRow.locator("[data-file-download]"));
    const isPdf = got.bytes.subarray(0, 5).toString("latin1") === "%PDF-";
    if (f.pdf) {
      const pages = isPdf ? await pageCount(got.bytes).catch(() => 0) : 0;
      ok(`${f.name}: downloads as a PDF named after it`, isPdf && got.name === f.name.replace(/\.[^.]+$/, ".pdf") && pages >= (f.pages ?? 1), `${got.name}, ${pages} page(s), ${got.bytes.length} bytes`);
      if (f.same) ok("...the PDF exactly as it was", got.bytes.equals(f.bytes));
    } else {
      ok(`${f.name}: cannot be a PDF, so it downloads as it is`, !isPdf && got.name === f.name && got.bytes.equals(f.bytes), got.name);
      const said = await poll(async () => ((await page.locator("body").innerText()).includes("cannot be turned into a PDF") ? true : null), 10);
      ok("...and the page says so", Boolean(said));
    }
    const originals = await fileRow.locator("[data-original-file]").count();
    ok(`${f.name}: ${f.name.endsWith(".pdf") ? "no" : "an"} "original" link for staff`, originals === (f.name.endsWith(".pdf") ? 0 : 1));
  }
  const originalHref = await row.locator(`[data-document-file="${fileIds["zztmp cv.docx"]}"] [data-original-file]`).getAttribute("href");
  const originalBytes = originalHref ? Buffer.from(await (await fetch(originalHref)).arrayBuffer()) : null;
  ok("...which is the file as it was uploaded", Boolean(originalBytes?.equals(FILES[1].bytes)));

  // Download all: one PDF of everything that can be one; the .zip named as left out.
  const all = page.getByRole("button", { name: /Download all/ }).first();
  const merged = await save(page, all);
  const mergedPages = merged.bytes.subarray(0, 5).toString("latin1") === "%PDF-" ? await pageCount(merged.bytes).catch(() => 0) : 0;
  ok("Download all is one PDF, with the Word and Excel files in it", mergedPages >= 8, `${merged.name}, ${mergedPages} pages`);
  const leftOut = await poll(async () => {
    const text = await page.locator("body").innerText();
    return /Left out \(can't be made a PDF\)/.test(text) && text.includes(".zip") && !text.includes(".docx)") ? text.match(/Left out[^\n]*/)?.[0] : null;
  }, 20);
  ok("...naming only the .zip as left out", Boolean(leftOut), leftOut ?? "");

  // ------------------------------------------------------------ the student
  const sp = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  await sp.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await sp.waitForFunction(() => Boolean(document.querySelector('input[name="email"]') && Object.keys(document.querySelector('input[name="email"]')).some((k) => k.startsWith("__reactFiber"))), null, { timeout: 60000 }).catch(() => {});
  await sp.fill('input[name="email"]', STUDENT_EMAIL);
  await sp.fill('input[type="password"]', FIXTURE_PASSWORD);
  await sp.click('button[type="submit"]');
  await sp.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 40000 });
  await sp.goto(`${BASE}/portal/documents?guide=${req.id}`, { waitUntil: "domcontentloaded" });
  const srow = sp.locator(`[data-document-row="${req.id}"]`);
  await srow.waitFor({ timeout: 60000 });
  await sp.waitForFunction((id) => {
    const b = document.querySelector(`[data-document-row="${id}"] [data-file-download]`);
    return Boolean(b && Object.keys(b).some((k) => k.startsWith("__reactProps")));
  }, req.id, { timeout: 60000 });
  ok("the student has no original link", (await srow.locator("[data-original-file]").count()) === 0);
  ok("...and no address of a stored file on the page", (await sp.locator('a[href*="/storage/v1/object/"]').count()) === 0);
  const studentDoc = await save(sp, srow.locator(`[data-document-file="${fileIds["zztmp cv.docx"]}"] [data-file-download]`));
  ok("the student's Word file downloads as a PDF", studentDoc.bytes.subarray(0, 5).toString("latin1") === "%PDF-" && studentDoc.name === "zztmp cv.pdf", studentDoc.name);
} catch (e) {
  ok("the run finished", false, e?.stack ?? String(e));
} finally {
  await browser?.close().catch(() => {});
  if (paths.length) await admin.storage.from("documents").remove(paths);
  if (studentUserId) {
    await removeStagedFiles(admin, studentUserId);
    await admin.from("notifications").delete().eq("user_id", studentUserId);
    await admin.auth.admin.deleteUser(studentUserId).catch(() => {});
  }
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
