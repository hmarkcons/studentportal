// The documents checklist report (/reports/documents-checklist) and its PDF
// and Excel downloads, on the deployed portal.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:docchecklist
//
// Read-only on the real students: the only things it makes are three fixture
// staff, removed in a finally.
//
//   processing   sees the report's card on /reports and opens it; the table
//                lists every registered student, each one's approved / total
//                as the report's own builder works it out from the database
//                (read here with the service key), and "Left to do" opens to
//                that many documents by name
//   filters      "every document approved" shows only the complete students
//                (or says none match); the downloads carry the filters
//   PDF          a real PDF, named for the day, with the first student's name
//                and "Page 1 of" drawn in it
//   Excel        a real workbook with Summary, Checklist and Still to do sheets
//                and one Checklist row per document
//   picking      a student found in the picker by their Student ID, ticked and
//                applied, is shown alone and carried into the downloads; their
//                row's PDF button gives their checklist alone, named after
//                them; two chosen give a workbook of those two
//   management   is not offered it, is turned back from the page and refused
//                the download (403); so is a counsellor
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { BASE, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";
import { loadDocumentChecklist } from "../src/lib/documentChecklistLoad.ts";
import { DEFAULT_FILTERS } from "../src/lib/documentChecklistReport.ts";

requireConfirmation("check:docchecklist");

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();
const HREF = "/reports/documents-checklist";

/** The text drawn on a react-pdf file's pages: every content stream inflated, its hex strings decoded (WinAnsi). */
function pdfText(buf) {
  const s = buf.toString("latin1");
  const win = { 0x80: "€", 0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—" };
  let out = "";
  for (const m of s.matchAll(/<<([^>]*?)\/Length (\d+)[^>]*?>>\s*stream\r?\n/g)) {
    if (/Subtype \/Image|Length1/.test(m[1])) continue;
    const start = m.index + m[0].length;
    let txt;
    try {
      txt = inflateSync(buf.subarray(start, start + Number(m[2]))).toString("latin1");
    } catch {
      continue;
    }
    for (const tj of txt.matchAll(/\[(.*?)\]\s*TJ|<([0-9a-fA-F]+)>\s*Tj/g)) {
      for (const h of (tj[1] ?? `<${tj[2]}>`).matchAll(/<([0-9a-fA-F]+)>/g)) {
        for (let i = 0; i < h[1].length; i += 2) {
          const c = parseInt(h[1].slice(i, i + 2), 16);
          out += win[c] ?? String.fromCharCode(c);
        }
      }
      out += " ";
    }
  }
  return out;
}

let browser = null;
try {
  const proc = await fx.staff("docchkproc", ["processing"]);
  const mgmt = await fx.staff("docchkmgmt", ["management"]);
  const coun = await fx.staff("docchkcoun", ["counselor"]);

  // What the report should say, worked out from the database by the report's own builder.
  const expected = await loadDocumentChecklist(admin, DEFAULT_FILTERS);
  const want = expected.report.students;
  ok("there are registered students to report on", want.length > 0, `${want.length}`);

  browser = await openBrowser();

  // ---------------------------------------------------------------- processing
  const page = await signIn(browser, proc.email);
  await page.goto(`${BASE}/reports`, { waitUntil: "domcontentloaded" });
  ok("processing: the Documents checklist card is on Reports", (await page.locator(`a[href="${HREF}"]`).count()) > 0);

  await page.goto(`${BASE}${HREF}`, { waitUntil: "domcontentloaded" });
  await page.locator("table[data-documents-checklist]").waitFor({ timeout: 40000 });
  const rows = page.locator("tr[data-student-row]");
  ok("processing: every registered student is listed", (await rows.count()) === want.length, `${await rows.count()} rows, ${want.length} expected`);
  ok(
    "processing: it says how many of how many it is showing",
    (await page.locator(`[data-showing="${want.length}"]`).count()) === 1 && (await page.getByText(`of ${expected.registered} registered`).count()) > 0
  );

  let matched = 0;
  for (const s of want.slice(0, 8)) {
    const text = (await page.locator(`tr[data-student-row="${s.id}"]`).innerText()).replace(/\s+/g, " ");
    if (text.includes(`${s.counts.approved} / ${s.counts.total}`) && (s.percent === null || text.includes(`${s.percent}%`))) matched++;
    else console.log(`      ${s.name}: "${text.slice(0, 160)}" — expected ${s.counts.approved} / ${s.counts.total}, ${s.percent}%`);
  }
  ok("processing: each student's approved / total and percentage are the database's", matched === Math.min(8, want.length), `${matched} matched`);

  const owing = want.find((s) => s.counts.left + s.counts.review > 0);
  if (owing) {
    const row = page.locator(`tr[data-student-row="${owing.id}"]`);
    await row.locator("summary").click();
    const listed = await row.locator("details li").count();
    ok("processing: Left to do opens to each document still owed, by name", listed === owing.counts.left + owing.counts.review, `${listed} listed, ${owing.counts.left + owing.counts.review} owed`);
  }

  // A filter, applied as the form applies it, and carried into the downloads.
  await page.goto(`${BASE}${HREF}?show=complete`, { waitUntil: "domcontentloaded" });
  await page.locator("table[data-documents-checklist]").waitFor({ timeout: 40000 });
  const complete = want.filter((s) => s.counts.total > 0 && s.counts.approved === s.counts.total).length;
  const shown = await page.locator("tr[data-student-row]").count();
  ok("filter: only students with every document approved", shown === complete, `${shown} shown, ${complete} complete`);
  if (complete === 0) ok("filter: an empty result says so", (await page.getByText("No students match these filters.").count()) === 1);
  const pdfHref = await page.locator('button[data-download="pdf"]').getAttribute("data-href");
  ok("filter: the downloads carry it", pdfHref?.includes("show=complete") && pdfHref.includes("format=pdf"), pdfHref ?? "");

  // ---------------------------------------------------------------- downloads
  // Clicked, as staff click them: the button fetches the file and hands it to the browser.
  await page.goto(`${BASE}${HREF}`, { waitUntil: "domcontentloaded" });
  const clickDownload = async (format) => {
    const button = page.locator(`button[data-download="${format}"]`);
    const t0 = Date.now();
    const [file] = await Promise.all([page.waitForEvent("download", { timeout: 90000 }), button.click()]);
    const busy = await button.innerText();
    return { file, body: readFileSync(await file.path()), ms: Date.now() - t0, busy };
  };
  const { file: pdfFile, body: pdfBody, ms: pdfMs } = await clickDownload("pdf");
  ok("PDF: the button downloads it, named for the day", /^HMC-Documents-Checklist-\d{4}-\d{2}-\d{2}\.pdf$/.test(pdfFile.suggestedFilename()), pdfFile.suggestedFilename());
  ok("PDF: is a PDF", pdfBody.subarray(0, 5).toString() === "%PDF-");
  const drawn = pdfText(pdfBody);
  ok("PDF: the first student is in it, with page numbers", drawn.includes(want[0].name) && /Page 1 of \d+/.test(drawn), want[0].name);
  console.log(`      PDF ${Math.round(pdfBody.length / 1024)} KB in ${(pdfMs / 1000).toFixed(1)}s`);

  const { file: xlsxFile, body: xlsxBody } = await clickDownload("xlsx");
  ok("Excel: the button downloads it, named for the day", /^HMC-Documents-Checklist-\d{4}-\d{2}-\d{2}\.xlsx$/.test(xlsxFile.suggestedFilename()), xlsxFile.suggestedFilename());
  ok("Excel: is a workbook", xlsxBody.subarray(0, 2).toString() === "PK");

  // The route itself, for its headers: a PDF, offered as an attachment.
  const direct = await page.request.get(`${BASE}${HREF}/download?format=pdf&show=complete`, { timeout: 90000 });
  ok(
    "PDF: the route answers with a PDF attachment",
    direct.status() === 200 && direct.headers()["content-type"] === "application/pdf" && /^attachment; filename="/.test(direct.headers()["content-disposition"] ?? ""),
    `${direct.status()} ${direct.headers()["content-type"]} ${direct.headers()["content-disposition"]}`
  );
  let ExcelJS = null;
  try {
    ExcelJS = (await import("exceljs")).default;
  } catch {
    console.log("      (exceljs not installed: the sheets are not read back — npm install --no-save playwright pg exceljs)");
  }
  if (ExcelJS) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsxBody);
    ok("Excel: Summary, Checklist and Still to do", wb.worksheets.map((w) => w.name).join("|") === "Summary|Checklist|Still to do", wb.worksheets.map((w) => w.name).join("|"));
    const docs = want.reduce((n, s) => n + s.counts.total, 0);
    const owed = want.reduce((n, s) => n + s.counts.total - s.counts.approved, 0);
    ok("Excel: one Checklist row per document", wb.getWorksheet("Checklist").actualRowCount === docs + 1, `${wb.getWorksheet("Checklist").actualRowCount} rows, ${docs} documents`);
    ok("Excel: Still to do holds only what is not approved", wb.getWorksheet("Still to do").actualRowCount === (owed || 1) + 1, `${wb.getWorksheet("Still to do").actualRowCount} rows, ${owed} owed`);
  }

  // ---------------------------------------------------------------- chosen students
  // Picked as staff pick them: searched for, ticked in the list, applied.
  const target = want.find((s) => s.counts.sentBack > 0) ?? want[0];
  const other = want.find((s) => s.id !== target.id && !s.name.includes(target.name) && !target.name.includes(s.name));
  await page.goto(`${BASE}${HREF}`, { waitUntil: "domcontentloaded" });
  await page.locator("table[data-documents-checklist]").waitFor({ timeout: 40000 });
  await page.locator("[data-student-picker] input[type=search]").fill(target.code ?? target.name);
  await page.locator(`[data-student-option="${target.id}"]`).click();
  ok("pick: the student found by search is shown as chosen", (await page.locator(`[data-picked="${target.id}"]`).count()) === 1);
  ok("pick: it says to press Apply", (await page.locator("[data-picker-pending]").count()) === 1);
  ok("pick: the list closes after a pick, out of Apply's way", (await page.locator("[data-student-picker] [role=listbox]").count()) === 0);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page.waitForURL((u) => u.searchParams.get("students") === target.id, { timeout: 40000 });
  await page.locator("table[data-documents-checklist]").waitFor({ timeout: 40000 });
  ok(
    "pick: Apply shows that student alone",
    (await page.locator("tr[data-student-row]").count()) === 1 && (await page.locator(`tr[data-student-row="${target.id}"]`).count()) === 1,
    `${await page.locator("tr[data-student-row]").count()} rows`
  );
  ok("pick: the choice is still shown after Apply", (await page.locator(`[data-picked="${target.id}"]`).count()) === 1);
  const pickedHref = await page.locator('button[data-download="pdf"]').getAttribute("data-href");
  ok("pick: the downloads carry it", pickedHref?.includes(`students=${target.id}`), pickedHref ?? "");

  // The row's own PDF button: that student's checklist, named after them, nobody else in it.
  const rowPdf = page.locator(`tr[data-student-row="${target.id}"] button[data-download="pdf-one"]`);
  const [one] = await Promise.all([page.waitForEvent("download", { timeout: 90000 }), rowPdf.click()]);
  const oneText = pdfText(readFileSync(await one.path()));
  ok(
    "row PDF: named after the student",
    one.suggestedFilename().startsWith("HMC-Documents-Checklist-") && (target.code ? one.suggestedFilename().includes(target.code) : true),
    one.suggestedFilename()
  );
  ok(
    "row PDF: their checklist alone, headed with their name",
    oneText.includes(`Student: ${target.name}`) && /Page 1 of \d+/.test(oneText) && !(other && oneText.includes(other.name)),
    target.name
  );

  // Two at once, from the address, as a workbook.
  if (other) {
    await page.goto(`${BASE}${HREF}?students=${target.id},${other.id}`, { waitUntil: "domcontentloaded" });
    await page.locator("table[data-documents-checklist]").waitFor({ timeout: 40000 });
    ok("pick: two students chosen, two shown", (await page.locator("tr[data-student-row]").count()) === 2 && (await page.locator("[data-picked]").count()) === 2);
    const [two] = await Promise.all([page.waitForEvent("download", { timeout: 90000 }), page.locator('button[data-download="xlsx"]').click()]);
    if (ExcelJS) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(readFileSync(await two.path()));
      // Column B below the title: the heading, a row per student, then "Total".
      const names = wb
        .getWorksheet("Summary")
        .getColumn(2)
        .values.filter((v) => typeof v === "string" && v !== "Student" && v !== "Total");
      ok("pick: the workbook's summary has the two of them", names.includes(target.name) && names.includes(other.name) && names.length === 2, names.join(" | "));
      ok(
        "pick: its checklist is their documents and no more",
        wb.getWorksheet("Checklist").actualRowCount === target.counts.total + other.counts.total + 1,
        `${wb.getWorksheet("Checklist").actualRowCount} rows`
      );
    }
  }
  await page.close();

  // ---------------------------------------------------------------- not for them
  for (const who of [mgmt, coun]) {
    const p = await signIn(browser, who.email);
    await p.goto(`${BASE}/reports`, { waitUntil: "domcontentloaded" });
    ok(`${who.name}: not offered on Reports`, (await p.locator(`a[href="${HREF}"]`).count()) === 0);
    await p.goto(`${BASE}${HREF}`, { waitUntil: "domcontentloaded" });
    ok(`${who.name}: the page does not show it`, (await p.locator("table[data-documents-checklist]").count()) === 0, p.url());
    const refused = await p.request.get(`${BASE}${HREF}/download?format=xlsx`);
    ok(`${who.name}: the download is refused`, refused.status() === 403, `${refused.status()}`);
    await p.close();
  }

  // Not signed in at all.
  const anon = await browser.newContext();
  const anonRes = await anon.request.get(`${BASE}${HREF}/download?format=pdf`, { maxRedirects: 0 });
  ok("signed out: no file", anonRes.status() !== 200 || !/pdf/.test(anonRes.headers()["content-type"] ?? ""), `${anonRes.status()}`);
  await anon.close();
} catch (e) {
  ok("the check ran to the end", false, e?.stack ?? String(e));
} finally {
  await browser?.close();
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) ? 1 : 0;
}
