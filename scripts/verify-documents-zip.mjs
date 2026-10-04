// "Download all" on a student's Documents tab, end to end against a deployed
// portal:
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:docszip
//
// A fixture student is given uploads of every kind — a PDF, a phone photo, a
// wide scan, a Word file, two items of the same name — one requirement with
// nothing uploaded, and one whose file has gone from storage. The ZIP the
// button saves is opened and held to: a numbered folder per section, as the
// page numbers them; each file named after its checklist item, whatever it was
// uploaded as; pictures as PDFs, a PDF and a Word file byte for byte as
// uploaded; nothing for the item with no file; and the missing file named in
// "Not included.txt". A counsellor with no processing role is not offered it.
//
// Fixtures are named zztmp; their rows and files are removed in a finally.
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { BASE, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:docszip");

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

/** A small real picture, so the browser has something to open. */
async function picture(width, height, type) {
  const { default: sharp } = await import("sharp");
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#dde8ff"/><text x="40" y="120" font-size="80" fill="#123">zztmp</text></svg>`
  );
  const img = sharp(svg);
  return type === "png" ? img.png().toBuffer() : img.jpeg({ quality: 85 }).toBuffer();
}

let browser = null;
let studentId = null;

try {
  const sup = await fx.staff("docszip", ["super_admin"]);
  const cou = await fx.staff("docszipcou", ["counselor"]);
  studentId = await fx.lead({
    full_name: "zztmp Zip Student",
    contact_number: "0300-9999911",
    status: "registered",
    registration_status: "registered",
    registered_at: new Date().toISOString(),
    assigned_counselor_id: cou.id,
  });

  const pdf = Buffer.from("%PDF-1.4\n% zztmp CV\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");
  const docx = Buffer.from("PK\u0003\u0004 zztmp not really a word file, carried as it is");
  const files = {
    cv: { name: "CV / Resume", category: "admission", file: "my-cv-final_v3.pdf", body: pdf, type: "application/pdf" },
    passport: { name: "Passport", category: "admission", file: "IMG_2041.png", body: await picture(800, 1100, "png"), type: "image/png" },
    scan: { name: "Bank statement", category: "visa", file: "scan.jpg", body: await picture(1600, 900, "jpg"), type: "image/jpeg" },
    letter: { name: "Sponsor letter", category: "visa", file: "letter.docx", body: docx, type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
    transcript1: { name: "Transcript", category: "admission", file: "t1.pdf", body: pdf, type: "application/pdf" },
    transcript2: { name: "Transcript", category: "admission", file: "t2.pdf", body: pdf, type: "application/pdf" },
    gone: { name: "Police certificate", category: "visa", file: "gone.pdf", body: null, type: "application/pdf" },
  };
  const ids = {};
  const rows = [];
  for (const [key, f] of Object.entries(files)) {
    ids[key] = crypto.randomUUID();
    const path = `${studentId}/${ids[key]}-${f.file}`;
    if (f.body) {
      const { error } = await admin.storage.from("documents").upload(path, f.body, { contentType: f.type, upsert: true });
      if (error) throw new Error(`upload ${key}: ${error.message}`);
    }
    rows.push({ id: ids[key], student_id: studentId, category: f.category, custom_name: `zztmp ${f.name}`, status: "submitted", file_path: path });
  }
  ids.empty = crypto.randomUUID();
  rows.push({ id: ids.empty, student_id: studentId, category: "admission", custom_name: "zztmp Nothing uploaded", status: "missing", file_path: null });
  const { error: docError } = await admin.from("student_documents").insert(rows);
  if (docError) throw new Error(`documents: ${docError.message}`);

  browser = await openBrowser();
  const page = await signIn(browser, sup.email);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(`${BASE}/students/${studentId}/documents`, { waitUntil: "domcontentloaded" });
  const button = page.locator("[data-download-all-button]");
  await button.waitFor({ timeout: 120000 });
  await page.waitForFunction(() => {
    const b = document.querySelector("[data-download-all-button]");
    return Boolean(b && Object.keys(b).some((k) => k.startsWith("__reactProps")));
  }, null, { timeout: 60000 });
  ok("the Documents tab offers Download all, counting the files on it", /Download all \(7\)/.test(await button.innerText()), await button.innerText());

  // Where each fixture sits on the page: its section's number and name.
  const placeOf = async (id) => {
    const section = page.locator("section[data-doc-section]", { has: page.locator(`[data-document-row="${id}"]`) });
    const number = (await section.locator("button[data-collapsible-toggle] span").first().innerText()).trim();
    const label = (await section.locator("h3").first().innerText()).trim();
    return `${number}. ${label}`;
  };
  const folder = {};
  for (const key of Object.keys(files)) folder[key] = await placeOf(ids[key]);

  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 120000 }), button.click()]);
  const zipPath = await download.path();
  ok("the ZIP is named after the student", download.suggestedFilename() === "zztmp Zip Student - Documents.zip", download.suggestedFilename());
  const entries = unzipSync(new Uint8Array(readFileSync(zipPath)));
  const names = Object.keys(entries).sort();
  console.log("   ", names.join("\n    "));

  const at = (key, file) => entries[`${folder[key]}/${file}`];
  ok("a folder per section, numbered as on the page, each file named after its checklist item",
    Boolean(at("cv", "zztmp CV - Resume.pdf") && at("letter", "zztmp Sponsor letter.docx")), JSON.stringify(folder));
  ok("...a PDF exactly as uploaded", Buffer.from(at("cv", "zztmp CV - Resume.pdf") ?? []).equals(pdf));
  const passport = at("passport", "zztmp Passport.pdf");
  ok("...a phone photo as a PDF of it", Boolean(passport) && strFromU8(passport.slice(0, 8)) === "%PDF-1.4" && /\/DCTDecode/.test(strFromU8(passport, true)) && /MediaBox \[0 0 595\.28 841\.89\]/.test(strFromU8(passport, true)));
  const scan = at("scan", "zztmp Bank statement.pdf");
  ok("...a wide scan as a PDF on a page turned on its side", Boolean(scan) && /MediaBox \[0 0 841\.89 595\.28\]/.test(strFromU8(scan, true)));
  ok("...a Word file as uploaded, under the item's name", Buffer.from(at("letter", "zztmp Sponsor letter.docx") ?? []).equals(docx));
  ok("...two items of the same name kept apart", Boolean(at("transcript1", "zztmp Transcript.pdf") && at("transcript2", "zztmp Transcript (2).pdf")));
  ok("...nothing for an item with no file", !names.some((n) => n.includes("Nothing uploaded")));
  ok("...and none of the names the files were uploaded as", !names.some((n) => /my-cv-final_v3|IMG_2041|\/scan\.jpg$|\/letter\.docx$/.test(n)), names.join(" | "));
  const notIncluded = entries["Not included.txt"] ? strFromU8(entries["Not included.txt"]) : "";
  ok("a file gone from storage is named in Not included.txt", /zztmp Police certificate/.test(notIncluded), notIncluded);
  const said = (await page.locator("[data-download-all-message]").innerText().catch(() => "")).trim();
  ok("...and on the page", /Downloaded 6 of 7/.test(said) && /zztmp Police certificate/.test(said), said);

  // A counsellor with no processing role is not offered the tab, or the button.
  const cp = await signIn(browser, cou.email);
  await cp.goto(`${BASE}/students/${studentId}/documents`, { waitUntil: "domcontentloaded" });
  await cp.locator("[data-processing-only], [data-download-all-button]").first().waitFor({ timeout: 120000 });
  ok("a counsellor with no processing role is not offered it", (await cp.locator("[data-download-all-button]").count()) === 0);
  await cp.close();
} catch (e) {
  ok(`the check itself stopped: ${e?.stack ?? e}`, false);
} finally {
  await browser?.close().catch(() => {});
  if (studentId) {
    const { data: stored } = await admin.storage.from("documents").list(studentId, { limit: 100 });
    if (stored?.length) await admin.storage.from("documents").remove(stored.map((f) => `${studentId}/${f.name}`));
  }
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
