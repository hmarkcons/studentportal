// The catalogue imports, end to end against a deployed portal.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:catalogue
//
// The imports add or update rather than skipping what already exists, across
// as many destinations as the sheet names, and every one is previewed before
// it writes. Each of the things below fails silently, which is why each is
// asserted on what the DATABASE holds afterwards rather than on what the page
// says:
//
//   1. **A preview writes nothing.** If it did, "preview" would be a lie that
//      reads as a feature, and the confirm step would be decoration.
//   2. **An empty cell changes nothing.** A sheet of names and fees that
//      quietly blanked the columns it did not mention would look like a
//      completely successful import.
//   3. **A clean round trip is a no-op**, for one destination and for all of
//      them at once. If an untouched export reports changes, every real edit
//      carries changes nobody asked for.
//   4. **A similar name updates the record it resembles** and keeps the stored
//      name — without creating a duplicate — while a name close to TWO records
//      is held back and touches neither.
//   5. **Only a Super Admin may import.** Anyone else must not be offered it.
//
// Everything is created under `zztmp` destinations of its own, so no real
// university or programme is touched, and they are removed in a finally.
import {
  BASE,
  clients,
  fixtures,
  openBrowser,
  reporter,
  requireConfirmation,
  signIn,
} from "./verify-portal-lib.mjs";

requireConfirmation("check:catalogue");

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const CATALOGUE_HEADERS = [
  "destination", "university_name", "city", "region", "type", "levels_offered", "fields_offered",
  "level", "program_name", "core_field", "tuition_fee", "duration", "language_requirement", "rounds",
];

/** A CSV the importers accept. Rows are objects keyed by header. */
function csv(rows, headers = CATALOGUE_HEADERS) {
  const escape = (value) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers.join(","), ...rows.map((row) => headers.map((h) => escape(row[h])).join(","))].join("\n");
}

const asCsv = (rows, headers) => ({
  name: "catalogue.csv",
  mimeType: "text/csv",
  buffer: Buffer.from(csv(rows, headers), "utf8"),
});

const destinationIds = [];

try {
  // ------------------------------------------------------------- a sandbox
  async function sandbox(country, code, track) {
    const display = `zztmp ${country} (${track === "public" ? "Public" : "Private"})`;
    const { data, error } = await admin
      .from("destinations")
      .insert({ country: `zztmp ${country}`, country_code: code, track, display_name: display, currency: "EUR", status: "active" })
      .select("id, display_name, track")
      .single();
    if (error) throw new Error(`could not create the sandbox destination: ${error.message}`);
    destinationIds.push(data.id);
    return data;
  }
  const alpha = await sandbox("Catalogueland", "ZZ", "private");
  const beta = await sandbox("Otherland", "ZY", "public");

  const superUser = await fx.staff("catsuper", ["super_admin"]);
  // Super Admin as a SECOND role: hasRole must read `roles`, not the primary.
  const secondary = await fx.staff("catsecond", ["counselor", "super_admin"]);
  const counselor = await fx.staff("catcounselor", ["counselor"]);
  console.log(`sandboxes ${alpha.display_name}, ${beta.display_name}\n`);

  const browser = await openBrowser();

  const panelOf = (page) => page.locator("details", { hasText: "Import a catalogue" }).first();

  async function openCatalogue(page) {
    await page.goto(`${BASE}/setup/universities`, { waitUntil: "domcontentloaded" });
    const panel = panelOf(page);
    await panel.locator("summary").first().click();
    return panel;
  }

  /**
   * Waits for the action's answer, never for wording: the help text in this
   * same panel already contains "updated", "Added" and "Nothing is saved", so
   * matching on those returns before the action has run. Every caller starts
   * from a freshly loaded page, so the first report element is this answer.
   */
  async function answer(panel) {
    const report = panel.locator("[data-import-report]").first();
    await report.waitFor({ timeout: 90_000 });
    return { mode: await report.getAttribute("data-import-report"), text: (await report.innerText()).replace(/\s+/g, " ") };
  }

  /** Upload and preview. Returns the preview; the panel stays open for apply. */
  async function preview(page, file, { fallback = "" } = {}) {
    const panel = await openCatalogue(page);
    await panel.locator('select[name="destination_id"]').selectOption(fallback);
    await panel.locator('input[type="file"]').setInputFiles(file);
    await panel.getByRole("button", { name: "Preview" }).click();
    return { panel, ...(await answer(panel)) };
  }

  async function apply(panel) {
    await panel.getByRole("button", { name: "Apply these changes" }).click();
    // Only the answer to THIS click carries "applied": the preview on screen
    // until then says "preview", so it cannot satisfy the wait early.
    const report = panel.locator('[data-import-report="applied"], [data-import-report="error"]').first();
    await report.waitFor({ timeout: 90_000 });
    return { mode: await report.getAttribute("data-import-report"), text: (await report.innerText()).replace(/\s+/g, " ") };
  }

  const universitiesIn = async (destinationId) =>
    (
      await admin
        .from("universities")
        .select("id, name, city, region, type, levels_offered")
        .eq("destination_id", destinationId)
        .order("name")
    ).data ?? [];

  const programmesOf = async (universityId) =>
    (
      await admin
        .from("programs")
        .select("id, name, level, tuition_fee, duration, language_requirement")
        .eq("university_id", universityId)
        .order("name")
    ).data ?? [];

  // ------------------------------- 1. one sheet, two destinations, previewed
  let page = await signIn(browser, superUser.email);

  const firstSheet = asCsv([
    { destination: alpha.display_name, university_name: "zztmp Sapienza University of Rome", city: "Rome", region: "Lazio",
      type: "public", levels_offered: "bachelors;masters", level: "bachelors", program_name: "zztmp Computer Science",
      core_field: "IT/CS", tuition_fee: "3000", duration: "3 years", language_requirement: "B2 English" },
    { destination: alpha.display_name, university_name: "zztmp Sapienza University of Rome", city: "Rome", region: "Lazio",
      type: "public", levels_offered: "bachelors;masters", level: "masters", program_name: "zztmp Data Science",
      core_field: "IT/CS", tuition_fee: "4000" },
    { destination: alpha.display_name, university_name: "zztmp Politecnico di Milano", city: "Milan", type: "public",
      level: "bachelors", program_name: "zztmp Architecture", tuition_fee: "3800" },
    // The second destination, by its country rather than its display name.
    { destination: "zztmp Otherland", university_name: "zztmp Heidelberg University", city: "Heidelberg",
      level: "masters", program_name: "zztmp Physics", tuition_fee: "1500" },
  ]);

  let shown = await preview(page, firstSheet);
  ok("the first upload answers with a preview, not a result", shown.mode === "preview", `${shown.mode}: ${shown.text.slice(0, 200)}`);
  ok("...which counts what it would add across both destinations",
    /Will add 3 universities, 4 programmes/.test(shown.text), shown.text.slice(0, 300));
  ok("...and names each new record",
    /zztmp Otherland \(Public\) · zztmp Heidelberg University — new university/.test(shown.text), shown.text.slice(0, 600));

  // The assertion the preview turns on: it must not have written anything.
  const afterPreview = [...(await universitiesIn(alpha.id)), ...(await universitiesIn(beta.id))];
  ok("a preview writes nothing at all", afterPreview.length === 0, JSON.stringify(afterPreview));

  let done = await apply(shown.panel);
  ok("applying the preview adds exactly what it said",
    done.mode === "applied" && /Added 3 universities, 4 programmes/.test(done.text), `${done.mode}: ${done.text.slice(0, 300)}`);

  const alphaUnis = await universitiesIn(alpha.id);
  const betaUnis = await universitiesIn(beta.id);
  ok("each university lands in the destination its row names",
    alphaUnis.length === 2 && betaUnis.length === 1 && betaUnis[0].name === "zztmp Heidelberg University",
    JSON.stringify({ alpha: alphaUnis.map((u) => u.name), beta: betaUnis.map((u) => u.name) }));
  ok("a new university takes its destination's track when the sheet is silent",
    betaUnis[0]?.type === "public", String(betaUnis[0]?.type));

  const sapienza = alphaUnis.find((u) => u.name === "zztmp Sapienza University of Rome");
  ok("the university repeated on two rows is created once, with the sheet's values",
    sapienza?.city === "Rome" && sapienza?.region === "Lazio", JSON.stringify(sapienza));
  ok("...and carries both its programmes", (await programmesOf(sapienza.id)).length === 2);

  // ------------------------------------------- 2. the same sheet again
  shown = await preview(page, firstSheet);
  ok("the same sheet again is a genuine no-op", /Nothing to add or change/.test(shown.text), shown.text.slice(0, 300));
  ok("...and offers nothing to apply",
    (await shown.panel.getByRole("button", { name: "Apply these changes" }).count()) === 0);

  // ------------------- 3. a partial sheet, destination from the form instead
  //
  // `region` and `levels_offered` are absent from this sheet's filled cells;
  // if they come back empty the import is destroying data every time somebody
  // uploads a partial sheet. And the destination column is blank, so the
  // form's fallback must be what places the row.
  shown = await preview(
    page,
    asCsv([{ university_name: "zztmp Sapienza University of Rome", city: "Milan",
      level: "bachelors", program_name: "zztmp Computer Science", tuition_fee: "3500" }]),
    { fallback: alpha.id }
  );
  ok("the preview shows each change as old → new", /city Rome → Milan/.test(shown.text), shown.text.slice(0, 400));
  ok("...including the programme's", /tuition_fee 3000 → 3500/.test(shown.text), shown.text.slice(0, 400));
  ok("...and still has not written it", (await universitiesIn(alpha.id)).find((u) => u.id === sapienza.id)?.city === "Rome");
  done = await apply(shown.panel);

  const afterPartial = (await universitiesIn(alpha.id)).find((u) => u.id === sapienza.id);
  ok("a filled cell overwrites", afterPartial?.city === "Milan", String(afterPartial?.city));
  ok("an empty cell leaves the stored value alone", afterPartial?.region === "Lazio", String(afterPartial?.region));
  ok("...including a list column",
    JSON.stringify(afterPartial?.levels_offered) === JSON.stringify(["bachelors", "masters"]),
    JSON.stringify(afterPartial?.levels_offered));
  const cs = (await programmesOf(sapienza.id)).find((p) => p.name === "zztmp Computer Science");
  ok("a programme's untouched columns survive a partial sheet too",
    Number(cs?.tuition_fee) === 3500 && cs?.duration === "3 years" && cs?.language_requirement === "B2 English",
    JSON.stringify(cs));

  // ------------------------------------------------------ 4. the round trip
  for (const [label, param] of [["one destination", alpha.id], ["every destination", "all"]]) {
    const exported = await page.request.get(`${BASE}/api/export/catalogue?destination=${param}`);
    ok(`the export of ${label} downloads as a spreadsheet`,
      exported.ok() && (exported.headers()["content-type"] ?? "").includes("spreadsheetml"),
      `${exported.status()} ${exported.headers()["content-type"]}`);
    shown = await preview(page, {
      name: "catalogue-export.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: await exported.body(),
    });
    ok(`re-importing an untouched export of ${label} changes nothing`,
      /Nothing to add or change/.test(shown.text), shown.text.slice(0, 400));
    ok("...and matches nothing by a merely similar name, because the names came from the database",
      !/similar name|Held back/.test(shown.text), shown.text.slice(0, 400));
  }

  // --------------------------- 5. a similar name updates what it resembles
  shown = await preview(page, asCsv([
    { destination: alpha.display_name, university_name: "zztmp Sapienza Univ. of Rome", city: "Florence",
      level: "bachelors", program_name: "zztmp Computer Sciences", tuition_fee: "3700" },
  ]));
  ok("a similar university name is listed as a match to check",
    /"zztmp Sapienza Univ\. of Rome" → updates "zztmp Sapienza University of Rome"/.test(shown.text), shown.text.slice(0, 500));
  ok("...and so is a similar programme name",
    /"zztmp Computer Sciences" \(bachelors\) → updates "zztmp Computer Science"/.test(shown.text), shown.text.slice(0, 500));
  done = await apply(shown.panel);

  const afterSimilar = await universitiesIn(alpha.id);
  const sapienzaNow = afterSimilar.find((u) => u.id === sapienza.id);
  ok("the stored university was updated", sapienzaNow?.city === "Florence", JSON.stringify(sapienzaNow));
  ok("...and kept its stored name", sapienzaNow?.name === "zztmp Sapienza University of Rome", String(sapienzaNow?.name));
  // The point of matching, stated as the thing that must NOT have happened.
  ok("...and no duplicate university was created", afterSimilar.length === 2, afterSimilar.map((u) => u.name).join(", "));
  const programmesNow = await programmesOf(sapienza.id);
  ok("the similar programme updated the stored one rather than adding a second",
    programmesNow.length === 2 && Number(programmesNow.find((p) => p.name === "zztmp Computer Science")?.tuition_fee) === 3700,
    JSON.stringify(programmesNow));

  // ------------------------ 6. close to two records: held back, neither touched
  const { data: pair, error: pairError } = await admin
    .from("universities")
    .insert([
      { destination_id: beta.id, name: "zztmp University of Milan", city: "Milan", type: "public" },
      { destination_id: beta.id, name: "zztmp University of Milano", city: "Milan", type: "public" },
    ])
    .select("id");
  if (pairError) throw new Error(`could not seed the ambiguous pair: ${pairError.message}`);

  shown = await preview(page, asCsv([
    { destination: beta.display_name, university_name: "zztmp Univ. of Milan", city: "Turin" },
  ]));
  ok("a name close to two records is held back and names both",
    /Held back/.test(shown.text) && /zztmp University of Milan/.test(shown.text) && /zztmp University of Milano/.test(shown.text),
    shown.text.slice(0, 500));
  ok("...and offers nothing to apply",
    (await shown.panel.getByRole("button", { name: "Apply these changes" }).count()) === 0);
  const { data: pairAfter } = await admin.from("universities").select("city").in("id", pair.map((p) => p.id));
  ok("...and neither record was changed", pairAfter.every((u) => u.city === "Milan"), JSON.stringify(pairAfter));

  // ------------- 6b. a programme already on file twice: never pick a copy
  //
  // Real data has these (Germany, 43 pairs). Pairing a row with an arbitrary
  // copy overwrote it with the other copy's values on a plain round trip.
  const politecnico = alphaUnis.find((u) => u.name === "zztmp Politecnico di Milano");
  const { error: twinError } = await admin.from("programs").insert([
    { university_id: politecnico.id, level: "masters", name: "zztmp Design", tuition_fee: 2000 },
    { university_id: politecnico.id, level: "masters", name: "zztmp Design", tuition_fee: 2500 },
  ]);
  if (twinError) throw new Error(`could not seed the duplicate programme: ${twinError.message}`);
  const designRow = (fee) => ({ destination: alpha.display_name, university_name: "zztmp Politecnico di Milano",
    level: "masters", program_name: "zztmp Design", tuition_fee: fee });

  shown = await preview(page, asCsv([designRow("2000"), designRow("2500")]));
  ok("rows identical to the two stored copies change nothing",
    /Nothing to add or change/.test(shown.text) && !/Held back/.test(shown.text), shown.text.slice(0, 400));

  shown = await preview(page, asCsv([designRow("2750")]));
  ok("a row that would change one of the copies is held back instead",
    /Held back/.test(shown.text) && /zztmp Design \(masters\) is on file 2 times/.test(shown.text), shown.text.slice(0, 400));
  const twinFees = (await programmesOf(politecnico.id)).filter((p) => p.name === "zztmp Design").map((p) => Number(p.tuition_fee)).sort();
  ok("...and neither copy was touched", JSON.stringify(twinFees) === "[2000,2500]", JSON.stringify(twinFees));

  // -------------------------- 7. a changed file withdraws the confirm button
  shown = await preview(page, asCsv([
    { destination: beta.display_name, university_name: "zztmp Heidelberg University", city: "Mannheim" },
  ]));
  const applyButton = shown.panel.getByRole("button", { name: "Apply these changes" });
  ok("a preview with work in it offers Apply", (await applyButton.count()) === 1);
  await shown.panel.locator('input[type="file"]').setInputFiles(asCsv([
    { destination: beta.display_name, university_name: "zztmp Heidelberg University", city: "Stuttgart" },
  ]));
  ok("choosing another file withdraws it until that one is previewed", (await applyButton.count()) === 0);
  const heidelberg = (await universitiesIn(beta.id)).find((u) => u.name === "zztmp Heidelberg University");
  ok("...and neither file was written", heidelberg?.city === "Heidelberg", String(heidelberg?.city));

  // --------------------------------------- 8. the per-university programmes
  await page.goto(`${BASE}/setup/universities/${heidelberg.id}`, { waitUntil: "domcontentloaded" });
  {
    const panel = page.locator("details", { hasText: "Import programmes from a spreadsheet" }).first();
    await panel.locator("summary").first().click();
    await panel.locator('input[type="file"]').setInputFiles(asCsv(
      [{ level: "masters", name: "zztmp Physics", tuition_fee: "1600" }, { level: "phd", name: "zztmp Astronomy" }],
      ["level", "name", "tuition_fee"]
    ));
    await panel.getByRole("button", { name: "Preview" }).click();
    const previewed = await answer(panel);
    ok("the programmes sheet previews too",
      previewed.mode === "preview" && /Will add 1 programme\. Will update 1 programme/.test(previewed.text),
      previewed.text.slice(0, 300));
    ok("...without writing", (await programmesOf(heidelberg.id)).length === 1);
    const applied = await apply(panel);
    ok("...and applies", applied.mode === "applied", applied.text.slice(0, 200));
    const own = await programmesOf(heidelberg.id);
    ok("...exactly what it previewed",
      own.length === 2 && Number(own.find((p) => p.name === "zztmp Physics")?.tuition_fee) === 1600, JSON.stringify(own));
  }

  // --------------------------------------------------- 9. who may import
  await page.close();
  page = await signIn(browser, secondary.email);
  await page.goto(`${BASE}/setup/universities`, { waitUntil: "domcontentloaded" });
  ok("Super Admin held as a second role is offered the import",
    (await panelOf(page).count()) === 1);

  await page.close();
  page = await signIn(browser, counselor.email);
  await page.goto(`${BASE}/setup/universities`, { waitUntil: "domcontentloaded" });
  // Waits for the page's own content first, so an absent panel means absent
  // rather than not rendered yet.
  await page.getByRole("heading", { name: "Universities" }).waitFor({ timeout: 60_000 });
  ok("a counsellor is not offered the catalogue import", (await panelOf(page).count()) === 0);
  ok("...nor the universities import",
    (await page.locator("details", { hasText: "Import universities from a spreadsheet" }).count()) === 0);
  await page.goto(`${BASE}/setup/universities/${heidelberg.id}`, { waitUntil: "domcontentloaded" });
  await page.getByText("zztmp Heidelberg University").first().waitFor({ timeout: 60_000 });
  ok("...nor the programmes import",
    (await page.locator("details", { hasText: "Import programmes from a spreadsheet" }).count()) === 0);

  await browser.close();
} finally {
  const removed = await fx.cleanup();
  for (const id of destinationIds) {
    // Cascades to its universities, their programmes and those rounds.
    await admin.from("destinations").delete().eq("id", id);
  }
  process.exitCode = finish(removed + destinationIds.length) === 0 ? 0 : 1;
}
