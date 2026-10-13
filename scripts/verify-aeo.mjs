// Accounts & Finance › AEO Pakistan (0335), end to end against a portal:
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:aeo
//
//   * the account officer (Finance) has AEO Pakistan in the menu and opens it;
//     Management and a counsellor have neither, the export refuses them, and
//     the table gives them nothing and takes nothing from them;
//   * it is not on the Role Permissions screen, and the database refuses to
//     grant it to any other role;
//   * the office's own sheet — its headers as typed, dates like "001/8/2022",
//     a real date cell and the Total row — previews as three registrations
//     added, and applies as exactly that, the dates read day first;
//   * the table scrolls as a spreadsheet: the heading row frozen at the top,
//     the tick box, Sr. # and name at the left; each row is one line, and a
//     long value is cut short and opens whole in a pop-up;
//   * a row is edited in place; two are marked paid on one date with one
//     reference, and the totals move; a challan already on file is refused;
//   * the export is the office's layout with a Total row, and imported back it
//     changes nothing; a row deleted can be restored from the audit log.
//
// Everything is named zztmp and removed in a finally.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import writeXlsxFile from "write-excel-file/node";
import readXlsxFile from "read-excel-file/node";
import { BASE, apiAs, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:aeo");

const { admin, url, anonKey } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();
const RUN = Date.now().toString(36);
const TAG = `zztmp AEO ${RUN}`;
const CHALLAN = (n) => `ZZ${RUN}${n}`.toUpperCase();
const dir = mkdtempSync(join(tmpdir(), "aeo-"));

async function poll(fn, seconds = 30, every = 500) {
  const until = Date.now() + seconds * 1000;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v || Date.now() > until) return v;
    await new Promise((r) => setTimeout(r, every));
  }
}

const ours = async () => (await admin.from("aeo_ielts_commissions").select("*").like("candidate_name", `${TAG}%`).order("challan_number")).data ?? [];

/** The office's sheet, as they keep it: their headers (a typo and a trailing space), their dates, a Total row. */
async function officeSheet() {
  const h = (value) => ({ value, type: String, fontWeight: "bold" });
  const rows = [
    [h("Sr. #"), h("Candidate's Name"), h("Challan Number"), h("challan creat date "), h("Test date"), h("Commission's Amount"), h("Payment Status")],
    [
      { value: 901, type: Number },
      { value: `${TAG} BABAR`, type: String },
      { value: CHALLAN(1), type: String },
      { value: "001/8/2022", type: String },
      { value: "(06/08/2022) ( ACADEMIC ) ( Computer Based ) (\nIELTS (IOC) )", type: String },
      { value: 3000, type: Number },
      { value: "Unpaid", type: String },
    ],
    [
      { value: 902, type: Number },
      { value: `${TAG} AMNA`, type: String },
      { value: CHALLAN(2), type: String },
      { value: new Date("2023-02-02T00:00:00Z"), type: Date, format: "dd/mm/yyyy" },
      { value: "(25/02/2023) ( ACADEMIC ) ( Paper Based ) ( IELTS (PB) )", type: String },
      { value: 1200, type: Number },
      { value: "Unpaid", type: String },
    ],
    [
      { value: 903, type: Number },
      { value: `${TAG} SUFYAN`, type: String },
      { value: CHALLAN(3), type: String },
      { value: "27/09/2022", type: String },
      { value: "(05/10/2022) ( ACADEMIC ) ( Computer Based ) ( IELTS FOR UKVI (IOC) )", type: String },
      { value: 2000, type: Number },
      { value: "Unpaid", type: String },
    ],
    [null, null, null, null, { value: "Total", type: String }, { value: "=SUM(F2:F4)", type: "Formula" }, null],
  ];
  const path = join(dir, `AEO office sheet ${RUN}.xlsx`);
  writeFileSync(path, await writeXlsxFile(rows, { sheet: "Sheet1" }).toBuffer());
  return path;
}

async function openImport(page) {
  const panel = page.locator("[data-aeo-import]");
  for (let i = 0; i < 20 && !(await panel.isVisible()); i++) {
    await page.locator("[data-aeo-toolbar]").getByRole("button", { name: "Import" }).click();
    await panel.waitFor({ state: "visible", timeout: 2000 }).catch(() => {});
  }
  return panel;
}

async function preview(page, file) {
  const panel = await openImport(page);
  await panel.locator('input[type="file"]').setInputFiles(file);
  await panel.getByRole("button", { name: "Preview" }).click();
  const report = panel.locator("[data-import-report]").first();
  await report.waitFor({ timeout: 90000 });
  return { panel, mode: await report.getAttribute("data-import-report"), text: (await report.innerText()).replace(/\s+/g, " ") };
}

let browser = null;

try {
  const finance = await fx.staff(`aeofin${RUN}`, ["finance"]);
  const mgmt = await fx.staff(`aeomgmt${RUN}`, ["management"]);
  const counsellor = await fx.staff(`aeocoun${RUN}`, ["counselor"]);
  const sup = await fx.staff(`aeosup${RUN}`, ["super_admin"]);
  browser = await openBrowser();

  // ------------------------------------------------------------ who sees it
  const page = await signIn(browser, finance.email, { context: await browser.newContext({ viewport: { width: 1500, height: 1100 }, acceptDownloads: true }) });
  ok("the account officer has AEO Pakistan in the menu", (await page.locator('nav a[href="/finance/aeo-pakistan"]').count()) >= 1);
  await page.goto(`${BASE}/finance/aeo-pakistan?zz=${RUN}`, { waitUntil: "domcontentloaded" });
  ok(
    "...and opens it",
    await page
      .locator("[data-aeo-register]")
      .waitFor({ timeout: 60000 })
      .then(
        () => true,
        () => false,
      ),
  );

  for (const [who, person] of [
    ["Management", mgmt],
    ["a counsellor", counsellor],
  ]) {
    const p = await signIn(browser, person.email);
    const inMenu = await p.locator('nav a[href="/finance/aeo-pakistan"]').count();
    await p.goto(`${BASE}/finance/aeo-pakistan`, { waitUntil: "domcontentloaded" });
    const refused = await p
      .locator("[data-no-page-access]")
      .waitFor({ timeout: 60000 })
      .then(
        () => true,
        () => false,
      );
    ok(`${who} has no AEO Pakistan in the menu, and is refused the page`, inMenu === 0 && refused && (await p.locator("[data-aeo-register]").count()) === 0);
    const exported = await p.request.get(`${BASE}/api/export/aeo-pakistan`);
    ok(`...and the export`, exported.status() === 403, String(exported.status()));
    await p.close();
    const api = await apiAs(url, anonKey, person.email);
    const read = await api.from("aeo_ielts_commissions").select("id").limit(5);
    const write = await api
      .from("aeo_ielts_commissions")
      .insert({ candidate_name: `${TAG} SNEAK`, challan_number: CHALLAN(9) })
      .select("id");
    ok(`...and the table gives ${who} nothing and takes nothing`, (read.data ?? []).length === 0 && Boolean(write.error), JSON.stringify(write.error));
  }

  const supPage = await signIn(browser, sup.email);
  await supPage.goto(`${BASE}/admin/permissions`, { waitUntil: "domcontentloaded" });
  await supPage.waitForTimeout(3000);
  const permissionsText = await supPage.locator("main").innerText();
  ok(
    "it is not on the Role Permissions screen",
    permissionsText.includes("Open Tasks") && !permissionsText.includes("AEO Pakistan"),
    permissionsText.slice(0, 200),
  );
  await supPage.close();
  const grant = await admin.from("role_permission_overrides").insert({ role: "management", permission_key: "page.finance.aeo_pakistan", allowed: true });
  ok("...and the database refuses to grant it to another role", /aeo_pakistan_fixed/.test(grant.error?.message ?? ""), JSON.stringify(grant.error));

  // ------------------------------------------------------------ the office's sheet
  const sheet = await officeSheet();
  const first = await preview(page, sheet);
  ok(
    "the office's sheet previews as three registrations added",
    first.mode === "preview" && /Will add 3 registrations/.test(first.text) && !/skipped/i.test(first.text),
    first.text.slice(0, 500),
  );
  ok("...nothing written yet", (await ours()).length === 0);
  await first.panel.getByRole("button", { name: "Apply these changes" }).click();
  await first.panel.locator('[data-import-report="applied"], [data-import-report="error"]').first().waitFor({ timeout: 90000 });
  const imported = await poll(async () => ((await ours()).length === 3 ? await ours() : null), 30);
  ok("...and applies as exactly that", imported?.length === 3, JSON.stringify((imported ?? []).map((r) => r.challan_number)));
  const byChallan = Object.fromEntries((imported ?? []).map((r) => [r.challan_number, r]));
  ok(
    "the dates are read day first, however they were typed",
    byChallan[CHALLAN(1)]?.challan_date === "2022-08-01" &&
      byChallan[CHALLAN(2)]?.challan_date === "2023-02-02" &&
      byChallan[CHALLAN(3)]?.challan_date === "2022-09-27",
    JSON.stringify((imported ?? []).map((r) => r.challan_date)),
  );
  ok(
    "the test is kept as typed, and the amounts and Sr. # as given",
    byChallan[CHALLAN(1)]?.test_details.includes("IELTS (IOC)") &&
      Number(byChallan[CHALLAN(3)]?.commission_amount) === 2000 &&
      byChallan[CHALLAN(2)]?.sr_no === 902,
  );

  // ------------------------------------------------------------ the table
  await page.goto(`${BASE}/finance/aeo-pakistan`, { waitUntil: "domcontentloaded" });
  const search = page.locator("[data-aeo-toolbar] input").first();
  await search.waitFor({ timeout: 60000 });
  await search.fill(TAG);
  const rows = page.locator("[data-aeo-row]");
  ok("the three are in the table", (await poll(async () => ((await rows.count()) === 3 ? 3 : null), 20)) === 3);
  // Frozen as a spreadsheet is, and one line to a row, as the leads table.
  await page.setViewportSize({ width: 1100, height: 1000 });
  const firstRow = page.locator(`[data-aeo-row="${CHALLAN(1)}"]`);
  const frame = page.locator("[data-aeo-table]").locator("xpath=..");
  const at = async () => ({
    tick: (await firstRow.locator("td").nth(0).boundingBox())?.x,
    name: (await firstRow.locator("td").nth(2).boundingBox())?.x,
    challan: (await firstRow.locator("td").nth(3).boundingBox())?.x,
  });
  const before = await at();
  await frame.evaluate((el) => (el.scrollLeft = 400));
  const after = await poll(
    async () => {
      const now = await at();
      return now.challan < before.challan - 100 ? now : null;
    },
    10,
    200,
  );
  ok(
    "scrolled sideways, the tick box, Sr. # and the name stay where they are",
    Boolean(after) && Math.abs(after.tick - before.tick) < 1 && Math.abs(after.name - before.name) < 1,
    JSON.stringify({ before, after }),
  );
  ok(
    "...and the heading row is frozen at the top",
    (await page
      .locator("[data-aeo-table] thead th")
      .first()
      .evaluate((el) => getComputedStyle(el).position)) === "sticky",
  );
  await frame.evaluate((el) => (el.scrollLeft = 0));
  const heights = await rows.evaluateAll((trs) => trs.map((tr) => Math.round(tr.getBoundingClientRect().height)));
  ok(
    "each row keeps to one line",
    heights.every((h) => h < 50),
    JSON.stringify(heights),
  );
  const test = firstRow.locator("td").nth(5).locator("[aria-label]").first();
  ok(
    "a long test date is cut short, and says it can be opened",
    /open to read in full/.test((await test.getAttribute("aria-label")) ?? ""),
    (await test.getAttribute("aria-label")) ?? "no label",
  );
  await test.click();
  const whole = page.locator("[data-long-full]");
  const full = await whole.waitFor({ timeout: 10000 }).then(
    async () => await whole.innerText(),
    () => "",
  );
  ok("...and opens whole in a pop-up", full.includes("(06/08/2022)") && full.includes("IELTS (IOC)"), full);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1500, height: 1100 });
  const cards = async () => (await page.locator("[data-aeo-totals]").innerText()).replace(/\s+/g, " ");
  ok(
    "the totals count them: PKR 6,200 earned, all outstanding",
    /PKR 6,200/.test(await cards()) && /Outstanding PKR 6,200/i.test(await cards()),
    await cards(),
  );

  // Edit one in place.
  await page
    .locator(`[data-aeo-row="${CHALLAN(2)}"]`)
    .getByRole("button", { name: /Edit/ })
    .click();
  const form = page.locator("[data-aeo-form]");
  await form.locator('input[name="commission_amount"]').fill("1,500");
  await form.getByRole("button", { name: "Save" }).click();
  ok(
    "a row is edited in place",
    Boolean(await poll(async () => (Number((await ours()).find((r) => r.challan_number === CHALLAN(2))?.commission_amount) === 1500 ? true : null), 30)),
  );

  // A challan already on file.
  await page.locator("[data-aeo-toolbar]").getByRole("button", { name: "Add registration" }).click();
  const add = page.locator("[data-aeo-form]");
  await add.locator('input[name="candidate_name"]').fill(`${TAG} AGAIN`);
  await add.locator('input[name="challan_number"]').fill(` ${CHALLAN(1).toLowerCase()} `);
  await add.getByRole("button", { name: "Add registration" }).click();
  const refusal = await poll(async () => {
    const t = await add
      .locator('[role="alert"]')
      .innerText()
      .catch(() => "");
    return /already on file/.test(t) ? t : null;
  }, 30);
  ok("a challan already on file is refused, spaces and case aside", Boolean(refusal), refusal ?? "");
  await add.getByRole("button", { name: "Cancel" }).click();

  // Two marked paid at once.
  await page.locator(`[data-aeo-row="${CHALLAN(1)}"] input[type="checkbox"]`).check();
  await page.locator(`[data-aeo-row="${CHALLAN(3)}"] input[type="checkbox"]`).check();
  await page
    .locator("[data-aeo-bulk]")
    .getByRole("button", { name: /Mark paid/ })
    .click();
  const pay = page.locator("[data-aeo-pay]");
  await pay.locator('input[name="paid_on"]').fill("2026-10-10");
  await pay.locator('input[name="payment_reference"]').fill(`TRX-${RUN}`);
  await pay.getByRole("button", { name: "Mark paid" }).click();
  const paid = await poll(async () => {
    const rs = (await ours()).filter((r) => r.payment_status === "paid");
    return rs.length === 2 ? rs : null;
  }, 30);
  ok(
    "two are marked paid on one date with one reference",
    paid?.every((r) => r.paid_on === "2026-10-10" && r.payment_reference === `TRX-${RUN}`) &&
      paid
        .map((r) => r.challan_number)
        .sort()
        .join() === [CHALLAN(1), CHALLAN(3)].sort().join(),
  );
  const moved = await poll(async () => (/Paid by AEO PKR 5,000/i.test(await cards()) ? await cards() : null), 30);
  ok("...and the totals move: PKR 5,000 paid, PKR 1,500 outstanding", Boolean(moved) && /Outstanding PKR 1,500/i.test(moved), await cards());

  // ------------------------------------------------------------ the export
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator("[data-aeo-export]").click()]);
  const exportPath = join(dir, download.suggestedFilename());
  await download.saveAs(exportPath);
  const book = await readXlsxFile(readFileSync(exportPath));
  const main = book.find((s) => s.sheet === "AEO Pakistan");
  const [head, ...data] = main?.data ?? [[]];
  ok(
    "the export is the office's layout",
    JSON.stringify(head.slice(0, 7)) ===
      JSON.stringify(["Sr. #", "Candidate's Name", "Challan Number", "Challan create date", "Test date", "Commission's Amount", "Payment Status"]),
    JSON.stringify(head),
  );
  const dataRows = data.filter((r) => r[1]);
  ok(
    "...of what the page showed, with a Total row",
    dataRows.length === 3 &&
      data.some((r) => r.includes("Total")) &&
      /AEO Pakistan IELTS commissions \d{4}-\d{2}-\d{2}\.xlsx/.test(download.suggestedFilename()),
    `${dataRows.length} ${download.suggestedFilename()}`,
  );
  const again = await preview(page, exportPath);
  ok(
    "imported back, it changes nothing",
    again.mode === "preview" && /Nothing to add or change/.test(again.text) && /3 registrations already match/.test(again.text),
    again.text.slice(0, 400),
  );

  // ------------------------------------------------------------ delete, and the way back
  page.once("dialog", (d) => d.accept());
  await page
    .locator(`[data-aeo-row="${CHALLAN(2)}"]`)
    .getByRole("button", { name: /Delete/ })
    .click();
  ok("a row is deleted", Boolean(await poll(async () => ((await ours()).length === 2 ? true : null), 30)));
  const { data: trail } = await admin
    .from("audit_log")
    .select("action_type")
    .eq("entity_type", "aeo_ielts_commissions")
    .eq("entity_id", byChallan[CHALLAN(2)]?.id);
  ok(
    "...and the audit log holds it, to restore",
    (trail ?? []).some((t) => t.action_type === "DELETE"),
    JSON.stringify(trail),
  );
} catch (e) {
  ok("the run finished", false, e?.stack ?? String(e));
} finally {
  await browser?.close().catch(() => {});
  await admin.from("aeo_ielts_commissions").delete().like("candidate_name", "zztmp AEO%");
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
