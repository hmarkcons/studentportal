// Application fee, programme coordinator and DSU body (0287), end to end.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:appfee
//
//   the template    the blank catalogue template carries the six new columns,
//                   an example of each, and dropdowns of currencies and of the
//                   scholarship bodies on file.
//   importing       a university fee with no currency takes the destination's
//                   (a trigger, so the check uses a GBP destination: EUR would
//                   pass by coincidence); a programme fee "€50" says EUR by its
//                   symbol; the DSU body is matched by name and stored as the
//                   body; a bad coordinator email and a body from another
//                   country are reported and change nothing; an untouched
//                   export re-imports as a no-op.
//   the page        the DSU picker offers only the country's bodies; the edit
//                   form saves a fee and currency; each programme shows the
//                   fee it charges — its own, or the university's, said so.
//   applications    a new application is pre-filled with its programme's fee,
//                   or the university's, currency and all — by a trigger, so
//                   every path that creates one does it; a fee given is kept.
//                   Its page shows the coordinator and the catalogue's fee.
//   words (0303)    a fee or a tuition in words — "Free for EU students",
//                   "€3,000 per year" — is imported, exported, shown and saved
//                   exactly as written, through the sheet, the programme form
//                   and the application's own form, and an application copies
//                   it from its programme.
//   anything (0304) a level of the university's own, several coordinator
//                   emails (each its own mail link), an interview answered in
//                   words, a link without its https:// — imported, shown and
//                   saved as written; a "javascript:" typed as a link is kept
//                   as text and never made a link; a deadline of "Rolling"
//                   is saved as words and shown in place of a date.
//   scholarship     the student's Scholarship tab names the university's DSU
//                   body. The names are chosen so the old name-matching guess
//                   finds nothing: the body shows only if the field is read.
//
// Everything lives under a zztmp destination and body, removed in a finally.
import ExcelJS from "exceljs";
import { BASE, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:appfee");

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const HEADERS = [
  "destination", "university_name", "city", "type", "university_application_fee", "university_application_fee_currency",
  "dsu_body", "level", "program_name", "tuition_fee", "interview_required", "page_link", "program_application_fee", "program_application_fee_currency", "coordinator_email",
];
function csv(rows) {
  const escape = (v) => {
    const t = String(v ?? "");
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return [HEADERS.join(","), ...rows.map((r) => HEADERS.map((h) => escape(r[h])).join(","))].join("\n");
}
const asCsv = (rows) => ({ name: "catalogue.csv", mimeType: "text/csv", buffer: Buffer.from(csv(rows), "utf8") });

async function poll(fn, seconds = 45) {
  for (let i = 0; i < seconds; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

// Waits until React has taken over what the page is about to type into — a
// select or input changed before hydration is reset by it.
async function hydrated(page, selector) {
  return page
    .waitForFunction((sel) => {
      const el = document.querySelector(sel);
      return Boolean(el && Object.keys(el).some((k) => k.startsWith("__reactFiber")));
    }, selector, { timeout: 30000 })
    .then(() => true, () => false);
}

const UNI = "zztmp Fee University";
let destinationId = null;
const bodyIds = [];
// Closed in the finally: a browser left open keeps the process alive after a
// failure, and the run then hangs with its report unprinted.
let browser = null;

try {
  // --------------------------------------------------------------- sandbox
  const { data: dest, error: destError } = await admin
    .from("destinations")
    .insert({ country: "zztmp Feeland", country_code: "ZF", track: "public", display_name: "zztmp Feeland (Public)", currency: "GBP", status: "active" })
    .select("id, display_name")
    .single();
  if (destError) throw new Error(`sandbox destination: ${destError.message}`);
  destinationId = dest.id;

  const body = async (name, linked) => {
    const { data, error } = await admin.from("scholarship_bodies").insert({ name, region: "zztmp", academic_year: "2099/2100" }).select("id").single();
    if (error) throw new Error(`sandbox body: ${error.message}`);
    bodyIds.push(data.id);
    if (linked) await admin.from("scholarship_body_destinations").insert({ scholarship_body_id: data.id, destination_id: destinationId });
    return data.id;
  };
  const feelandBody = await body("zztmp DSU Feeland", true);
  await body("zztmp Elsewhere Body", false);

  const sup = await fx.staff("appfeesuper", ["super_admin"]);
  browser = await openBrowser();
  const page = await signIn(browser, sup.email);

  // ------------------------------------------------------------ the template
  console.log("\n--- the blank template ---");
  const templateResponse = await page.request.get(`${BASE}/api/samples/catalogue`);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await templateResponse.body());
  const sheet = book.getWorksheet("Catalogue");
  const headers = sheet.getRow(1).values.slice(1).map(String);
  for (const h of ["university_application_fee", "university_application_fee_currency", "dsu_body", "program_application_fee", "program_application_fee_currency", "coordinator_email"]) {
    ok(`the template has a ${h} column`, headers.includes(h), headers.join(", "));
  }
  const cell = (row, header) => String(sheet.getRow(row).getCell(headers.indexOf(header) + 1).value ?? "");
  ok("...with an example university fee and DSU body", cell(2, "university_application_fee") === "30" && cell(2, "dsu_body") === "DiSCo Lazio",
    `${cell(2, "university_application_fee")} / ${cell(2, "dsu_body")}`);
  ok("...one programme charging the university's fee and one its own",
    cell(2, "program_application_fee") === "" && cell(3, "program_application_fee") === "50" && cell(3, "coordinator_email").includes("@"));
  const lists = book.getWorksheet("Lists");
  const column = (letter) => lists.getColumn(letter).values.slice(2).map(String);
  ok("the Lists sheet offers the currencies", column("E").includes("GBP") && column("E").includes("EUR"), column("E").join(","));
  ok("...and every scholarship body on file, this one included", column("F").includes("zztmp DSU Feeland"));
  const validations = Object.values(sheet.dataValidations.model ?? {});
  ok("dsu_body and both currency columns carry a dropdown",
    validations.some((v) => String(v.formulae?.[0]).includes("$F$")) && validations.filter((v) => String(v.formulae?.[0]).includes("$E$")).length >= 2,
    JSON.stringify(validations.map((v) => v.formulae?.[0])));

  // --------------------------------------------------------------- importing
  console.log("\n--- importing ---");
  const panelOf = () => page.locator("details", { hasText: "Import a catalogue" }).first();
  async function preview(file) {
    await page.goto(`${BASE}/setup/universities`, { waitUntil: "domcontentloaded" });
    const panel = panelOf();
    await hydrated(page, 'input[type="file"]');
    await panel.locator("summary").first().click();
    await panel.locator('select[name="destination_id"]').selectOption("");
    await panel.locator('input[type="file"]').setInputFiles(file);
    await panel.getByRole("button", { name: "Preview" }).click();
    const report = panel.locator("[data-import-report]").first();
    await report.waitFor({ timeout: 90000 });
    return { panel, text: (await report.innerText()).replace(/\s+/g, " ") };
  }
  async function apply(panel) {
    await panel.getByRole("button", { name: "Apply these changes" }).click();
    const report = panel.locator('[data-import-report="applied"], [data-import-report="error"]').first();
    await report.waitFor({ timeout: 90000 });
    return (await report.innerText()).replace(/\s+/g, " ");
  }

  const base = { destination: dest.display_name, university_name: UNI, city: "zztmp Feetown", type: "public",
    university_application_fee: "30", dsu_body: "zztmp dsu feeland" };
  let shown = await preview(asCsv([
    { ...base, level: "bachelors", program_name: "zztmp Inherits", coordinator_email: "inherits@zztmp.example" },
    { ...base, level: "masters", program_name: "zztmp Own Fee", program_application_fee: "€50", coordinator_email: "own@zztmp.example" },
    { ...base, level: "masters", program_name: "zztmp Bad Email", coordinator_email: "Prof Nobody" },
    { ...base, level: "phd", program_name: "zztmp Worded Fee", tuition_fee: "€3,000 per year", program_application_fee: "Free for EU students", coordinator_email: "worded@zztmp.example" },
    // Anything in any field (0304).
    { ...base, level: "Foundation", program_name: "zztmp Foundation Year", interview_required: "Only for non-EU students",
      coordinator_email: "first@zztmp.example; second@zztmp.example", page_link: "www.zztmp.example/foundation", tuition_fee: "3000, 4500" },
  ]));
  ok("a coordinator email in words is not reported (0304)", !/is not an email/.test(shown.text) && !/must be bachelors/.test(shown.text), shown.text.slice(0, 400));
  const applied = await apply(shown.panel);
  ok("the sheet applies", /Added 1 universit/.test(applied), applied.slice(0, 300));

  const { data: uni } = await admin.from("universities").select("id, application_fee, application_fee_currency, dsu_body_id").eq("destination_id", destinationId).eq("name", UNI).single();
  ok("the university fee is stored", Number(uni?.application_fee) === 30, JSON.stringify(uni));
  ok("...in the destination's currency, the sheet having left it blank", uni?.application_fee_currency === "GBP", String(uni?.application_fee_currency));
  ok("the DSU body is matched by name, case aside, and stored as the body", uni?.dsu_body_id === feelandBody, String(uni?.dsu_body_id));
  const programmes = async () => {
    const { data } = await admin.from("programs").select("id, name, level, tuition_fee, application_fee, application_fee_currency, coordinator_email, interview_required, page_link").eq("university_id", uni.id);
    return Object.fromEntries((data ?? []).map((p) => [p.name, p]));
  };
  let progs = await programmes();
  ok("a programme with no fee of its own stores none", progs["zztmp Inherits"]?.application_fee === null && progs["zztmp Inherits"]?.coordinator_email === "inherits@zztmp.example",
    JSON.stringify(progs["zztmp Inherits"]));
  ok("a programme fee of €50 is 50 in EUR, the symbol answering the blank currency",
    Number(progs["zztmp Own Fee"]?.application_fee) === 50 && progs["zztmp Own Fee"]?.application_fee_currency === "EUR", JSON.stringify(progs["zztmp Own Fee"]));
  ok("...and is kept as written", progs["zztmp Bad Email"]?.coordinator_email === "Prof Nobody", JSON.stringify(progs["zztmp Bad Email"]));
  const foundation = progs["zztmp Foundation Year"];
  ok("a level of the university's own is kept as written", foundation?.level === "Foundation", JSON.stringify(foundation));
  ok("...several emails are stored one way, an interview answered in words, a link as typed, two tuitions as two",
    foundation?.coordinator_email === "first@zztmp.example, second@zztmp.example" &&
      foundation?.interview_required === "Only for non-EU students" &&
      foundation?.page_link === "www.zztmp.example/foundation" &&
      foundation?.tuition_fee === "3000, 4500",
    JSON.stringify(foundation));
  ok("a fee and a tuition in words are imported exactly as written",
    progs["zztmp Worded Fee"]?.application_fee === "Free for EU students" && progs["zztmp Worded Fee"]?.tuition_fee === "€3,000 per year",
    JSON.stringify(progs["zztmp Worded Fee"]));
  ok("...and the preview did not call either one \"not a number\"", !/not a number/.test(shown.text), shown.text.slice(0, 400));

  // An untouched export must change nothing, with the new columns in it.
  const exported = await page.request.get(`${BASE}/api/export/catalogue?destination=${destinationId}`);
  const exportBuffer = Buffer.from(await exported.body());
  const exportBook = new ExcelJS.Workbook();
  await exportBook.xlsx.load(exportBuffer);
  const exportSheet = exportBook.getWorksheet("Catalogue");
  const exportHeaders = exportSheet.getRow(1).values.slice(1).map(String);
  const exportCell = (row, h) => String(exportSheet.getRow(row).getCell(exportHeaders.indexOf(h) + 1).value ?? "");
  ok("the export writes the body by name and the fee with its currency",
    exportCell(2, "dsu_body") === "zztmp DSU Feeland" && exportCell(2, "university_application_fee") === "30" && exportCell(2, "university_application_fee_currency") === "GBP",
    `${exportCell(2, "dsu_body")} ${exportCell(2, "university_application_fee")} ${exportCell(2, "university_application_fee_currency")}`);
  const wordedExportRow = Array.from({ length: exportSheet.rowCount }, (_, i) => i + 1).find((r) => exportCell(r, "program_name") === "zztmp Worded Fee");
  ok("...and a fee and a tuition in words exactly as they were written",
    wordedExportRow !== undefined && exportCell(wordedExportRow, "program_application_fee") === "Free for EU students" && exportCell(wordedExportRow, "tuition_fee") === "€3,000 per year",
    wordedExportRow === undefined ? "no row" : `${exportCell(wordedExportRow, "program_application_fee")} / ${exportCell(wordedExportRow, "tuition_fee")}`);
  shown = await preview({ name: "export.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: exportBuffer });
  ok("re-importing the untouched export is a no-op", /Nothing to add or change/.test(shown.text), shown.text.slice(0, 300));

  // Blank cells say nothing; a body from nowhere near is refused.
  shown = await preview(asCsv([{ destination: dest.display_name, university_name: UNI, dsu_body: "zztmp Elsewhere Body" }]));
  ok("a body that does not serve the destination is reported", /does not serve this destination/.test(shown.text), shown.text.slice(0, 400));
  ok("...and with the fee cells blank, nothing changes", /Nothing to add or change/.test(shown.text), shown.text.slice(0, 300));

  // Headers the way people retype them. A filled sheet came back headed
  // "DSU Body" and "Region", and the upload read neither without a word.
  const renamed = {
    name: "renamed.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "destination,University Name,City,Region,DSU Body,Notes\n" +
        `${dest.display_name},zztmp Renamed University,zztmp Town,zztmp Region,zztmp DSU Feeland,anything\n`,
      "utf8"
    ),
  };
  shown = await preview(renamed);
  ok("a column the upload does not read is named in the preview", /column "notes" is not one this upload reads/i.test(shown.text), shown.text.slice(0, 400));
  const renamedApplied = await apply(shown.panel);
  ok("...and the sheet still applies", /Added 1 universit/.test(renamedApplied), renamedApplied.slice(0, 300));
  const { data: renamedUni } = await admin.from("universities").select("region, dsu_body_id").eq("destination_id", destinationId).eq("name", "zztmp Renamed University").maybeSingle();
  ok("headers typed as \"Region\" and \"DSU Body\" reach their columns",
    renamedUni?.region === "zztmp Region" && renamedUni?.dsu_body_id === feelandBody, JSON.stringify(renamedUni));

  // ------------------------------------------------------ adding one by hand
  console.log("\n--- the Add university form ---");
  await page.goto(`${BASE}/setup/universities`, { waitUntil: "domcontentloaded" });
  const addButton = page.getByRole("button", { name: "Add university" });
  await addButton.waitFor({ timeout: 40000 });
  const addForm = page.locator("form").filter({ has: addButton });
  await hydrated(page, 'select[name="dsu_body_id"]');
  const dsuBefore = await addForm.locator('select[name="dsu_body_id"] option').allInnerTexts();
  ok("the DSU picker waits for a destination", dsuBefore.length === 1 && /Choose the destination first/.test(dsuBefore[0]), dsuBefore.join(" | "));
  await addForm.locator('select[name="destination_id"]').selectOption(destinationId);
  ok("choosing the destination sets the fee's currency to the country's", (await addForm.locator('select[name="application_fee_currency"]').inputValue()) === "GBP");
  const dsuAfter = await addForm.locator('select[name="dsu_body_id"] option').allInnerTexts();
  ok("...and offers only that country's DSU bodies, with their region",
    dsuAfter.includes("zztmp DSU Feeland — zztmp") && !dsuAfter.some((o) => o.startsWith("zztmp Elsewhere Body")), dsuAfter.join(" | "));
  await addForm.locator('input[name="name"]').fill("zztmp Form University");
  await addForm.locator('input[name="city"]').fill("zztmp Formtown");
  await addForm.locator('input[name="region"]').fill("zztmp Formregion");
  await addForm.locator('input[name="contact_email"]').fill("admissions@zztmp.example");
  await addForm.locator('input[name="application_fee"]').fill("25");
  await addForm.locator('select[name="dsu_body_id"]').selectOption(feelandBody);
  await addButton.click();
  const formUni = await poll(async () => {
    const { data } = await admin
      .from("universities")
      .select("id, region, contact_email, application_fee, application_fee_currency, dsu_body_id")
      .eq("destination_id", destinationId)
      .eq("name", "zztmp Form University")
      .maybeSingle();
    return data;
  });
  ok("the form adds the university with its fee in the country's currency",
    Number(formUni?.application_fee) === 25 && formUni?.application_fee_currency === "GBP", JSON.stringify(formUni));
  ok("...its DSU body, region and email", formUni?.dsu_body_id === feelandBody && formUni?.region === "zztmp Formregion" && formUni?.contact_email === "admissions@zztmp.example");

  // ---------------------------------------------------------- applications
  console.log("\n--- a new application takes the catalogue's fee ---");
  const studentId = await fx.lead({
    full_name: "zztmp AppFee Student", email: "zztmp-appfee@example.invalid", contact_number: "0300-9999997",
    status: "registered", registration_status: "registered", registered_at: new Date().toISOString(),
    date_of_inquiry: new Date().toISOString().slice(0, 10), country_of_interest: dest.display_name, intake: "Fall 2099",
  });
  const insertApp = async (programId, extra = {}) => {
    const { data, error } = await admin.from("applications").insert({ student_id: studentId, university_id: uni.id, program_id: programId, ...extra })
      .select("id, application_fee, application_fee_currency").single();
    if (error) throw new Error(`application: ${error.message}`);
    return data;
  };
  const inherits = await insertApp(progs["zztmp Inherits"].id);
  ok("a programme with no fee pre-fills the university's, in its currency",
    Number(inherits.application_fee) === 30 && inherits.application_fee_currency === "GBP", JSON.stringify(inherits));
  const own = await insertApp(progs["zztmp Own Fee"].id);
  ok("a programme with its own fee pre-fills that", Number(own.application_fee) === 50 && own.application_fee_currency === "EUR", JSON.stringify(own));
  const typed = await insertApp(progs["zztmp Bad Email"].id, { application_fee: 99 });
  ok("a fee given when the application is made is kept, and given a currency",
    Number(typed.application_fee) === 99 && typed.application_fee_currency === "GBP", JSON.stringify(typed));
  const worded = await insertApp(progs["zztmp Worded Fee"].id);
  ok("a programme whose fee is words pre-fills the words, with a currency",
    worded.application_fee === "Free for EU students" && Boolean(worded.application_fee_currency), JSON.stringify(worded));

  // ------------------------------------------------------------- the page
  console.log("\n--- the university page ---");
  await page.goto(`${BASE}/setup/universities/${uni.id}`, { waitUntil: "domcontentloaded" });
  const dsuSelect = page.locator('select[name="dsu_body_id"]');
  await dsuSelect.waitFor({ timeout: 40000 });
  const bodyOptions = await dsuSelect.locator("option").allInnerTexts();
  ok("the DSU picker offers the country's body, and not one serving elsewhere",
    bodyOptions.includes("zztmp DSU Feeland") && !bodyOptions.includes("zztmp Elsewhere Body"), bodyOptions.join(" | "));
  ok("...with this university's body chosen", (await dsuSelect.inputValue()) === feelandBody);

  const editForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Save changes" }) });
  await hydrated(page, 'select[name="dsu_body_id"]');
  await editForm.locator('input[name="application_fee"]').fill("35");
  await editForm.locator('select[name="application_fee_currency"]').selectOption("EUR");
  await editForm.getByRole("button", { name: "Save changes" }).click();
  const saved = await poll(async () => {
    const { data } = await admin.from("universities").select("application_fee, application_fee_currency, dsu_body_id").eq("id", uni.id).single();
    return Number(data?.application_fee) === 35 && data?.application_fee_currency === "EUR" ? data : null;
  });
  ok("the edit form saves the fee and its currency", Boolean(saved));
  ok("...and keeps the DSU body", saved?.dsu_body_id === feelandBody, JSON.stringify(saved));

  await page.reload({ waitUntil: "domcontentloaded" });
  const rowText = async (name) => (await page.locator("div.py-2", { hasText: name }).first().innerText()).replace(/\s+/g, " ");
  await page.locator("div.py-2", { hasText: "zztmp Own Fee" }).first().waitFor({ timeout: 40000 });
  ok("a programme with no fee shows the university's, and says so",
    /Application fee €35 \(the university's\)/.test(await rowText("zztmp Inherits")), await rowText("zztmp Inherits"));
  ok("a programme with its own fee shows that one", /Application fee €50(?! \()/.test(await rowText("zztmp Own Fee")), await rowText("zztmp Own Fee"));
  ok("...and its coordinator", (await rowText("zztmp Own Fee")).includes("Coordinator own@zztmp.example"));

  // Anything in any field (0304), as the page shows it.
  const foundationRow = page.locator("div.py-2", { hasText: "zztmp Foundation Year" }).first();
  const foundationText = await rowText("zztmp Foundation Year");
  ok("a programme of its own level shows it, and its interview in words",
    foundationText.startsWith("Foundation · zztmp Foundation Year") && foundationText.includes("Interview: Only for non-EU students"), foundationText);
  const mailLinks = await foundationRow.locator('a[href^="mailto:"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  ok("...each of several coordinator emails is a mail link of its own",
    JSON.stringify(mailLinks) === JSON.stringify(["mailto:first@zztmp.example", "mailto:second@zztmp.example"]), JSON.stringify(mailLinks));
  const pageHref = await foundationRow.locator("a", { hasText: "www.zztmp.example/foundation" }).getAttribute("href").catch(() => null);
  ok("...and a link typed without https:// links to https://, not to the portal", pageHref === "https://www.zztmp.example/foundation", String(pageHref));
  // formatFee would make "€Free…" or NaN of words if it still took every fee for a number.
  ok("a fee and a tuition in words are shown exactly as written",
    /Application fee Free for EU students(?! \()/.test(await rowText("zztmp Worded Fee")) && (await rowText("zztmp Worded Fee")).includes("€3,000 per year"),
    await rowText("zztmp Worded Fee"));

  // A programme's own fee, through its edit form.
  const inheritsRow = page.locator("div.py-2", { hasText: "zztmp Inherits" }).first();
  await hydrated(page, 'button[aria-label="Edit program"]');
  await inheritsRow.getByRole("button", { name: "Edit program" }).click();
  const programForm = page.locator("form").filter({ has: page.locator('input[name="coordinator_email"][value="inherits@zztmp.example"]') }).first();
  await programForm.locator('input[name="application_fee"]').fill("20");
  await programForm.locator('select[name="application_fee_currency"]').selectOption("GBP");
  await programForm.getByRole("button", { name: "Save" }).click();
  const programSaved = await poll(async () => {
    const p = (await programmes())["zztmp Inherits"];
    return Number(p?.application_fee) === 20 && p?.application_fee_currency === "GBP" ? p : null;
  });
  ok("a programme's edit form saves a fee of its own", Boolean(programSaved));

  // ...and words, in both the fee and the tuition.
  await page.reload({ waitUntil: "domcontentloaded" });
  await hydrated(page, 'button[aria-label="Edit program"]');
  await page.locator("div.py-2", { hasText: "zztmp Worded Fee" }).first().getByRole("button", { name: "Edit program" }).click();
  const wordedForm = page.locator("form").filter({ has: page.locator('input[name="coordinator_email"][value="worded@zztmp.example"]') }).first();
  await wordedForm.locator('input[name="tuition_fee"]').fill("On request");
  await wordedForm.locator('input[name="application_fee"]').fill("€30 (EU) / €50 (non-EU)");
  // Every field is on the edit form now (0304), and takes anything.
  await wordedForm.locator('input[name="level"]').fill("Research  doctorate (PhD)");
  await wordedForm.locator('input[name="interview_required"]').fill("Online, for non-EU students");
  await wordedForm.locator('input[name="coordinator_email"]').fill("worded@zztmp.example, deputy@zztmp.example");
  await wordedForm.locator('input[name="page_link"]').fill("javascript:alert(1)");
  await wordedForm.locator('input[name="round_application_deadline"]').first().fill("Rolling");
  await wordedForm.getByRole("button", { name: "Save" }).click();
  const wordedSaved = await poll(async () => {
    const p = (await programmes())["zztmp Worded Fee"];
    return p?.tuition_fee === "On request" && p?.application_fee === "€30 (EU) / €50 (non-EU)" ? p : null;
  });
  ok("a programme's edit form saves a fee and a tuition in words", Boolean(wordedSaved), JSON.stringify((await programmes())["zztmp Worded Fee"]));
  ok("...a level of its own, typed in the level box, as written", wordedSaved?.level === "Research doctorate (PhD)", String(wordedSaved?.level));
  ok("...an interview in words, two emails, and a link field holding whatever was typed",
    wordedSaved?.interview_required === "Online, for non-EU students" &&
      wordedSaved?.coordinator_email === "worded@zztmp.example, deputy@zztmp.example" &&
      wordedSaved?.page_link === "javascript:alert(1)",
    JSON.stringify(wordedSaved));
  const { data: wordedRounds } = await admin.from("program_intake_rounds").select("label, application_deadline, deadline_text").eq("program_id", wordedSaved?.id ?? "");
  ok("...and a deadline of Rolling, as words with no date made up for it",
    wordedRounds?.length === 1 && wordedRounds[0].deadline_text === "Rolling" && wordedRounds[0].application_deadline === null, JSON.stringify(wordedRounds));

  await page.reload({ waitUntil: "domcontentloaded" });
  const wordedRow = page.locator("div.py-2", { hasText: "zztmp Worded Fee" }).first();
  await wordedRow.waitFor({ timeout: 40000 });
  const wordedRowText = (await wordedRow.innerText()).replace(/\s+/g, " ");
  ok("the page shows the round's words in place of a date", /apply: Rolling/.test(wordedRowText), wordedRowText);
  ok("a javascript: typed as a link is shown as text and is no link at all",
    wordedRowText.includes("Course page javascript:alert(1)") && (await page.locator('a[href^="javascript"]').count()) === 0, wordedRowText);

  // ------------------------------------------------------- the application
  console.log("\n--- the application page ---");
  await page.goto(`${BASE}/students/${studentId}/applications/${own.id}`, { waitUntil: "domcontentloaded" });
  const coordinator = page.locator("[data-coordinator-email]");
  await coordinator.waitFor({ timeout: 40000 });
  ok("the application shows the programme coordinator", (await coordinator.innerText()).includes("own@zztmp.example"), await coordinator.innerText());
  const hint = page.locator("[data-catalogue-fee]");
  ok("...and the catalogue's fee for its programme", (await hint.innerText()).includes("The catalogue says €50."), await hint.innerText());
  ok("...beside the fee it was given", (await page.locator('input[name="application_fee"]').inputValue()) === "50");

  // The application's own fee, in words, through its form.
  await hydrated(page, 'input[name="application_fee"]');
  await page.locator('input[name="application_fee"]').fill("Waived for HMARK students");
  await page.locator("form").filter({ has: page.locator('input[name="application_fee"]') }).getByRole("button", { name: "Save" }).click();
  const appSaved = await poll(async () => {
    const { data } = await admin.from("applications").select("application_fee").eq("id", own.id).single();
    return data?.application_fee === "Waived for HMARK students" ? data : null;
  });
  ok("an application's own fee can be words too", Boolean(appSaved));

  // An application whose programme's fee is words: its own fee as copied,
  // and the catalogue's as it now reads.
  await page.goto(`${BASE}/students/${studentId}/applications/${worded.id}`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-catalogue-fee]").waitFor({ timeout: 40000 });
  const wordedHint = await page.locator("[data-catalogue-fee]").innerText();
  ok("an application shows a catalogue fee in words as written", wordedHint.includes("The catalogue says €30 (EU) / €50 (non-EU)."), wordedHint);
  ok("...beside the words it was given", (await page.locator('input[name="application_fee"]').inputValue()) === "Free for EU students");

  // -------------------------------------------------------- scholarship tab
  console.log("\n--- the Scholarship tab ---");
  await admin.from("applications").update({ is_finalized: true }).eq("id", own.id);
  // A note in the body's link field (0304). The guide card made a hostname of
  // it with new URL(), which throws on words and took the whole tab down —
  // so the tab rendering at all is the assertion below.
  await admin.from("scholarship_bodies").update({ source_url: "see the regional page" }).eq("id", feelandBody);
  await page.goto(`${BASE}/students/${studentId}/scholarship`, { waitUntil: "domcontentloaded" });
  const named = await poll(async () => {
    const text = (await page.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ");
    return /Its scholarship body is zztmp DSU Feeland/.test(text) ? text : null;
  }, 40);
  ok("the Scholarship tab names the university's DSU body, which no name-matching would find", Boolean(named),
    (await page.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 400));

} catch (e) {
  ok(`the check itself stopped: ${e?.stack ?? e}`, false);
} finally {
  await browser?.close().catch(() => {});
  const removed = await fx.cleanup();
  if (destinationId) await admin.from("destinations").delete().eq("id", destinationId);
  for (const id of bodyIds) await admin.from("scholarship_bodies").delete().eq("id", id);
  process.exitCode = finish(removed + (destinationId ? 1 : 0) + bodyIds.length) === 0 ? 0 : 1;
}
