// The leads list's columns, its Excel template, import and export, and its
// row colours, end to end against a deployed portal.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:leadimport
//
//   the list      Current qualification, Applying for and Course of interest
//                 come right after Country, each lead's in its own column;
//                 rows are striped, the one under the pointer is lit, and the
//                 one clicked stays marked.
//   template      an .xlsx with the list's columns; Month is a formula on the
//                 Inquiry date; Applying for, Status and Counselor have
//                 dropdowns from a hidden Lists sheet.
//   import        an .xlsx: a new lead is filed with every column; two rows
//                 for one person are read as one; the example row is skipped;
//                 a new lead with no Counselor goes to Muhammad Usman, with
//                 its remark, though the importer cannot open it;
//                 a lead already on file (matched by its phone written another
//                 way) is added to and never overwritten — an empty email
//                 filled, a new country added beside the old, a remark added
//                 to the one there as a new version, a follow-up added, its
//                 level and status kept and said so; a lead the importer
//                 cannot open is left alone and said so.
//   export        the same columns, every lead the viewer can see and none
//                 they cannot; imported straight back it changes nothing.
//
// Everything is named zztmp and removed in a finally.
import { createRequire } from "node:module";
import { BASE, apiAs, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";
import { LEAD_COLUMNS, orderedLeadColumns } from "../src/lib/leadSheet.ts";

requireConfirmation("check:leadimport");

const require = createRequire(import.meta.url);
let ExcelJS;
try {
  ExcelJS = require("exceljs");
} catch {
  console.error("This check reads workbooks with exceljs: npm install --no-save playwright pg exceljs");
  process.exit(1);
}

const { admin, url, anonKey } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const karachiToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
const NEW_A = "zztmp Import Alpha";
// Long enough that no column could show them on one line.
const GERMANY = "Germany (Munich, Berlin or Hamburg, public universities only)";
const COUNTRIES = `Italy; ${GERMANY}`;
const LONG_COURSE = "zztmp Data Science, Artificial Intelligence or Business Analytics, preferably taught in English with an internship";
const NEW_B = "zztmp Import Bravo";
const EXISTING = "zztmp Import Existing";
const HIDDEN = "zztmp Import Hidden";
// The columns in the order a Super Admin has arranged them (0313) — the order
// the list, the template and the export all follow.
const { data: savedOrder } = await admin.from("list_column_orders").select("column_keys").eq("list_key", "leads").maybeSingle();
const HEADERS = orderedLeadColumns(savedOrder?.column_keys).map((col) => col.header);
/** A column's letter in the workbook, by its heading. */
const letter = (h) => String.fromCharCode(65 + HEADERS.indexOf(h));
/** What the list heads each column, in the same order: Follow-up for the date and its note. */
const listHeaders = (order) =>
  orderedLeadColumns(order)
    .filter((col) => col.key !== "follow_up_note")
    .map((col) => (col.key === "follow_up_date" ? "follow-up" : col.header.toLowerCase()));

const cellText = (v) => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object" && "formula" in v) return `=${v.formula}`;
  if (typeof v === "object" && "richText" in v) return v.richText.map((r) => r.text).join("");
  return String(v);
};

async function poll(fn, seconds = 30) {
  for (let i = 0; i < seconds; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

async function readBook(buffer) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer);
  return book;
}

/** A workbook in the template's shape, with these rows under the headers. */
async function bookOf(rows) {
  const book = new ExcelJS.Workbook();
  const ws = book.addWorksheet("Leads");
  ws.addRow(HEADERS);
  for (const r of rows) ws.addRow(HEADERS.map((h) => r[h] ?? null));
  return Buffer.from(await book.xlsx.writeBuffer());
}

async function importFile(page, name, buffer) {
  await page.goto(`${BASE}/leads`, { waitUntil: "domcontentloaded" });
  const panel = page.locator("details", { hasText: "Import leads from Excel" });
  await panel.waitFor({ timeout: 60000 });
  await panel.locator("summary").click();
  await page.waitForFunction(() => {
    const input = document.querySelector('details input[type="file"]');
    return Boolean(input && Object.keys(input).some((k) => k.startsWith("__reactProps")));
  }, null, { timeout: 30000 });
  await panel.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer,
  });
  await panel.getByRole("button", { name: "Import", exact: true }).click();
  const summary = panel.locator("[data-import-summary]");
  await summary.waitFor({ timeout: 90000 });
  return (await summary.innerText()).replace(/\s+/g, " ");
}

let browser = null;

try {
  const counsellor = await fx.staff("leadimportown", ["counselor"]);
  const other = await fx.staff("leadimportother", ["counselor"]);
  const existingId = await fx.lead({
    full_name: EXISTING,
    contact_number: "0300-9999981",
    email: null,
    country_of_interest: "Italy",
    level_applying_for: "bachelors",
    status: "potential",
    date_of_inquiry: "2026-08-03",
    assigned_counselor_id: counsellor.id,
  });
  await admin.from("lead_remarks").insert({ lead_id: existingId, body: "zztmp Old remark", written_by: counsellor.id });
  await fx.lead({
    full_name: HIDDEN,
    contact_number: "0300-9999982",
    status: "potential",
    date_of_inquiry: karachiToday(),
    assigned_counselor_id: other.id,
  });

  browser = await openBrowser();
  const page = await signIn(browser, counsellor.email);

  // ---------------------------------------------------------- template
  console.log("\n--- template ---");
  const tpl = await page.request.get(`${BASE}/api/samples/leads`);
  ok("the template downloads as an .xlsx", tpl.ok() && /spreadsheetml/.test(tpl.headers()["content-type"] ?? ""), String(tpl.status()));
  const tplBook = await readBook(await tpl.body());
  const tplSheet = tplBook.getWorksheet("Leads");
  const tplHeaders = (tplSheet.getRow(1).values ?? []).slice(1).map(cellText);
  ok("...with the list's columns, in its order", JSON.stringify(tplHeaders) === JSON.stringify(HEADERS), tplHeaders.join(" | "));
  ok("...Month a formula on the Inquiry date, in the example row and the blank ones below",
    cellText(tplSheet.getCell(`${letter("Month")}2`).value) === `=IF(${letter("Inquiry date")}2="","",TEXT(${letter("Inquiry date")}2,"mmm yyyy"))` &&
      cellText(tplSheet.getCell(`${letter("Month")}50`).value).includes(`${letter("Inquiry date")}50`),
    cellText(tplSheet.getCell("A2").value));
  ok("...an example row the import will skip", cellText(tplSheet.getCell(`${String.fromCharCode(65 + HEADERS.indexOf("Name"))}2`).value).startsWith("Example Student"));
  const lists = tplBook.getWorksheet("Lists");
  ok("...the dropdown lists on a hidden sheet", lists?.state === "veryHidden", lists?.state);
  const dv = (addr) => tplSheet.getCell(addr).dataValidation;
  // Found by heading, so a column added before them does not move the check.
  const colOf = (h) => String.fromCharCode(65 + HEADERS.indexOf(h));
  ok("...Applying for, Status and Counselor with dropdowns",
    ["Applying for", "Status", "Counselor"].every((h) => dv(`${colOf(h)}2`)?.type === "list"),
    JSON.stringify(Object.fromEntries(["Applying for", "Status", "Counselor"].map((h) => [h, dv(`${colOf(h)}2`)?.formulae]))));
  const statusList = [];
  for (let r = 2; r <= 30; r++) if (lists?.getCell(`B${r}`).value) statusList.push(cellText(lists.getCell(`B${r}`).value));
  ok("...the statuses being the list's, less Registered", statusList.includes("Potential") && !statusList.includes("Registered"), statusList.join(", "));

  // ------------------------------------------------------------- import
  console.log("\n--- import ---");
  const sheet = await bookOf([
    { Name: "Example Student (delete this row)", Email: "zztmp-example@hmark-test.local" },
    {
      Name: NEW_A,
      "Contact number": "0300-9999983",
      Email: "zztmp-import-alpha@hmark-test.local",
      City: "Karachi",
      Country: "Italy",
      "Current qualification": "A-Levels",
      "Applying for": "Masters",
      "Course of interest": LONG_COURSE,
      Status: "Meeting Done",
      Counselor: counsellor.name,
      Remarks: "zztmp Met at the fair",
      "Follow-up date": new Date("2026-10-20T00:00:00Z"),
      "Follow-up note": "zztmp Send the Milan list",
      "Inquiry date": new Date("2026-09-14T00:00:00Z"),
      Source: "Education fair",
    },
    // The same person again, by email: read as one.
    { Name: NEW_A, Email: "ZZTMP-import-alpha@hmark-test.local", Country: GERMANY, Remarks: "zztmp Also asked about Germany" },
    { Name: NEW_B, "Contact number": "0300-9999984", "Applying for": "Diploma", Remarks: "zztmp Bravo remark" },
    {
      Name: EXISTING,
      "Contact number": "+92 300 9999981",
      Email: "zztmp-import-existing@hmark-test.local",
      Country: "Hungary",
      "Applying for": "masters",
      Status: "Meeting Done",
      Remarks: "zztmp New remark",
      "Follow-up date": "2026-10-25",
    },
    { Name: HIDDEN, "Contact number": "03009999982", Country: "Spain" },
  ]);
  const summary = await importFile(page, "leads.xlsx", sheet);
  ok("the import says what it did", /2 new leads added · 1 already on file and added to · 1 already on file with nothing new/.test(summary), summary);
  ok("...and why, lead by lead",
    /kept the lead's own applying for bachelors \(the sheet says masters\)/.test(summary) &&
      /zztmp Import Hidden: already on file as a lead you cannot open/.test(summary) &&
      /Diploma is not bachelors, masters or phd/.test(summary),
    summary);

  const leadByName = async (name) =>
    (
      await admin
        .from("leads")
        .select("id, full_name, contact_number, email, city, country_of_interest, current_qualification, level_applying_for, course_of_interest, status, assigned_counselor_id, date_of_inquiry, platform_source")
        .eq("full_name", name)
    ).data ?? [];
  const current = async (id) => (await admin.from("lead_remark_current").select("body").eq("lead_id", id).maybeSingle()).data?.body ?? null;
  const followUps = async (id) => (await admin.from("reminders").select("due_date, note").eq("student_id", id).eq("type", "follow_up").order("due_date")).data ?? [];

  const alpha = await leadByName(NEW_A);
  ok("a new lead is filed once, though the file had it twice", alpha.length === 1, String(alpha.length));
  const a = alpha[0] ?? {};
  ok("...with every column of the sheet",
    a.contact_number === "0300-9999983" && a.email === "zztmp-import-alpha@hmark-test.local" && a.current_qualification === "A-Levels" &&
      a.level_applying_for === "masters" && a.course_of_interest === LONG_COURSE && a.status === "meeting_done" &&
      a.assigned_counselor_id === counsellor.id && a.date_of_inquiry === "2026-09-14" && a.platform_source === "Education fair" && a.city === "Karachi",
    JSON.stringify(a));
  ok("...the second row's country beside the first's", a.country_of_interest === COUNTRIES, a.country_of_interest);
  ok("...and both rows' remarks", (await current(a.id)) === "zztmp Met at the fair\nzztmp Also asked about Germany", await current(a.id));
  const aFollow = await followUps(a.id);
  ok("...and its follow-up", aFollow.length === 1 && aFollow[0].due_date === "2026-10-20" && aFollow[0].note === "zztmp Send the Milan list", JSON.stringify(aFollow));

  const b = (await leadByName(NEW_B))[0] ?? {};
  ok("a lead with no status or inquiry date takes Potential and today", b.status === "potential" && b.date_of_inquiry === karachiToday(), JSON.stringify(b));
  ok("...and a level it cannot use is left out", b.level_applying_for === null);
  const { data: usman } = await admin.from("staff").select("id").eq("full_name", "Muhammad Usman").contains("roles", ["counselor"]).eq("status", "active").maybeSingle();
  ok("a new lead with no Counselor goes to Muhammad Usman", Boolean(usman) && b.assigned_counselor_id === usman.id, b.assigned_counselor_id);
  ok("...with its remark, though the importer cannot open it", (await current(b.id)) === "zztmp Bravo remark", await current(b.id));
  ok("the template's example row is not filed", (await leadByName("Example Student (delete this row)")).every((l) => l.email !== "zztmp-example@hmark-test.local"));

  const e = (await leadByName(EXISTING))[0] ?? {};
  ok("a lead on file has its empty email filled in", e.email === "zztmp-import-existing@hmark-test.local", e.email);
  ok("...a new country added beside the old", e.country_of_interest === "Italy; Hungary", e.country_of_interest);
  ok("...its level, status and phone kept", e.level_applying_for === "bachelors" && e.status === "potential" && e.contact_number === "0300-9999981", JSON.stringify(e));
  const versions = (await admin.from("lead_remarks").select("body").eq("lead_id", existingId).order("created_at")).data ?? [];
  ok("...the remark added to the one there, as a new version", versions.length === 2 && versions[1].body === "zztmp Old remark\nzztmp New remark", JSON.stringify(versions));
  const eFollow = await followUps(existingId);
  ok("...and a follow-up added", eFollow.length === 1 && eFollow[0].due_date === "2026-10-25", JSON.stringify(eFollow));

  const h = (await leadByName(HIDDEN))[0] ?? {};
  ok("a lead the importer cannot open is left as it is, and not filed twice", (await leadByName(HIDDEN)).length === 1 && h.country_of_interest === null, JSON.stringify(h));

  // ----------------------------------------------------------- the list
  console.log("\n--- the list ---");
  await page.goto(`${BASE}/leads`, { waitUntil: "domcontentloaded" });
  const search = page.getByPlaceholder("Search name, contact, course, remarks…");
  await search.waitFor({ timeout: 60000 });
  await page.waitForFunction(() => {
    const i = document.querySelector('input[placeholder="Search name, contact, course, remarks…"]');
    return Boolean(i && Object.keys(i).some((k) => k.startsWith("__reactProps")));
  }, null, { timeout: 30000 });
  await search.fill("zztmp Import");
  await page.locator("tbody tr", { hasText: NEW_A }).waitFor({ timeout: 30000 });
  const headers = (await page.locator("thead th").allInnerTexts()).map((t) => t.trim().toLowerCase());
  const c = headers.indexOf("country");
  const shown = headers.filter((h) => h && h !== "#");
  ok("the list has every column, each lead's in its own, in the arranged order",
    JSON.stringify(shown) === JSON.stringify(listHeaders(savedOrder?.column_keys)), shown.join(" | "));
  const alphaRow = page.locator("tbody tr", { hasText: NEW_A });
  const alphaCells = (await alphaRow.locator("td").allInnerTexts()).map((t) => t.trim());
  ok("...and the lead's own values in them", alphaCells[c] === COUNTRIES && alphaCells[c + 1] === "A-Levels" && alphaCells[c + 2] === "Masters" && alphaCells[c + 3] === LONG_COURSE,
    alphaCells.join(" | "));
  ok("...the Month worked out from the inquiry date", alphaCells[headers.indexOf("month")] === "Sep 2026", alphaCells.join(" | "));
  ok("the export is the Excel one", (await page.locator("a[data-export-link]").getAttribute("href")) === "/api/export/leads");

  const bg = (loc) => loc.locator("td").nth(2).evaluate((el) => getComputedStyle(el).backgroundColor);
  const rows = page.locator("table[data-row-highlight] > tbody > tr");
  ok("the table is marked for row colours", (await rows.count()) >= 2, String(await rows.count()));
  await page.mouse.move(5, 5);
  const [first, second] = [await bg(rows.nth(0)), await bg(rows.nth(1))];
  ok("rows are striped", first !== second, `${first} / ${second}`);
  await rows.nth(1).hover();
  const hovered = await bg(rows.nth(1));
  ok("the row under the pointer is lit", hovered !== second && hovered !== first, hovered);
  await rows.nth(0).locator("td").nth(2).click();
  await page.mouse.move(5, 5);
  const clicked = await bg(rows.nth(0));
  ok("the row clicked stays marked once the pointer has gone", (await rows.nth(0).getAttribute("data-current")) !== null && clicked !== first && clicked !== second, clicked);

  // After the row colours, which need no row marked yet: a click on a cell marks its row.
  // A long value is cut short on its line, and opens whole in a pop-up on a click.
  const course = alphaRow.locator("td").nth(c + 3).locator("[data-long-text]");
  ok("a long value is cut short on one line",
    (await course.evaluate((el) => el.scrollWidth > el.clientWidth)) && (await course.getAttribute("data-cut")) !== null);
  await course.click();
  const longDialog = page.locator("dialog[open] [data-long-dialog]");
  await longDialog.waitFor({ timeout: 15000 });
  ok("...and a click opens the whole of it in a pop-up, titled with the column and the lead",
    (await longDialog.locator("[data-long-full]").innerText()).trim() === LONG_COURSE &&
      (await page.locator("dialog[open] h3").innerText()).trim() === `Course of interest — ${NEW_A}`,
    await page.locator("dialog[open]").innerText());
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("dialog[open]"), null, { timeout: 10000 });
  const country = alphaRow.locator("td").nth(c).locator("[data-long-text]");
  await country.click();
  await page.locator("dialog[open] [data-long-full] li").first().waitFor({ timeout: 15000 });
  ok("...several values in one cell are listed one to a line",
    JSON.stringify(await page.locator("dialog[open] [data-long-full] li").allInnerTexts()) === JSON.stringify(["Italy", GERMANY]));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("dialog[open]"), null, { timeout: 10000 });
  const source = alphaRow.locator("td").nth(headers.indexOf("source")).locator("[data-long-text]");
  // Not a button at all, so there is nothing for a click to open.
  ok("a value that fits is plain text, not something to click",
    (await source.innerText()).trim() === "Education fair" && (await source.getAttribute("data-cut")) === null && (await source.getAttribute("role")) === null);


  // ------------------------------------------------------------- export
  console.log("\n--- export ---");
  const exp = await page.request.get(`${BASE}/api/export/leads`);
  ok("the export downloads as an .xlsx", exp.ok() && /spreadsheetml/.test(exp.headers()["content-type"] ?? ""), String(exp.status()));
  const expBuffer = await exp.body();
  const expSheet = (await readBook(expBuffer)).getWorksheet("Leads");
  const expHeaders = (expSheet.getRow(1).values ?? []).slice(1).map(cellText);
  ok("...with the template's columns", JSON.stringify(expHeaders) === JSON.stringify(HEADERS), expHeaders.join(" | "));
  const NAME = HEADERS.indexOf("Name");
  const exported = [];
  expSheet.eachRow((row, n) => {
    if (n === 1) return;
    const cells = HEADERS.map((_, i) => cellText(row.getCell(i + 1).value));
    if (cells[NAME]) exported.push({ n, cells });
  });
  const names = exported.map((r) => r.cells[NAME]);
  ok("...every lead the viewer can see and none they cannot",
    names.includes(NEW_A) && names.includes(EXISTING) && !names.includes(HIDDEN), names.join(", "));
  const row = exported.find((r) => r.cells[NAME] === NEW_A)?.cells ?? [];
  const expectedCells = {
    City: "Karachi", Name: NEW_A, "Contact number": "0300-9999983", Email: "zztmp-import-alpha@hmark-test.local", Country: COUNTRIES,
    "Current qualification": "A-Levels", "Applying for": "masters", "Course of interest": LONG_COURSE, Status: "Meeting Done",
    Counselor: counsellor.name, Remarks: "zztmp Met at the fair\nzztmp Also asked about Germany", "Follow-up date": "2026-10-20",
    "Follow-up note": "zztmp Send the Milan list", "Inquiry date": "2026-09-14", Source: "Education fair",
  };
  const wrongCells = Object.entries(expectedCells).filter(([h, v]) => row[HEADERS.indexOf(h)] !== v).map(([h]) => h);
  ok("...each piece of a lead in its own cell", wrongCells.length === 0, `wrong: ${wrongCells.join(", ")} — ${JSON.stringify(row)}`);
  const n = exported.find((r) => r.cells[NAME] === NEW_A)?.n;
  const dateLetter = letter("Inquiry date");
  ok("...the Month a formula on that row's Inquiry date",
    row[HEADERS.indexOf("Month")] === `=IF(${dateLetter}${n}="","",TEXT(${dateLetter}${n},"mmm yyyy"))`, row[HEADERS.indexOf("Month")]);

  const back = await importFile(page, "leads-export.xlsx", expBuffer);
  ok("the export imported straight back changes nothing", /^0 new leads added · 0 already on file and added to · \d+ already on file with nothing new/.test(back), back);
  ok("...and adds no second remark or follow-up",
    (await current(a.id)) === "zztmp Met at the fair\nzztmp Also asked about Germany" && (await followUps(a.id)).length === 1 && (await followUps(existingId)).length === 1);

  // ------------------------------------------------------- arranging (0313)
  console.log("\n--- arranging the columns ---");
  const asCounsellor = await apiAs(url, anonKey, counsellor.email);
  const { error: counsellorWrite } = await asCounsellor.from("list_column_orders").upsert({ list_key: "leads", column_keys: ["email"] });
  ok("only a Super Admin may arrange the columns", Boolean(counsellorWrite), counsellorWrite?.message);

  const sup = await fx.staff("leadimportsa", ["super_admin"]);
  const supPage = await signIn(browser, sup.email);
  await supPage.goto(`${BASE}/leads`, { waitUntil: "domcontentloaded" });
  const arrange = supPage.locator("[data-arrange-columns]");
  await arrange.waitFor({ timeout: 60000 });
  await supPage.waitForFunction(() => {
    const b = document.querySelector("[data-arrange-columns]");
    return Boolean(b && Object.keys(b).some((k) => k.startsWith("__reactProps")));
  }, null, { timeout: 30000 });
  await arrange.click();
  const dialog = supPage.locator("[data-arrange-dialog]");
  await dialog.waitFor({ timeout: 15000 });
  // Source, wherever it is, to the very top.
  const items = async () => dialog.locator("[data-arrange-item]").evaluateAll((els) => els.map((e) => e.getAttribute("data-arrange-item")));
  for (let i = 0; i < LEAD_COLUMNS.length && (await items())[0] !== "platform_source"; i++) {
    await dialog.getByRole("button", { name: "Move Source up" }).click();
  }
  const wanted = await items();
  await dialog.getByRole("button", { name: "Save order" }).click();
  const saved = await poll(async () => {
    const { data } = await admin.from("list_column_orders").select("column_keys").eq("list_key", "leads").maybeSingle();
    return data?.column_keys?.[0] === "platform_source" ? data.column_keys : null;
  });
  ok("a Super Admin moves a column, and the order is saved", JSON.stringify(saved) === JSON.stringify(wanted), JSON.stringify(saved));
  await supPage.goto(`${BASE}/leads`, { waitUntil: "domcontentloaded" });
  await supPage.locator("thead th").first().waitFor({ timeout: 60000 });
  const arrangedHeaders = (await supPage.locator("thead th").allInnerTexts()).map((t) => t.trim().toLowerCase()).filter((h) => h && h !== "#");
  ok("...the list shows it, for everyone", JSON.stringify(arrangedHeaders) === JSON.stringify(listHeaders(saved)), arrangedHeaders.join(" | "));
  const arrangedExport = (await readBook(await (await supPage.request.get(`${BASE}/api/export/leads`)).body())).getWorksheet("Leads");
  const exportHeaders = (arrangedExport.getRow(1).values ?? []).slice(1).map(cellText);
  ok("...and the export follows it, Month still worked out from the Inquiry date",
    exportHeaders[0] === "Source" && JSON.stringify(exportHeaders) === JSON.stringify(orderedLeadColumns(saved).map((col) => col.header)) &&
      new RegExp(`^=IF\\(${String.fromCharCode(65 + exportHeaders.indexOf("Inquiry date"))}2=`).test(cellText(arrangedExport.getCell(`${String.fromCharCode(65 + exportHeaders.indexOf("Month"))}2`).value)),
    exportHeaders.join(" | "));

  await arrange.click();
  await dialog.waitFor({ timeout: 15000 });
  await dialog.getByRole("button", { name: "Reset to default" }).click();
  const reset = await poll(async () => !(await admin.from("list_column_orders").select("list_key").eq("list_key", "leads").maybeSingle()).data);
  ok("...and Reset to default puts every column back", Boolean(reset));
  await supPage.close();
} catch (e) {
  ok(`the check itself stopped: ${e?.stack ?? e}`, false);
} finally {
  await browser?.close().catch(() => {});
  // The office's own arrangement, as it was before the check.
  if (savedOrder?.column_keys) await admin.from("list_column_orders").upsert({ list_key: "leads", column_keys: savedOrder.column_keys });
  else await admin.from("list_column_orders").delete().eq("list_key", "leads");
  await admin.from("leads").delete().in("full_name", [NEW_A, NEW_B]);
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
