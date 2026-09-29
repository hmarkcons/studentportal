// The scholarship bodies import, end to end against a deployed portal.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:scholarshipimport
//
// Setup › Scholarship bodies › Import adds or updates bodies from a sheet,
// matched by name, previewed before it writes. Each thing below fails without
// an error, which is why each is asserted on what the DATABASE holds
// afterwards rather than on what the page says:
//
//   1. **A preview writes nothing**, and applying it adds the body with its
//      countries and its guide.
//   2. **The same sheet again changes nothing.**
//   3. **An empty cell changes nothing** — not the region, not the covered
//      universities, not the countries, not the guide.
//   4. **A filled guide replaces the guide**, and a filled Countries cell
//      becomes exactly the body's countries.
//   5. **An unknown country is reported and creates nothing.**
//   6. **A similar name updates the body it resembles**, keeping its name and
//      without a duplicate.
//   7. **An untouched export re-imports as a no-op** — the whole directory,
//      real bodies included, with the check's own body provably in the file.
//   8. **Only the people the database lets write may import.** A counsellor
//      is not offered it; a manager given scholarships.manage is offered it
//      and told plainly that the database will refuse them.
//
// Everything is named `zztmp`, in `zztmp` destinations of its own, and removed
// in a finally. Nothing is ever applied to a real body: the round trip is
// previewed, never applied.
import {
  BASE,
  clients,
  fixtures,
  openBrowser,
  reporter,
  requireConfirmation,
  signIn,
} from "./verify-portal-lib.mjs";
import readXlsxFile from "read-excel-file/node";

requireConfirmation("check:scholarshipimport");

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

/** The sheet's own headers, as the template writes them. */
const HEADERS = [
  "Name", "Countries", "Region", "Universities covered", "Academic year", "Application deadline",
  "Document upload deadline", "Courier deadline", "ISEE threshold", "ISPE threshold", "Stipend amount", "Benefits",
  "Source URL", "Apply URL", "Call status", "Call expected on", "Call PDF URL", "Call page URL", "Call notes",
  "Guide 1 title", "Guide 1 text", "Guide 2 title", "Guide 2 text",
];

/** A CSV the importer accepts; every header present, so a missing value is a genuinely blank cell. */
function asCsv(rows) {
  const escape = (value) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const text = [HEADERS.join(","), ...rows.map((row) => HEADERS.map((h) => escape(row[h])).join(","))].join("\n");
  return { name: "scholarship-bodies.csv", mimeType: "text/csv", buffer: Buffer.from(text, "utf8") };
}

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const destinationIds = [];
let manager = null;
let processing = null;

try {
  // Whatever an interrupted earlier run left behind, so "a preview writes
  // nothing" is measured from nothing.
  await admin.from("scholarship_bodies").delete().ilike("name", "zztmp%");

  // ------------------------------------------------------------- a sandbox
  async function sandbox(country, code) {
    const { data, error } = await admin
      .from("destinations")
      .insert({ country: `zztmp ${country}`, country_code: code, track: "public", display_name: `zztmp ${country} (Public)`, currency: "EUR", status: "active" })
      .select("id, display_name")
      .single();
    if (error) throw new Error(`could not create the sandbox destination: ${error.message}`);
    destinationIds.push(data.id);
    return data;
  }
  const alpha = await sandbox("Bodyland", "ZX");
  const beta = await sandbox("Otherbodyland", "ZW");

  // Processing, not Super Admin: the team the import is for, and the role the
  // table's write policy names. Granted scholarships.manage for this one
  // person, because the role's own grant is a setting in Admin › Role
  // Permissions — production has taken it away from Processing, and the check
  // is about the import, not about that choice.
  processing = await fx.staff("sbprocessing", ["processing"]);
  const counselor = await fx.staff("sbcounselor", ["counselor"]);
  manager = await fx.staff("sbmanager", ["management"]);
  for (const person of [processing, manager]) {
    const grant = await admin
      .from("staff_permission_overrides")
      .upsert({ staff_id: person.id, permission_key: "scholarships.manage", allowed: true });
    if (grant.error) throw new Error(`could not grant scholarships.manage to ${person.email}: ${grant.error.message}`);
  }
  console.log(`sandboxes ${alpha.display_name}, ${beta.display_name}\n`);

  const browser = await openBrowser();

  const heading = (page) => page.getByRole("heading", { name: "Scholarship Body Directory" });
  const panelOf = (page) => page.locator("[data-scholarship-import]");
  const importButton = (page) => page.getByRole("button", { name: "Import", exact: true });

  /**
   * Opens the import panel. Polled, not clicked once: a click that lands
   * before the page has hydrated does nothing, and a second click on a
   * hydrated page would close it again.
   */
  async function openImport(page) {
    await page.goto(`${BASE}/setup/scholarship-bodies`, { waitUntil: "domcontentloaded" });
    await heading(page).waitFor({ timeout: 60_000 });
    const panel = panelOf(page);
    for (let i = 0; i < 30 && !(await panel.isVisible()); i++) {
      await importButton(page).click();
      await panel.waitFor({ state: "visible", timeout: 2_000 }).catch(() => {});
    }
    return panel;
  }

  /** Waits for the action's answer by its attribute, never its wording: the help text beside it uses the same words. */
  async function answer(panel) {
    const report = panel.locator("[data-import-report]").first();
    await report.waitFor({ timeout: 90_000 });
    return { mode: await report.getAttribute("data-import-report"), text: (await report.innerText()).replace(/\s+/g, " ") };
  }

  async function preview(page, file) {
    const panel = await openImport(page);
    await panel.locator('input[type="file"]').setInputFiles(file);
    await panel.getByRole("button", { name: "Preview" }).click();
    return { panel, ...(await answer(panel)) };
  }

  async function apply(panel) {
    await panel.getByRole("button", { name: "Apply these changes" }).click();
    // Only the answer to THIS click carries "applied".
    const report = panel.locator('[data-import-report="applied"], [data-import-report="error"]').first();
    await report.waitFor({ timeout: 90_000 });
    return { mode: await report.getAttribute("data-import-report"), text: (await report.innerText()).replace(/\s+/g, " ") };
  }

  const applyOffered = async (panel) => (await panel.getByRole("button", { name: "Apply these changes" }).count()) === 1;

  const bodiesLike = async (pattern) =>
    (
      await admin
        .from("scholarship_bodies")
        .select("id, name, region, covers, academic_year, application_deadline, isee_threshold, stipend_amount, source_url, call_status, guide_sections")
        .ilike("name", pattern)
    ).data ?? [];

  const countriesOf = async (bodyId) =>
    ((await admin.from("scholarship_body_destinations").select("destination_id").eq("scholarship_body_id", bodyId)).data ?? [])
      .map((l) => l.destination_id)
      .sort();

  // A stored guide in a fixed key order: jsonb keeps an object's keys in its
  // own order (shortest first, so "body" before "title"), not the order they
  // were written in, and comparing the raw JSON would fail a correct import.
  const sections = (guide) => JSON.stringify((guide ?? []).map((g) => ({ title: g.title, body: g.body })));

  const BODY = "zztmp Borsa Bodyland";
  const firstRow = {
    Name: BODY,
    Countries: alpha.display_name,
    Region: "Bodyshire",
    "Universities covered": "zztmp University of Bodyland; zztmp Bodyland Polytechnic",
    "Academic year": "2026/2027",
    "Application deadline": "7 September 2026, 13:00",
    "ISEE threshold": "≤€26,887.93",
    "Stipend amount": "Up to €7,000",
    "Source URL": "https://example.org/zztmp-borsa",
    "Call status": "published",
    "Guide 1 title": "Important dates",
    "Guide 1 text": "Apply by 7 September.\nUpload by 30 September.",
    "Guide 2 title": "Documents",
    "Guide 2 text": "Passport",
  };

  // ------------------------------------------- 1. preview, then apply a new body
  let page = await signIn(browser, processing.email);

  let shown = await preview(page, asCsv([firstRow]));
  ok("the first upload answers with a preview, not a result", shown.mode === "preview", `${shown.mode}: ${shown.text.slice(0, 200)}`);
  ok("...which counts what it would add", /Will add 1 scholarship body\./.test(shown.text), shown.text.slice(0, 300));
  ok("...and names the new body, its country and its guide",
    /zztmp Borsa Bodyland — new scholarship body for zztmp Bodyland \(Public\), guide of 2 sections/.test(shown.text),
    shown.text.slice(0, 500));
  ok("a preview writes nothing at all", (await bodiesLike("zztmp%")).length === 0);

  let done = await apply(shown.panel);
  ok("applying adds exactly what the preview said",
    done.mode === "applied" && /Added 1 scholarship body\./.test(done.text), `${done.mode}: ${done.text.slice(0, 300)}`);

  const [created] = await bodiesLike(BODY);
  ok("the body is on file with the sheet's values",
    created?.region === "Bodyshire" && created?.academic_year === "2026/2027" && created?.isee_threshold === "≤€26,887.93" &&
      created?.application_deadline === "7 September 2026, 13:00" && created?.call_status === "published",
    JSON.stringify(created));
  ok("...its covered universities as a list",
    JSON.stringify(created?.covers) === JSON.stringify(["zztmp University of Bodyland", "zztmp Bodyland Polytechnic"]),
    JSON.stringify(created?.covers));
  ok("...serving the country the sheet named", JSON.stringify(await countriesOf(created.id)) === JSON.stringify([alpha.id]));
  ok("...with its guide, line breaks and all",
    sections(created?.guide_sections) ===
      JSON.stringify([
        { title: "Important dates", body: "Apply by 7 September.\nUpload by 30 September." },
        { title: "Documents", body: "Passport" },
      ]),
    JSON.stringify(created?.guide_sections));

  // ------------------------------------------------- 2. the same sheet again
  shown = await preview(page, asCsv([firstRow]));
  ok("the same sheet again is a genuine no-op", /Nothing to add or change/.test(shown.text), shown.text.slice(0, 300));
  ok("...and offers nothing to apply", !(await applyOffered(shown.panel)));

  // ---------------------------------------- 3. a blank cell changes nothing
  shown = await preview(page, asCsv([{ Name: BODY, "Stipend amount": "Up to €7,500" }]));
  ok("a partial sheet previews only the cell it fills",
    /stipend_amount Up to €7,000 → Up to €7,500/.test(shown.text) && /Changes — old → new \(1\)/.test(shown.text),
    shown.text.slice(0, 500));
  done = await apply(shown.panel);
  const [partial] = await bodiesLike(BODY);
  ok("a filled cell overwrites", partial?.stipend_amount === "Up to €7,500", String(partial?.stipend_amount));
  ok("an empty cell leaves the stored value alone", partial?.region === "Bodyshire" && partial?.source_url === "https://example.org/zztmp-borsa",
    JSON.stringify(partial));
  ok("...including the covered universities", (partial?.covers ?? []).length === 2, JSON.stringify(partial?.covers));
  ok("...the countries", JSON.stringify(await countriesOf(partial.id)) === JSON.stringify([alpha.id]));
  ok("...and the guide", (partial?.guide_sections ?? []).length === 2, JSON.stringify(partial?.guide_sections));

  // ------------------------ 4. a filled guide replaces; filled countries replace
  shown = await preview(page, asCsv([{ Name: BODY, Countries: beta.display_name, "Guide 1 title": "Where to apply", "Guide 1 text": "Online only." }]));
  ok("a filled guide is previewed as a replacement that names what it removes",
    /guide replaced: 2 sections → 1 section; removes "Important dates", "Documents"; adds "Where to apply"/.test(shown.text),
    shown.text.slice(0, 600));
  ok("...and a filled Countries cell as the new list",
    /countries zztmp Bodyland \(Public\) → zztmp Otherbodyland \(Public\)/.test(shown.text), shown.text.slice(0, 600));
  ok("...still unwritten", (await bodiesLike(BODY))[0]?.guide_sections?.length === 2);
  done = await apply(shown.panel);
  const [replaced] = await bodiesLike(BODY);
  ok("the guide is exactly the sheet's",
    sections(replaced?.guide_sections) === JSON.stringify([{ title: "Where to apply", body: "Online only." }]),
    JSON.stringify(replaced?.guide_sections));
  ok("the body serves exactly the sheet's countries", JSON.stringify(await countriesOf(replaced.id)) === JSON.stringify([beta.id]));

  // --------------------------------- 5. an unknown country creates nothing
  shown = await preview(page, asCsv([{ Name: "zztmp Narnia Grants", Countries: "zztmp Narnia", "Academic year": "2026/2027" }]));
  ok("an unknown country is reported by name",
    /country "zztmp Narnia" is not a destination the portal has/.test(shown.text), shown.text.slice(0, 500));
  ok("...the body is not added, and there is nothing to apply",
    /Nothing to add or change/.test(shown.text) && !(await applyOffered(shown.panel)), shown.text.slice(0, 300));
  ok("...and nothing was written", (await bodiesLike("zztmp Narnia%")).length === 0);

  // ---------------------------- 6. a similar name updates the body it resembles
  shown = await preview(page, asCsv([{ Name: "ZZTMP Borsa-Bodyland", Region: "Bodyshire North" }]));
  ok("a similar name is listed as a match to check",
    /"ZZTMP Borsa-Bodyland" → updates "zztmp Borsa Bodyland"/.test(shown.text), shown.text.slice(0, 500));
  done = await apply(shown.panel);
  const similar = await bodiesLike("zztmp%borsa%bodyland");
  ok("the stored body was updated", similar.length === 1 && similar[0].region === "Bodyshire North", JSON.stringify(similar));
  ok("...kept its stored name", similar[0]?.name === BODY, String(similar[0]?.name));
  ok("...and no duplicate was created", similar.length === 1, similar.map((b) => b.name).join(", "));

  // -------------------------------------------------------- 7. the round trip
  {
    const exported = await page.request.get(`${BASE}/api/export/scholarship-bodies`);
    ok("the export downloads as a spreadsheet",
      exported.ok() && (exported.headers()["content-type"] ?? "").includes("spreadsheetml"),
      `${exported.status()} ${exported.headers()["content-type"]}`);
    const bytes = await exported.body();

    // Not vacuous: a no-op proves nothing if the body is not in the file.
    const sheets = await readXlsxFile(bytes);
    const data = sheets.find((s) => s.sheet === "Scholarship bodies")?.data ?? [];
    const headers = (data[0] ?? []).map(String);
    const row = data.find((r) => r[0] === BODY) ?? [];
    const cell = (h) => row[headers.indexOf(h)];
    ok("...and carries the check's body as it stands",
      cell("Countries") === beta.display_name && cell("Guide 1 title") === "Where to apply" && cell("Region") === "Bodyshire North",
      JSON.stringify({ countries: cell("Countries"), guide: cell("Guide 1 title"), region: cell("Region") }));

    shown = await preview(page, { name: "scholarship-bodies.xlsx", mimeType: XLSX, buffer: bytes });
    ok("re-importing an untouched export changes nothing", /Nothing to add or change/.test(shown.text), shown.text.slice(0, 600));
    ok("...matches nothing by a merely similar name, because the names came from the database",
      !/similar name|Held back/.test(shown.text), shown.text.slice(0, 600));
    ok("...and finds nothing wrong in any cell", !/Rows with something wrong/.test(shown.text), shown.text.slice(0, 600));
  }

  // ------------------------------------------------------- the blank template
  {
    const template = await page.request.get(`${BASE}/api/samples/scholarship-bodies`);
    ok("the blank template downloads as a spreadsheet",
      template.ok() && (template.headers()["content-type"] ?? "").includes("spreadsheetml"), String(template.status()));
    shown = await preview(page, { name: "template.xlsx", mimeType: XLSX, buffer: await template.body() });
    ok("uploaded untouched, its example row is skipped and said so",
      /Skipped 1 example row/.test(shown.text) && /Nothing to add or change/.test(shown.text), shown.text.slice(0, 400));
  }

  // ---------------------------------------------------------- 8. who may import
  await page.close();
  page = await signIn(browser, counselor.email);
  await page.goto(`${BASE}/setup/scholarship-bodies`, { waitUntil: "domcontentloaded" });
  // The page's own heading first, so an absent control means absent rather
  // than not rendered yet.
  await heading(page).waitFor({ timeout: 60_000 });
  ok("a counsellor is not offered the import",
    (await importButton(page).count()) === 0 && (await panelOf(page).count()) === 0);

  await page.close();
  page = await signIn(browser, manager.email);
  shown = await preview(page, asCsv([{ Name: BODY, Region: "Managed" }]));
  ok("a manager given scholarships.manage is offered it, and told the database will refuse them",
    shown.mode === "error" && /only lets Processing and Super Admin write/.test(shown.text), `${shown.mode}: ${shown.text.slice(0, 300)}`);
  ok("...and nothing was written", (await bodiesLike(BODY))[0]?.region === "Bodyshire North");

  await browser.close();
} finally {
  // Bodies first: guide_updated_by points at the fixture staff.
  await admin.from("scholarship_bodies").delete().ilike("name", "zztmp%");
  for (const person of [processing, manager]) {
    if (person) await admin.from("staff_permission_overrides").delete().eq("staff_id", person.id);
  }
  const removed = await fx.cleanup();
  for (const id of destinationIds) await admin.from("destinations").delete().eq("id", id);
  process.exitCode = finish(removed + destinationIds.length) === 0 ? 0 : 1;
}
