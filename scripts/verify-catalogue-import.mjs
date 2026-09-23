// The catalogue imports, end to end against a deployed portal.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:catalogue
//
// The universities and programmes sheets add or update rather than skipping
// what already exists. Three things about that fail silently, and each is one
// section below.
//
//   1. **An empty cell must change nothing.** A sheet of names and fees that
//      quietly blanked the twelve columns it did not mention would look like a
//      completely successful import. Nothing in a build or a unit test can see
//      the difference, because the difference is what is left in the database.
//
//   2. **Only a Super Admin may overwrite.** Migration 0039 restricts UPDATE
//      on universities and programs to super_admin, and an UPDATE that RLS
//      refuses does not error — it matches no rows and reports success. So the
//      wrong answer here is not a crash, it is a counsellor being told forty
//      programmes were updated when none were.
//
//   3. **A near-miss name is held back.** "Sapienza Univ. of Rome" against a
//      stored "Sapienza University of Rome" must neither overwrite the stored
//      row nor silently create a second university.
//
// Everything is created under a `zztmp` destination of its own, so no real
// university or programme is touched, and it is removed in a finally.
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
  "university_name", "city", "region", "type", "levels_offered", "fields_offered",
  "level", "program_name", "core_field", "tuition_fee", "duration", "language_requirement", "rounds",
];

/** A CSV the combined importer accepts. Rows are objects keyed by header. */
function csv(rows) {
  const escape = (value) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [
    CATALOGUE_HEADERS.join(","),
    ...rows.map((row) => CATALOGUE_HEADERS.map((h) => escape(row[h])).join(",")),
  ].join("\n");
}

const destinationIds = [];

try {
  // ------------------------------------------------------------- a sandbox
  const { data: destination, error: destError } = await admin
    .from("destinations")
    .insert({
      country: "zztmp Catalogueland",
      country_code: "ZZ",
      track: "private",
      display_name: "zztmp Catalogueland (Private)",
      currency: "EUR",
      status: "active",
    })
    .select("id, display_name, track")
    .single();
  if (destError) throw new Error(`could not create the sandbox destination: ${destError.message}`);
  destinationIds.push(destination.id);

  const superUser = await fx.staff("catsuper", ["super_admin"]);
  const counselor = await fx.staff("catcounselor", ["counselor"]);
  console.log(`sandbox ${destination.display_name}\n`);

  const browser = await openBrowser();

  /**
   * Uploads a CSV through the real form and hands back what the page then
   * says. Driven through the UI rather than by calling the action, because
   * the Super Admin rule is enforced by RLS underneath it and a direct call
   * would not carry the right session.
   */
  async function importCatalogue(page, rows) {
    await page.goto(`${BASE}/setup/universities`, { waitUntil: "domcontentloaded" });
    const panel = page.locator("details", { hasText: "Import a whole destination" }).first();
    await panel.locator("summary").first().click();
    await panel.locator('select[name="destination_id"]').selectOption(destination.id);
    await panel.locator('input[type="file"]').setInputFiles({
      name: "catalogue.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv(rows), "utf8"),
    });
    await panel.getByRole("button", { name: "Import" }).click();
    // Poll for the report rather than sleeping: the write lands before the
    // response does, so finding the rows would prove nothing about the page.
    await panel
      .locator("p", { hasText: /Added|Updated|Nothing to add|could not|no rows/i })
      .first()
      .waitFor({ timeout: 60_000 });
    return (await panel.innerText()).replace(/\s+/g, " ");
  }

  const read = async (name) =>
    (
      await admin
        .from("universities")
        .select("id, name, city, region, type, levels_offered")
        .eq("destination_id", destination.id)
        .eq("name", name)
        .maybeSingle()
    ).data;

  // -------------------------------------------------- 1. a first import adds
  let page = await signIn(browser, superUser.email);

  let report = await importCatalogue(page, [
    { university_name: "zztmp Sapienza University of Rome", city: "Rome", region: "Lazio", type: "public",
      levels_offered: "bachelors;masters", level: "bachelors", program_name: "zztmp Computer Science",
      core_field: "IT/CS", tuition_fee: "3000", duration: "3 years", language_requirement: "B2 English" },
    { university_name: "zztmp Sapienza University of Rome", city: "Rome", region: "Lazio", type: "public",
      levels_offered: "bachelors;masters", level: "masters", program_name: "zztmp Data Science",
      core_field: "IT/CS", tuition_fee: "4000" },
    { university_name: "zztmp Politecnico di Milano", city: "Milan", type: "public",
      level: "bachelors", program_name: "zztmp Architecture", tuition_fee: "3800" },
  ]);

  ok("one sheet creates the universities and their programmes",
    /Added 2 universities, 3 programmes/.test(report), report.slice(0, 300));

  const sapienza = await read("zztmp Sapienza University of Rome");
  ok("the university columns repeated on every row create it only once", Boolean(sapienza));
  ok("...with the values from the sheet", sapienza?.city === "Rome" && sapienza?.region === "Lazio",
    JSON.stringify(sapienza));

  // ------------------------------------------- 2. re-importing changes nothing
  report = await importCatalogue(page, [
    { university_name: "zztmp Politecnico di Milano", city: "Milan", type: "public",
      level: "bachelors", program_name: "zztmp Architecture", tuition_fee: "3800" },
  ]);
  ok("the same sheet again is a genuine no-op, not a rewrite",
    /Nothing to add or change/.test(report), report.slice(0, 300));

  // --------------------------------- 3. an empty cell leaves the stored value
  //
  // The assertion the whole feature turns on. `region` and `levels_offered`
  // are absent from this sheet's filled cells; if they come back empty the
  // import is destroying data every time somebody uploads a partial sheet.
  report = await importCatalogue(page, [
    { university_name: "zztmp Sapienza University of Rome", city: "Milan",
      level: "bachelors", program_name: "zztmp Computer Science", tuition_fee: "3500" },
  ]);

  const afterPartial = await read("zztmp Sapienza University of Rome");
  ok("a filled cell overwrites", afterPartial?.city === "Milan", String(afterPartial?.city));
  ok("an empty cell leaves the stored value alone", afterPartial?.region === "Lazio", String(afterPartial?.region));
  ok("...including a list column",
    JSON.stringify(afterPartial?.levels_offered) === JSON.stringify(["bachelors", "masters"]),
    JSON.stringify(afterPartial?.levels_offered));
  ok("and the report names the field it changed, old value to new",
    /city Rome → Milan/.test(report), report.slice(0, 400));

  const { data: changedProgram } = await admin
    .from("programs")
    .select("tuition_fee, duration, language_requirement")
    .eq("university_id", afterPartial.id)
    .eq("name", "zztmp Computer Science")
    .maybeSingle();
  ok("a programme's untouched columns survive a partial sheet too",
    Number(changedProgram?.tuition_fee) === 3500 &&
      changedProgram?.duration === "3 years" &&
      changedProgram?.language_requirement === "B2 English",
    JSON.stringify(changedProgram));

  // ------------------------------------------- 4. a near-miss is held back
  report = await importCatalogue(page, [
    { university_name: "zztmp Sapienza Univ. of Rome", city: "Rome",
      level: "bachelors", program_name: "zztmp Robotics", tuition_fee: "3200" },
  ]);
  ok("a near-miss name is held back and named", /Held back/.test(report), report.slice(0, 400));
  ok("...and says which stored name it nearly matched",
    /looks like .zztmp Sapienza University of Rome./.test(report), report.slice(0, 400));

  const { count: universityCount } = await admin
    .from("universities")
    .select("id", { count: "exact", head: true })
    .eq("destination_id", destination.id);
  // The point of holding back, stated as the thing that must NOT have happened.
  ok("...so no duplicate university was created", universityCount === 2, String(universityCount));

  // ------------------------------- 5. a counsellor may add but not overwrite
  await page.close();
  page = await signIn(browser, counselor.email);

  report = await importCatalogue(page, [
    { university_name: "zztmp Politecnico di Milano", city: "Turin", type: "public",
      level: "bachelors", program_name: "zztmp Architecture", tuition_fee: "9999" },
  ]);
  ok("a counsellor is told the overwrite was refused, not that it worked",
    /only a Super Admin may overwrite/i.test(report), report.slice(0, 400));

  const politecnico = await read("zztmp Politecnico di Milano");
  // RLS refuses the UPDATE without raising, so a wrong implementation reports
  // success here. This is the assertion that catches that.
  ok("...and nothing was actually changed", politecnico?.city === "Milan", String(politecnico?.city));

  report = await importCatalogue(page, [
    { university_name: "zztmp Bocconi University", city: "Milan", type: "private",
      level: "masters", program_name: "zztmp Economics", tuition_fee: "12000" },
  ]);
  ok("a counsellor can still add something new",
    /Added 1 university, 1 programme/.test(report), report.slice(0, 300));

  const bocconi = await read("zztmp Bocconi University");
  ok("...and it really is there", Boolean(bocconi), JSON.stringify(bocconi));

  await browser.close();
} finally {
  const removed = await fx.cleanup();
  for (const id of destinationIds) {
    // Cascades to its universities, their programmes and those rounds.
    await admin.from("destinations").delete().eq("id", id);
  }
  process.exitCode = finish(removed + destinationIds.length) === 0 ? 0 : 1;
}
