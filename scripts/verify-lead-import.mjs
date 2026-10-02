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
import { BASE, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:leadimport");

const require = createRequire(import.meta.url);
let ExcelJS;
try {
  ExcelJS = require("exceljs");
} catch {
  console.error("This check reads workbooks with exceljs: npm install --no-save playwright pg exceljs");
  process.exit(1);
}

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const karachiToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
const NEW_A = "zztmp Import Alpha";
const NEW_B = "zztmp Import Bravo";
const EXISTING = "zztmp Import Existing";
const HIDDEN = "zztmp Import Hidden";
const HEADERS = [
  "Month", "Name", "Contact number", "Email", "Country", "Current qualification", "Applying for", "Course of interest",
  "Status", "Counselor", "Remarks", "Follow-up date", "Follow-up note", "Inquiry date", "Source",
];

async function poll(fn, seconds = 30) {
  for (let i = 0; i < seconds; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

const cellText = (v) => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object" && "formula" in v) return `=${v.formula}`;
  if (typeof v === "object" && "richText" in v) return v.richText.map((r) => r.text).join("");
  return String(v);
};

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
  const hiddenId = await fx.lead({
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
    /^=IF\(N2="","",TEXT\(N2,"mmm yyyy"\)\)$/.test(cellText(tplSheet.getCell("A2").value)) && /N50/.test(cellText(tplSheet.getCell("A50").value)),
    cellText(tplSheet.getCell("A2").value));
  ok("...an example row the import will skip", cellText(tplSheet.getCell("B2").value).startsWith("Example Student"));
  const lists = tplBook.getWorksheet("Lists");
  ok("...the dropdown lists on a hidden sheet", lists?.state === "veryHidden", lists?.state);
  const dv = (addr) => tplSheet.getCell(addr).dataValidation;
  ok("...Applying for, Status and Counselor with dropdowns",
    dv("G2")?.type === "list" && dv("I2")?.type === "list" && dv("J2")?.type === "list",
    JSON.stringify({ G: dv("G2")?.formulae, I: dv("I2")?.formulae, J: dv("J2")?.formulae }));
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
      Country: "Italy",
      "Current qualification": "A-Levels",
      "Applying for": "Masters",
      "Course of interest": "Data Science",
      Status: "Meeting Done",
      Counselor: counsellor.name,
      Remarks: "zztmp Met at the fair",
      "Follow-up date": new Date("2026-10-20T00:00:00Z"),
      "Follow-up note": "zztmp Send the Milan list",
      "Inquiry date": new Date("2026-09-14T00:00:00Z"),
      Source: "Education fair",
    },
    // The same person again, by email: read as one.
    { Name: NEW_A, Email: "ZZTMP-import-alpha@hmark-test.local", Country: "Germany", Remarks: "zztmp Also asked about Germany" },
    { Name: NEW_B, "Contact number": "0300-9999984", "Applying for": "Diploma" },
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
        .select("id, full_name, contact_number, email, country_of_interest, current_qualification, level_applying_for, course_of_interest, status, assigned_counselor_id, date_of_inquiry, platform_source")
        .eq("full_name", name)
    ).data ?? [];
  const current = async (id) => (await admin.from("lead_remark_current").select("body").eq("lead_id", id).maybeSingle()).data?.body ?? null;
  const followUps = async (id) => (await admin.from("reminders").select("due_date, note").eq("student_id", id).eq("type", "follow_up").order("due_date")).data ?? [];

  const alpha = await leadByName(NEW_A);
  ok("a new lead is filed once, though the file had it twice", alpha.length === 1, String(alpha.length));
  const a = alpha[0] ?? {};
  ok("...with every column of the sheet",
    a.contact_number === "0300-9999983" && a.email === "zztmp-import-alpha@hmark-test.local" && a.current_qualification === "A-Levels" &&
      a.level_applying_for === "masters" && a.course_of_interest === "Data Science" && a.status === "meeting_done" &&
      a.assigned_counselor_id === counsellor.id && a.date_of_inquiry === "2026-09-14" && a.platform_source === "Education fair",
    JSON.stringify(a));
  ok("...the second row's country beside the first's", a.country_of_interest === "Italy; Germany", a.country_of_interest);
  ok("...and both rows' remarks", (await current(a.id)) === "zztmp Met at the fair\nzztmp Also asked about Germany", await current(a.id));
  const aFollow = await followUps(a.id);
  ok("...and its follow-up", aFollow.length === 1 && aFollow[0].due_date === "2026-10-20" && aFollow[0].note === "zztmp Send the Milan list", JSON.stringify(aFollow));

  const b = (await leadByName(NEW_B))[0] ?? {};
  ok("a lead with no status or inquiry date takes Potential and today", b.status === "potential" && b.date_of_inquiry === karachiToday(), JSON.stringify(b));
  ok("...and a level it cannot use is left out", b.level_applying_for === null);
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
  ok("Current qualification, Applying for and Course of interest come right after Country",
    c > 0 && headers[c + 1] === "current qualification" && headers[c + 2] === "applying for" && headers[c + 3] === "course of interest", headers.join(" | "));
  ok("...with Email and Source each a column of its own", headers.includes("email") && headers.includes("source"));
  const alphaRow = page.locator("tbody tr", { hasText: NEW_A });
  const alphaCells = (await alphaRow.locator("td").allInnerTexts()).map((t) => t.trim());
  ok("...and the lead's own values in them", alphaCells[c] === "Italy; Germany" && alphaCells[c + 1] === "A-Levels" && alphaCells[c + 2] === "Masters" && alphaCells[c + 3] === "Data Science",
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

  // ------------------------------------------------------------- export
  console.log("\n--- export ---");
  const exp = await page.request.get(`${BASE}/api/export/leads`);
  ok("the export downloads as an .xlsx", exp.ok() && /spreadsheetml/.test(exp.headers()["content-type"] ?? ""), String(exp.status()));
  const expBuffer = await exp.body();
  const expSheet = (await readBook(expBuffer)).getWorksheet("Leads");
  const expHeaders = (expSheet.getRow(1).values ?? []).slice(1).map(cellText);
  ok("...with the template's columns", JSON.stringify(expHeaders) === JSON.stringify(HEADERS), expHeaders.join(" | "));
  const exported = [];
  expSheet.eachRow((row, n) => {
    if (n === 1) return;
    const cells = HEADERS.map((_, i) => cellText(row.getCell(i + 1).value));
    if (cells[1]) exported.push({ n, cells });
  });
  const names = exported.map((r) => r.cells[1]);
  ok("...every lead the viewer can see and none they cannot",
    names.includes(NEW_A) && names.includes(EXISTING) && !names.includes(HIDDEN), names.join(", "));
  const row = exported.find((r) => r.cells[1] === NEW_A)?.cells ?? [];
  ok("...each piece of a lead in its own cell",
    JSON.stringify(row.slice(1)) ===
      JSON.stringify([NEW_A, "0300-9999983", "zztmp-import-alpha@hmark-test.local", "Italy; Germany", "A-Levels", "masters", "Data Science", "Meeting Done", counsellor.name,
        "zztmp Met at the fair\nzztmp Also asked about Germany", "2026-10-20", "zztmp Send the Milan list", "2026-09-14", "Education fair"]),
    JSON.stringify(row));
  const n = exported.find((r) => r.cells[1] === NEW_A)?.n;
  ok("...the Month a formula on that row's Inquiry date", row[0] === `=IF(N${n}="","",TEXT(N${n},"mmm yyyy"))`, row[0]);

  const back = await importFile(page, "leads-export.xlsx", expBuffer);
  ok("the export imported straight back changes nothing", /^0 new leads added · 0 already on file and added to · \d+ already on file with nothing new/.test(back), back);
  ok("...and adds no second remark or follow-up",
    (await current(a.id)) === "zztmp Met at the fair\nzztmp Also asked about Germany" && (await followUps(a.id)).length === 1 && (await followUps(existingId)).length === 1);
} catch (e) {
  ok(`the check itself stopped: ${e?.stack ?? e}`, false);
} finally {
  await browser?.close().catch(() => {});
  await admin.from("leads").delete().in("full_name", [NEW_A, NEW_B]);
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
