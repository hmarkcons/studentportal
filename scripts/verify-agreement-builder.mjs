// The agreement template builder (0281), end to end.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:builder
//
// The builder can style a template like the reference contract: fonts,
// colours, headings with rules, bullets, table shading, the page and the
// payment chart, and it imports all of that from Word. Each part fails
// quietly — a style the PDF does not read prints nothing different, a font
// file missing from the server function breaks every themed PDF, a Word
// payment table carried across as a table prints sample figures — so this
// drives the deployed builder as a Super Admin would and reads the PDFs it
// makes:
//
//   the import       a Word file's headings, bullets, colours and payment
//                    table come across, and Page & theme is set from it
//   the toolbar      colour, font and bullet choices reach the saved wording;
//                    a theme change reaches the saved design
//   the preview      is a PDF, in the template's fonts and colours
//   generating       a student's agreement from the template embeds the fonts
//                    and draws the colours — on the server that serves real
//                    agreements, which is where a missing font file shows
//   Classic          a template with no design still prints as it always has
//   switching back   choosing Classic stores no design
//
// Fixtures are named "zztmp" and removed in the finally block.
import JSZip from "jszip";
import { inflateSync } from "node:zlib";
import { clients, fixtures, openBrowser, signIn, requireConfirmation, BASE } from "./verify-portal-lib.mjs";

requireConfirmation("check:builder");

const { admin } = clients();
const browser = await openBrowser();
const fx = fixtures(admin);
let pass = 0, fail = 0;
const ok = (l, c, x = "") => { if (c) { pass++; console.log(`PASS  ${l}`); } else { fail++; console.log(`FAIL  ${l}${x ? "  — " + x : ""}`); } };

async function poll(fn, seconds = 45) {
  for (let i = 0; i < seconds; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

const bodyTail = async (page) => (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-300);
const expand = async (page, title) => {
  const header = page.locator('button[aria-expanded="false"]').filter({ hasText: title }).first();
  if (await header.count()) await header.click();
};

// ---- reading a PDF: its fonts and the colours its drawing uses
function pdfFacts(buf) {
  const bytes = Buffer.from(buf);
  const text = bytes.toString("latin1");
  const fonts = [...new Set([...text.matchAll(/\/BaseFont \/(?:[A-Z]{6}\+)?([A-Za-z-]+)/g)].map((m) => m[1]))];
  let drawing = "";
  const re = /<<([\s\S]*?)>>\s*stream\r?\n/g;
  let m;
  while ((m = re.exec(text))) {
    const len = Number((/\/Length (\d+)/.exec(m[1]) || [])[1]);
    if (/\/Subtype \/Image|\/Length1/.test(m[1])) continue;
    const raw = bytes.subarray(m.index + m[0].length, m.index + m[0].length + len);
    try { drawing += (/FlateDecode/.test(m[1]) ? inflateSync(raw) : raw).toString("latin1"); } catch { /* not a drawing */ }
  }
  const hasColor = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const near = (a, x) => Math.abs(Number(a) - x) < 0.002;
    return [...drawing.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) (?:scn|rg|SCN|RG)/g)].some((c) => near(c[1], r) && near(c[2], g) && near(c[3], b));
  };
  const size = (/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(text) || []).slice(1).map(Number);
  return { fonts, hasColor, size, isPdf: text.startsWith("%PDF") };
}

// Embedded fonts are named by their PostScript names: Carlito-Regular, Lato-Bold.
const hasFont = (facts, family) => facts.fonts.some((f) => f === family || f.startsWith(family + "-"));

// ---- a small Word document in the reference contract's style
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const run = (t, rpr = "") => `<w:r><w:rPr>${rpr}<w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">${t}</w:t></w:r>`;
const heading = (t) =>
  `<w:p><w:pPr><w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="6" w:color="52BE96"/></w:pBdr><w:spacing w:before="200" w:after="80" w:line="240" w:lineRule="auto"/><w:outlineLvl w:val="0"/></w:pPr>${run(t, '<w:b/><w:color w:val="52BE96"/><w:sz w:val="23"/>')}</w:p>`;
const bullet = (t) => `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="7"/></w:numPr><w:spacing w:after="40" w:line="252" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr>${run(t)}</w:p>`;
const para = (t) => `<w:p><w:pPr><w:spacing w:after="60" w:line="252" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr>${run(t)}</w:p>`;
const cell = (t, fill, color) =>
  `<w:tc><w:tcPr>${fill ? `<w:shd w:val="clear" w:fill="${fill}"/>` : ""}</w:tcPr><w:p>${run(t, color ? `<w:b/><w:color w:val="${color}"/>` : "")}</w:p></w:tc>`;
const DOCX_XML = {
  "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  "word/styles.xml": `<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>`,
  "word/numbering.xml": `<w:numbering ${W}><w:abstractNum w:abstractNumId="3"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="▪"/><w:rPr><w:rFonts w:ascii="Arial"/><w:color w:val="52BE96"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="7"><w:abstractNumId w:val="3"/></w:num></w:numbering>`,
  "word/document.xml": `<w:document ${W}><w:body>${
    heading("1. Scope of Services") +
    bullet("Student Counselling: one to one counselling for the zztmp builder check.") +
    bullet("Securing Admission: applications to five universities.") +
    para("On signing, the student will receive access to the portal.") +
    heading("2. Professional Fee") +
    `<w:tbl><w:tblPr><w:tblBorders><w:insideH w:val="single" w:sz="4" w:color="726F73"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="8200"/><w:gridCol w:w="2600"/></w:tblGrid>
      <w:tr>${cell("Payment", "52BE96", "FFFFFF")}${cell("Amount", "52BE96", "FFFFFF")}</w:tr>
      <w:tr>${cell("Administrative charges (non refundable), paid on signing")}${cell("300 €")}</w:tr>
      <w:tr>${cell("First installment, paid on signing")}${cell("900 €")}</w:tr>
      <w:tr>${cell("Second installment, paid on acceptance from the first university")}${cell("900 €")}</w:tr>
      <w:tr>${cell("Total Professional Fee", "EEF8F4")}${cell("2,100 €", "EEF8F4")}</w:tr></w:tbl>` +
    heading("3. Declaration") +
    para("The client confirms they have read this agreement.") +
    `<w:p>${run("_________________________________")}</w:p><w:p>${run("(Signature) Client")}</w:p>`
  }<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr></w:body></w:document>`,
};
const zip = new JSZip();
for (const [path, xml] of Object.entries(DOCX_XML)) zip.file(path, xml);
const DOCX = await zip.generateAsync({ type: "nodebuffer" });

const TEMPLATE_NAME = "zztmp Builder template";
const GREEN = "#52be96";
const RED = "#c00000";
let studentId = null;

async function blobBytes(page, src) {
  const b64 = await page.evaluate(async (url) => {
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, src);
  return Buffer.from(b64, "base64");
}

async function previewPdf(page) {
  await page.getByRole("button", { name: "Preview PDF" }).click();
  const frame = page.locator('iframe[title="Agreement preview"]');
  const shown = await frame.waitFor({ timeout: 90000 }).then(() => true, () => false);
  if (!shown) return { error: await bodyTail(page) };
  const bytes = await blobBytes(page, await frame.getAttribute("src"));
  await page.getByRole("dialog", { name: "Preview of the agreement PDF" }).getByRole("button", { name: "Close" }).click();
  return { bytes };
}

try {
  const sup = await fx.staff("buildersuper", ["super_admin"]);
  const { data: italy } = await admin.from("destinations").select("id, display_name").eq("display_name", "Italy (Public)").single();
  const page = await signIn(browser, sup.email);

  // ======================================================== the import
  console.log("\n--- importing a Word contract ---");
  await page.goto(`${BASE}/setup/agreement-templates`, { waitUntil: "domcontentloaded" });
  const addButton = page.getByRole("button", { name: "Add template" });
  await addButton.waitFor({ timeout: 30000 });
  const form = page.locator("form").filter({ has: addButton }).first();
  await form.locator('select[name="destination_id"]').selectOption(italy.id);
  await form.locator('input[name="name"]').fill(TEMPLATE_NAME);
  await form.locator('input[name="signatory_name"]').fill("zztmp Signatory");
  await form.locator('input[type="file"]').setInputFiles({
    name: "zztmp-contract.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: DOCX,
  });
  const notes = form.getByRole("status").filter({ hasText: "Imported" });
  const imported = await notes.waitFor({ timeout: 60000 }).then(() => true, () => false);
  ok("the Word file is imported, with a note of what came across", imported, await bodyTail(page));
  const noteText = imported ? (await notes.innerText()).replace(/\s+/g, " ") : "";
  ok("...its payment table became the payment chart", /payment chart/i.test(noteText), noteText);
  ok("...its signature lines were left out", /signature lines/i.test(noteText), noteText);
  ok("...and its page and body text were read", /US Letter/.test(noteText) && /Carlito/.test(noteText), noteText);

  const wordingField = form.locator('input[type="hidden"][name="wording"]');
  const designField = form.locator('input[type="hidden"][name="design"]');
  await form.locator("[data-page-break], .ProseMirror h1").first().waitFor({ timeout: 15000 }).catch(() => {});
  const editorH1 = form.locator(".ProseMirror h1").first();
  ok("the editor shows the contract's headings as headings", (await editorH1.count()) > 0 && /Scope of Services/.test(await editorH1.innerText()));
  ok("...drawn in the imported green", (await editorH1.evaluate((el) => getComputedStyle(el).color)) === "rgb(82, 190, 150)");
  let wording = await wordingField.inputValue();
  ok("the wording holds the payment chart, not the sample figures", wording.includes("{{fee_table}}") && !wording.includes("<table"), wording.slice(0, 200));
  ok("...and not the signature lines", !/\(Signature\)|_____/.test(wording));
  let design = JSON.parse((await designField.inputValue()) || "null");
  ok("Page & theme is set from the document", design?.page?.size === "LETTER" && design?.body?.font === "Carlito" && design?.headings?.[0]?.rule === GREEN,
    JSON.stringify(design?.page) + JSON.stringify(design?.body));
  ok("...with the payment table's colours and wording", design?.table?.headerFill === GREEN && design?.table?.totalFill === "#eef8f4" &&
    design?.fee?.two?.[1]?.label === "Second installment, paid on acceptance from the first university", JSON.stringify(design?.fee?.two));

  // ======================================================== the toolbar
  console.log("\n--- the toolbar ---");
  const firstPara = form.locator(".ProseMirror p", { hasText: "On signing" }).first();
  await firstPara.click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await form.getByRole("button", { name: "Text colour" }).click();
  await form.getByRole("button", { name: "Red", exact: true }).click();
  await form.getByRole("combobox", { name: "Font", exact: true }).selectOption("Lato");
  // The browser writes back a colour it has parsed as rgb(); the PDF reads either.
  const hasRed = (w) => w.includes(RED) || w.includes("rgb(192, 0, 0)");
  wording = await poll(async () => {
    const w = await wordingField.inputValue();
    return hasRed(w) && w.includes("Lato") ? w : null;
  }, 10);
  ok("a text colour and a font reach the wording", Boolean(wording), (await wordingField.inputValue()).slice(0, 400));

  await form.locator(".ProseMirror li", { hasText: "Securing Admission" }).first().click();
  await form.getByRole("combobox", { name: "Bullets and numbering" }).selectOption("bullet:check");
  const withBullet = await poll(async () => ((await wordingField.inputValue()).includes('data-bullet="check"') ? true : null), 10);
  ok("a list's own bullet reaches the wording", Boolean(withBullet));

  await form.getByRole("tab", { name: /Page & theme/ }).click();
  await form.getByRole("combobox", { name: "Body size" }).selectOption("11");
  design = JSON.parse((await designField.inputValue()) || "null");
  ok("a Page & theme change reaches the design", design?.body?.size === 11, JSON.stringify(design?.body));
  await form.getByRole("tab", { name: "Wording" }).click();

  // ======================================================== the preview
  console.log("\n--- the preview ---");
  const preview = await previewPdf(page);
  ok("Preview PDF makes a PDF", preview.bytes && pdfFacts(preview.bytes).isPdf, preview.error);
  if (preview.bytes) {
    const facts = pdfFacts(preview.bytes);
    ok("...on US Letter paper", Math.round(facts.size[0]) === 612 && Math.round(facts.size[1]) === 792, JSON.stringify(facts.size));
    ok("...in the template's fonts", hasFont(facts, "Carlito") && hasFont(facts, "Lato"), facts.fonts.join(", "));
    ok("...and its colours: the green headings and chart, the red text", facts.hasColor(GREEN) && facts.hasColor(RED) && facts.hasColor("#eef8f4"));
  }

  // ======================================================== saving
  console.log("\n--- saving ---");
  await addButton.click();
  const saved = await poll(async () => (await admin.from("agreement_templates").select("id, design, wording, file_path").eq("name", TEMPLATE_NAME).maybeSingle()).data);
  ok("the template is saved", Boolean(saved), await bodyTail(page));
  ok("...with its design", saved?.design?.body?.size === 11 && saved?.design?.page?.size === "LETTER", JSON.stringify(saved?.design?.body));
  ok("...and its formatted wording", /Lato/.test(saved?.wording ?? "") && hasRed(saved?.wording ?? "") && saved?.wording?.includes("{{fee_table}}"));

  // ======================================================== generating a real agreement
  console.log("\n--- a student's agreement from it ---");
  studentId = await fx.lead({
    full_name: "zztmp Builder Student",
    email: "zztmp-builder@example.invalid",
    contact_number: "0300-9999999",
    status: "registered",
    registration_status: "registered",
    registered_at: new Date().toISOString(),
    date_of_inquiry: new Date().toISOString().slice(0, 10),
    country_of_interest: "Italy (Public)",
    date_of_birth: "2002-04-17",
    address: "12 Test Street, Karachi",
    intake: "Fall 2099",
    level_applying_for: "masters",
  });
  await admin.from("lead_destinations").insert({ lead_id: studentId, destination_id: italy.id });
  await admin.from("student_profiles").upsert({
    student_id: studentId, emergency_contact_name: "zztmp Next of Kin", emergency_contact_relation: "Father", emergency_contact_number: "0300-1111111",
  }, { onConflict: "student_id" });
  const { data: agreement, error: agreementError } = await admin.from("agreements")
    .insert({ student_id: studentId, template_id: saved?.id, status: "draft", signing_method: "paper", installment_count: 2 })
    .select("id").single();
  ok("a draft agreement on the template", Boolean(agreement), agreementError?.message);

  async function generate() {
    await page.goto(`${BASE}/students/${studentId}`, { waitUntil: "domcontentloaded" });
    await expand(page, "Agreement");
    const button = page.getByRole("button", { name: /^(Re)?generate PDF$/i }).first();
    await button.waitFor({ timeout: 30000 }).catch(() => {});
    const before = (await admin.from("agreements").select("pdf_path, updated_at").eq("id", agreement.id).single()).data;
    await button.click();
    const after = await poll(async () => {
      const { data } = await admin.from("agreements").select("pdf_path, updated_at").eq("id", agreement.id).single();
      return data?.pdf_path && data.updated_at !== before?.updated_at ? data : null;
    }, 90);
    const said = (await button.locator("xpath=following-sibling::p").allInnerTexts().catch(() => [])).join(" ").trim();
    if (!after) return { error: said || (await bodyTail(page)) };
    const { data: file } = await admin.storage.from("documents").download(after.pdf_path);
    return { bytes: Buffer.from(await file.arrayBuffer()) };
  }

  if (agreement) {
    const themed = await generate();
    ok("its PDF is generated", Boolean(themed.bytes), themed.error);
    if (themed.bytes) {
      const facts = pdfFacts(themed.bytes);
      ok("...embedding the builder's fonts, on the server that makes real agreements", hasFont(facts, "Carlito") && hasFont(facts, "Lato"), facts.fonts.join(", "));
      ok("...drawn in the template's colours", facts.hasColor(GREEN) && facts.hasColor(RED));
      ok("...on the template's paper", Math.round(facts.size[0]) === 612, JSON.stringify(facts.size));
    }

    // ====================================================== Classic
    console.log("\n--- a Classic template ---");
    const { data: classic } = await admin.from("agreement_templates").select("id, name").is("design", null).neq("wording", "").eq("destination_id", italy.id).limit(1).maybeSingle();
    if (classic) {
      await admin.from("agreements").update({ template_id: classic.id }).eq("id", agreement.id);
      const plain = await generate();
      ok(`a template with no design ("${classic.name}") still generates`, Boolean(plain.bytes), plain.error);
      if (plain.bytes) {
        const facts = pdfFacts(plain.bytes);
        ok("...in the Classic fonts, embedding none of the builder's", facts.fonts.includes("Times-Roman") && !facts.fonts.some((f) => /Carlito|Lato|Arimo/.test(f)), facts.fonts.join(", "));
        ok("...on A4, as it always has", Math.round(facts.size[0]) === 595, JSON.stringify(facts.size));
      }
    } else {
      ok("a Classic Italy template to compare against exists", false, "none with wording and no design");
    }
  }

  // ======================================================== back to Classic
  console.log("\n--- switching a template back to Classic ---");
  if (saved) {
    await page.goto(`${BASE}/setup/agreement-templates/${saved.id}`, { waitUntil: "domcontentloaded" });
    const save = page.getByRole("button", { name: "Save changes" });
    await save.waitFor({ timeout: 30000 });
    const editForm = page.locator("form").filter({ has: save }).first();
    const tab = editForm.getByRole("tab", { name: /Page & theme/ });
    ok("the edit page opens with the saved design", !/Classic/.test(await tab.innerText()), await tab.innerText());
    await tab.click();
    await editForm.getByRole("button", { name: /^Classic/ }).click();
    await save.click();
    const reverted = await poll(async () => {
      const { data } = await admin.from("agreement_templates").select("design").eq("id", saved.id).single();
      return data && data.design === null ? data : null;
    });
    ok("choosing Classic stores no design", Boolean(reverted), await bodyTail(page));
  }

  // ======================================================== staff templates
  console.log("\n--- the staff template builder ---");
  await page.goto(`${BASE}/setup/agreement-templates?tab=staff`, { waitUntil: "domcontentloaded" });
  const staffAdd = page.getByRole("button", { name: "Add template" });
  const hasStaff = await staffAdd.waitFor({ timeout: 30000 }).then(() => true, () => false);
  ok("the staff tab has the same builder", hasStaff && (await page.getByRole("tab", { name: /Page & theme/ }).count()) > 0, await bodyTail(page));
  if (hasStaff) {
    const staffForm = page.locator("form").filter({ has: staffAdd }).first();
    await staffForm.locator('input[name="name"]').fill("zztmp Staff builder");
    await staffForm.locator(".ProseMirror").click();
    await page.keyboard.type("This agreement is between HMARK and {{staff_name}}.");
    await staffForm.getByRole("tab", { name: /Page & theme/ }).click();
    await staffForm.getByRole("button", { name: /^Designed/ }).click();
    await staffForm.getByRole("tab", { name: "Wording" }).click();
    const staffPreview = await previewPdf(page);
    ok("...and its preview is a PDF in the chosen look", staffPreview.bytes && hasFont(pdfFacts(staffPreview.bytes), "Carlito"),
      staffPreview.error ?? (staffPreview.bytes ? pdfFacts(staffPreview.bytes).fonts.join(", ") : ""));
  }
} finally {
  const { data: made } = await admin.from("agreement_templates").select("id, file_path").eq("name", TEMPLATE_NAME);
  if (studentId) {
    const { data: files } = await admin.from("agreements").select("pdf_path").eq("student_id", studentId);
    const paths = (files ?? []).map((f) => f.pdf_path).filter(Boolean);
    if (paths.length) await admin.storage.from("documents").remove(paths);
    await admin.from("agreements").delete().eq("student_id", studentId);
  }
  for (const t of made ?? []) {
    if (t.file_path) await admin.storage.from("documents").remove([t.file_path]);
    await admin.from("agreement_templates").delete().eq("id", t.id);
  }
  await admin.from("staff_agreement_templates").delete().eq("name", "zztmp Staff builder");
  const n = await fx.cleanup();
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed  (${n} fixtures removed)`);
  process.exitCode = fail ? 1 : 0;
}
