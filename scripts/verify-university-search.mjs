// Setup › Universities: the search, its filters and its two exports (0338),
// end to end against a portal:
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:unisearch
//
//   * a processing officer searches: a university is found by its name (accents
//     aside), city or country, and through its programmes — "quantum" lists
//     the two universities teaching it, each with only that programme, the
//     words marked; every word must be found; the count says how many
//   * Public / Private, a level and a destination narrow it; the address
//     carries all of it, and a reload opens the same list; "/" goes to the
//     search and Esc clears it; nothing matching says so, with a way back
//   * Export universities and Export catalogue download what is shown: the
//     universities sheet one row per university shown, the catalogue only the
//     programmes shown, their rounds named programme by programme — and the
//     whole sandbox's export writes a shared round once for every programme
//   * both files go back through Import universities and Import a catalogue
//     as nothing to add or change
//   * the export is a permission: switched off for one person, the buttons go
//     and the downloads refuse; a counsellor, for whom the page is switched
//     off here, and Finance, who never had it, get neither the programmes nor
//     a download
//
// Everything is in a zztmp destination, removed in the finally.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { BASE, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:unisearch");

const require = createRequire(import.meta.url);
let ExcelJS;
try {
  ExcelJS = require("exceljs");
} catch {
  console.error("exceljs is not installed: npm install --no-save playwright pg exceljs");
  process.exit(1);
}

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const RUN = Date.now().toString(36);
const COUNTRY = "zztmp Searchland";
const POLY = `zztmp Searchland Polytechnic ${RUN}`;
const PRIVATA = `zztmp Università Privata ${RUN}`;
const ACADEMY = `zztmp Searchland Arts Academy ${RUN}`;
const QC = `zztmp Quantum Computing ${RUN}`;
const UD = `zztmp Urban Design ${RUN}`;
const RB = `zztmp Robotics ${RUN}`;
const QF = `zztmp Quantum Finance ${RUN}`;
const MK = `zztmp Marketing ${RUN}`;
const ROUND = { label: "zztmp 1st call", start_date: "2099-02-01", application_deadline: "2099-03-01", sort_order: 1 };

const downloads = mkdtempSync(join(tmpdir(), "zztmp-unisearch-"));

async function poll(fn, seconds = 30, every = 400) {
  const until = Date.now() + seconds * 1000;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v || Date.now() > until) return v;
    await new Promise((r) => setTimeout(r, every));
  }
}

async function hydrated(page, selector) {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    return Boolean(el && Object.keys(el).some((k) => k.startsWith("__reactProps")));
  }, selector, { timeout: 60000 });
}

/** The rows the list shows: each university's name and the programmes named under it. */
async function listed(page) {
  return page.locator("[data-university-row]").evaluateAll((rows) =>
    rows.map((r) => ({
      name: r.querySelector("a span")?.childNodes[0]?.textContent ?? "",
      text: r.textContent ?? "",
      programmes: [...r.querySelectorAll("[data-matched-programme]")].map((li) => li.textContent ?? ""),
      marks: [...r.querySelectorAll("mark")].map((m) => m.textContent ?? ""),
    }))
  );
}

/** Waits until the list holds exactly these fixture universities (by name), in this order. */
async function listIs(page, names) {
  return poll(async () => {
    const rows = await listed(page);
    const ours = rows.filter((r) => r.text.includes(RUN));
    return ours.length === rows.length && JSON.stringify(ours.map((r) => names.find((n) => r.text.includes(n)) ?? r.text)) === JSON.stringify(names) ? rows : null;
  }, 20);
}

async function search(page, q) {
  const box = page.locator("[data-university-search]");
  await box.fill(q);
}

async function download(page, selector) {
  const [file] = await Promise.all([page.waitForEvent("download", { timeout: 120000 }), page.locator(selector).click()]);
  const path = join(downloads, `${Date.now()}-${file.suggestedFilename()}`);
  await file.saveAs(path);
  return { path, name: file.suggestedFilename() };
}

async function sheetRows(path, sheetName) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(path);
  const sheet = book.getWorksheet(sheetName);
  if (!sheet) return null;
  const header = sheet.getRow(1).values.slice(1).map(String);
  const out = [];
  sheet.eachRow((row, n) => {
    if (n === 1) return;
    const cells = row.values.slice(1);
    out.push(Object.fromEntries(header.map((h, i) => [h, cells[i] instanceof Date ? cells[i].toISOString().slice(0, 10) : String(cells[i] ?? "")])));
  });
  return out;
}

let browser = null;
let destinationId = null;

try {
  // ------------------------------------------------------------ a sandbox
  for (const old of (await admin.from("destinations").select("id").like("display_name", `${COUNTRY}%`)).data ?? []) {
    const { data: unis } = await admin.from("universities").select("id").eq("destination_id", old.id);
    for (const u of unis ?? []) await admin.from("programs").delete().eq("university_id", u.id);
    await admin.from("universities").delete().eq("destination_id", old.id);
    await admin.from("destinations").delete().eq("id", old.id);
  }
  const { data: dest, error: destError } = await admin
    .from("destinations")
    .insert({ country: COUNTRY, country_code: "ZS", track: "public", display_name: `${COUNTRY} (Public)`, currency: "EUR", status: "active" })
    .select("id, display_name")
    .single();
  if (destError) throw new Error(`sandbox destination: ${destError.message}`);
  destinationId = dest.id;
  const { data: unis, error: uniError } = await admin
    .from("universities")
    .insert([
      { destination_id: destinationId, name: POLY, city: "zztmp Alpha", type: "public", contact_email: `poly-${RUN}@example.invalid` },
      { destination_id: destinationId, name: PRIVATA, city: "zztmp Beta", type: "private" },
      { destination_id: destinationId, name: ACADEMY, city: "zztmp Alpha", type: "public" },
    ])
    .select("id, name");
  if (uniError) throw new Error(`sandbox universities: ${uniError.message}`);
  const uni = (name) => unis.find((u) => u.name === name).id;
  const { data: progs, error: progError } = await admin
    .from("programs")
    .insert([
      { university_id: uni(POLY), name: QC, level: "masters", core_field: "IT/CS", tuition_fee: "2500" },
      { university_id: uni(POLY), name: UD, level: "bachelors", core_field: "Design" },
      { university_id: uni(POLY), name: RB, level: "masters", core_field: "Engineering" },
      { university_id: uni(PRIVATA), name: QF, level: "masters", core_field: "Business" },
      { university_id: uni(PRIVATA), name: MK, level: "masters", core_field: "Business" },
    ])
    .select("id, name");
  if (progError) throw new Error(`sandbox programmes: ${progError.message}`);
  // One round shared by all three of the Polytechnic's programmes: written once for the whole university, unless only some are exported.
  await admin.from("program_intake_rounds").insert(progs.filter((p) => [QC, UD, RB].includes(p.name)).map((p) => ({ program_id: p.id, ...ROUND })));

  // Processing: the page is switched off for counsellors on this portal (Role Permissions).
  const officer = await fx.staff(`unisearchproc${RUN}`, ["processing"]);
  const counsellor = await fx.staff(`unisearchcoun${RUN}`, ["counselor"]);
  const finance = await fx.staff(`unisearchfin${RUN}`, ["finance"]);
  const superUser = await fx.staff(`unisearchsa${RUN}`, ["super_admin"]);

  browser = await openBrowser();
  const page = await signIn(browser, officer.email);
  await page.goto(`${BASE}/setup/universities`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-university-search]").waitFor({ timeout: 60000 });
  await hydrated(page, "[data-university-search]");

  // ------------------------------------------------------------- searching
  await search(page, `zztmp ${RUN}`);
  ok("a processing officer searching names the sandbox's three universities and only them", Boolean(await listIs(page, [ACADEMY, POLY, PRIVATA])));

  await search(page, `quantum ${RUN}`);
  const quantum = await listIs(page, [POLY, PRIVATA]);
  ok(
    "a search by programme lists the universities teaching it, each with only that programme",
    quantum?.[0]?.programmes.length === 1 && quantum[0].programmes[0].includes(QC) && quantum[1].programmes[0].includes(QF) && !quantum[1].text.includes(MK),
    JSON.stringify(quantum)
  );
  ok("...the words marked", quantum?.[0]?.marks.some((m) => /quantum/i.test(m)) && quantum[0].marks.some((m) => m === RUN), JSON.stringify(quantum?.[0]?.marks));
  const count = await poll(async () => {
    const t = (await page.locator("[data-university-count]").innerText()).replace(/\s+/g, " ");
    return /^2 universities · 2 programmes of /.test(t) ? t : null;
  }, 10);
  ok("...and the count says 2 universities, 2 programmes", Boolean(count), await page.locator("[data-university-count]").innerText());

  await search(page, `universita privata ${RUN}`);
  ok("accents aside: \"universita\" finds Università", Boolean(await listIs(page, [PRIVATA])));
  await search(page, `zztmp alpha ${RUN}`);
  ok("a city finds its universities", Boolean(await listIs(page, [ACADEMY, POLY])));
  await search(page, `searchland quantum finance ${RUN}`);
  ok("every word must be found — across the country, the university and the programme", Boolean(await listIs(page, [PRIVATA])));

  // --------------------------------------------------------------- filters
  await search(page, `zztmp ${RUN}`);
  await page.locator('[data-type-chip="private"]').click();
  ok("Private narrows it to the private university", Boolean(await listIs(page, [PRIVATA])));
  await page.locator('[data-type-chip="all"]').click();
  await page.locator('[data-level-chip="bachelors"]').click();
  const bachelors = await listIs(page, [POLY]);
  ok("Bachelors leaves the one teaching at that level", Boolean(bachelors) && bachelors[0].text.includes("1 bachelors programme"), JSON.stringify(bachelors));
  await page.locator('[data-level-chip="all"]').click();
  await page.locator(`[data-destination-chip="${destinationId}"]`).click();
  const chipText = await page.locator(`[data-destination-chip="${destinationId}"]`).innerText();
  ok("the destination's chip counts its matches", chipText.includes("(3)"), chipText);

  const addressed = await poll(async () => {
    const u = new URL(page.url());
    return u.searchParams.get("q") === `zztmp ${RUN}` && u.searchParams.get("destination") === destinationId ? u : null;
  }, 10);
  ok("the address carries the search and the destination", Boolean(addressed), page.url());
  await page.goto(`${BASE}/setup/universities?q=${encodeURIComponent(`quantum ${RUN}`)}&level=masters&destination=${destinationId}`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-university-search]").waitFor({ timeout: 60000 });
  const reopened = await listIs(page, [POLY, PRIVATA]);
  ok(
    "a link with the search opens the same list, the search filled in and Masters chosen",
    Boolean(reopened) &&
      (await page.locator("[data-university-search]").inputValue()) === `quantum ${RUN}` &&
      (await page.locator('[data-level-chip="masters"]').getAttribute("aria-pressed")) === "true"
  );

  await hydrated(page, "[data-university-search]");
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
  await page.keyboard.press("/");
  ok("\"/\" goes to the search", await page.evaluate(() => document.activeElement?.hasAttribute("data-university-search")));
  await page.keyboard.press("Escape");
  ok("...and Esc clears it", (await page.locator("[data-university-search]").inputValue()) === "");
  await search(page, `nothing-like-this ${RUN}`);
  const empty = await poll(async () => ((await page.locator("[data-university-empty]").count()) ? page.locator("[data-university-empty]").innerText() : null), 10);
  ok("nothing matching says so, with a way to clear it", Boolean(empty) && /Nothing matches/.test(empty) && /Clear the search and filters/.test(empty), String(empty));

  // --------------------------------------------------------------- exports
  await page.goto(`${BASE}/setup/universities?q=${encodeURIComponent(`quantum ${RUN}`)}`, { waitUntil: "domcontentloaded" });
  await listIs(page, [POLY, PRIVATA]);
  const catalogueLabel = await poll(async () => {
    const t = await page.locator("[data-export-catalogue]").innerText();
    return /\(2 programmes\)/.test(t) ? t : null;
  }, 15);
  ok("the export buttons say what they download", Boolean(catalogueLabel) && /\(2\)/.test(await page.locator("[data-export-universities]").innerText()), String(catalogueLabel));

  const uniFile = await download(page, "[data-export-universities]");
  const uniRows = await sheetRows(uniFile.path, "Universities");
  ok(
    "Export universities downloads one row per university shown",
    JSON.stringify((uniRows ?? []).map((r) => r.name)) === JSON.stringify([POLY, PRIVATA]) && uniRows[0].contact_email === `poly-${RUN}@example.invalid` && uniRows[0].destination === `${COUNTRY} (Public)`,
    JSON.stringify(uniRows)
  );
  ok("...named for what is in it", /^universities-all-destinations-quantum-/.test(uniFile.name), uniFile.name);

  const catFile = await download(page, "[data-export-catalogue]");
  const catRows = await sheetRows(catFile.path, "Catalogue");
  const roundRows = await sheetRows(catFile.path, "Rounds");
  ok(
    "Export catalogue downloads only the programmes shown",
    JSON.stringify((catRows ?? []).map((r) => [r.university_name, r.program_name])) === JSON.stringify([[POLY, QC], [PRIVATA, QF]]) && catRows[0].tuition_fee === "2500",
    JSON.stringify(catRows?.map((r) => [r.university_name, r.program_name]))
  );
  // Imported, a row for every programme or every masters programme would add
  // the round to Robotics and Urban Design as well, which are not in the file.
  ok(
    "...and the round as Quantum Computing's own — never a row reaching Robotics or Urban Design, which are not in the file",
    JSON.stringify((roundRows ?? []).map((r) => [r.university_name, r.level, r.program_name, r.round, r.start_date])) ===
      JSON.stringify([[POLY, "masters", QC, ROUND.label, ROUND.start_date]]),
    JSON.stringify(roundRows)
  );

  await page.goto(`${BASE}/setup/universities?destination=${destinationId}`, { waitUntil: "domcontentloaded" });
  await listIs(page, [ACADEMY, POLY, PRIVATA]);
  const wholeFile = await download(page, "[data-export-catalogue]");
  const wholeRounds = await sheetRows(wholeFile.path, "Rounds");
  const wholeRows = await sheetRows(wholeFile.path, "Catalogue");
  ok(
    "the whole destination's export has every programme, the university without one as a row of its own",
    (wholeRows ?? []).length === 6 && wholeRows.some((r) => r.university_name === ACADEMY && r.program_name === ""),
    JSON.stringify(wholeRows?.map((r) => [r.university_name, r.program_name]))
  );
  ok(
    "...and the Polytechnic's shared round once, for every programme",
    JSON.stringify((wholeRounds ?? []).map((r) => [r.university_name, r.level, r.program_name])) === JSON.stringify([[POLY, "", ""]]),
    JSON.stringify(wholeRounds)
  );
  ok("...named for its destination", wholeFile.name === "catalogue-zztmp-searchland-public.xlsx", wholeFile.name);

  // ------------------------------------------------- back through the imports
  const sa = await signIn(browser, superUser.email);
  async function previewIn(panelText, file) {
    await sa.goto(`${BASE}/setup/universities`, { waitUntil: "domcontentloaded" });
    const panel = sa.locator("details", { hasText: panelText }).first();
    await panel.locator("summary").first().click();
    await panel.locator('input[type="file"]').setInputFiles(file);
    await panel.getByRole("button", { name: "Preview" }).click();
    const report = panel.locator("[data-import-report]").first();
    await report.waitFor({ timeout: 120000 });
    return { mode: await report.getAttribute("data-import-report"), text: (await report.innerText()).replace(/\s+/g, " ") };
  }
  const uniBack = await previewIn("Import universities from a spreadsheet", uniFile.path);
  ok("the universities export goes back through Import universities as nothing to change", uniBack.mode === "preview" && /Nothing to add or change/.test(uniBack.text), JSON.stringify(uniBack));
  const catBack = await previewIn("Import a catalogue", catFile.path);
  ok("the search's catalogue goes back through Import a catalogue as nothing to change", catBack.mode === "preview" && /Nothing to add or change/.test(catBack.text), JSON.stringify(catBack));
  const wholeBack = await previewIn("Import a catalogue", wholeFile.path);
  ok("...and so does the whole destination's", wholeBack.mode === "preview" && /Nothing to add or change/.test(wholeBack.text), JSON.stringify(wholeBack));
  const { count: roundsAfter } = await admin
    .from("program_intake_rounds")
    .select("id", { count: "exact", head: true })
    .in("program_id", progs.map((p) => p.id));
  ok("(the sandbox still has its three rounds)", roundsAfter === 3, String(roundsAfter));

  // ------------------------------------------------------------ permission
  const status = async (p, path) => p.evaluate(async (u) => (await fetch(u)).status, `${BASE}${path}`);
  await admin.from("staff_permission_overrides").insert({ staff_id: officer.id, permission_key: "catalogue.export", allowed: false });
  await page.goto(`${BASE}/setup/universities`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-university-search]").waitFor({ timeout: 60000 });
  ok("switched off for one person, the export buttons are gone", (await page.locator("[data-university-exports]").count()) === 0);
  ok(
    "...and the downloads refuse them",
    (await status(page, "/api/export/universities")) === 403 && (await status(page, `/api/export/catalogue?destination=${destinationId}`)) === 403
  );
  ok("...while the search still works for them", (await status(page, "/api/setup/programme-index")) === 200);

  for (const [who, person] of [
    ["a counsellor (the page is switched off for them here)", counsellor],
    ["Finance", finance],
  ]) {
    const p = await signIn(browser, person.email);
    await p.goto(`${BASE}/setup/universities`, { waitUntil: "domcontentloaded" });
    ok(`${who} cannot open the page`, await p.locator("[data-no-page-access]").waitFor({ timeout: 60000 }).then(() => true, () => false));
    ok(
      "...nor read the programmes or download either file, though the export itself is not switched off for them",
      (await status(p, "/api/setup/programme-index")) === 403 && (await status(p, "/api/export/universities")) === 403 && (await status(p, "/api/export/catalogue")) === 403
    );
    await p.close();
  }
} catch (e) {
  ok("the run finished", false, e?.stack ?? String(e));
} finally {
  await browser?.close().catch(() => {});
  rmSync(downloads, { recursive: true, force: true });
  const removed = await fx.cleanup();
  if (destinationId) {
    const { data: unis } = await admin.from("universities").select("id").eq("destination_id", destinationId);
    for (const u of unis ?? []) await admin.from("programs").delete().eq("university_id", u.id);
    await admin.from("universities").delete().eq("destination_id", destinationId);
    await admin.from("destinations").delete().eq("id", destinationId);
  }
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
