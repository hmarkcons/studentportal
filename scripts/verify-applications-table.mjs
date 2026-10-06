// The staff's applications table, end to end against a deployed portal:
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:apptable
//
//   * a student's Applications tab is a table: an offer at the top, green; a
//     rejection at the bottom, red; each stage a colour of its own;
//   * a cell saves where it stands — the stage (Rejected sends the row to the
//     bottom), the intake, the programme (a duplicate is refused, said, and
//     put back), the round (whose deadline the Deadline cell then shows), a
//     remark (kept apart from the application, staff-only);
//   * finalising one application locks Finalize on the others, and undoing it
//     frees them;
//   * the priority arrows reorder the student's applications;
//   * a Super Admin edits a programme's link from the table; processing staff
//     are offered no pencil for it, and can still change a stage;
//   * the all-applications page filters by group, and a Super Admin's column
//     order is what both screens and the Excel export show;
//   * the export is the table: its order, its columns, rejections tinted red.
//
// Fixtures are named zztmp and removed in a finally, and the column order on
// file before the run is put back.
import ExcelJS from "exceljs";
import { BASE, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:apptable");

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const STUDENT = "zztmp Apptable Student";
const UNI = "zztmp Apptable University";

/** Polls until `fn` returns something truthy, or gives up after `seconds`. */
async function poll(fn, seconds = 30) {
  const until = Date.now() + seconds * 1000;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v || Date.now() > until) return v;
    await new Promise((r) => setTimeout(r, 300));
  }
}

const hydrated = (page, selector) =>
  page.waitForFunction((s) => {
    const el = document.querySelector(s);
    return Boolean(el && Object.keys(el).some((k) => k.startsWith("__reactProps")));
  }, selector, { timeout: 60000 });

const shot = async (page, name) => {
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/${name}.png`, fullPage: false });
};

let browser = null;
let universityId = null;
let savedOrder = undefined;

try {
  const { data: before } = await admin.from("list_column_orders").select("list_key, column_keys, updated_by, updated_at").eq("list_key", "applications").maybeSingle();
  savedOrder = before ?? null;

  const sup = await fx.staff("apptablesuper", ["super_admin"]);
  const proc = await fx.staff("apptableproc", ["processing"]);

  const { data: italy } = await admin.from("destinations").select("id, display_name, pipeline_stages").eq("display_name", "Italy (Public)").single();
  const acceptance = italy.pipeline_stages.find((s) => /acceptance/.test(s));
  if (!acceptance) throw new Error(`Italy (Public)'s pipeline has no acceptance stage: ${italy.pipeline_stages.join(", ")}`);

  const studentId = await fx.lead({
    full_name: STUDENT, email: "zztmp-apptable@example.invalid", contact_number: "0300-9999971",
    status: "registered", registration_status: "registered", registered_at: new Date().toISOString(),
    date_of_inquiry: new Date().toISOString().slice(0, 10), processing_officer_id: proc.id,
    date_of_birth: "2002-04-17", address: "12 Test Street, Karachi", intake: "Fall 2099", level_applying_for: "masters",
    country_of_interest: italy.display_name,
  });
  await admin.from("lead_destinations").insert({ lead_id: studentId, destination_id: italy.id, is_backup: false });

  const { data: uni, error: uniError } = await admin.from("universities")
    .insert({ destination_id: italy.id, name: UNI, short_name: "zztmp Apptable U", city: "zztmp City", type: "public" })
    .select("id").single();
  if (uniError) throw new Error(`university: ${uniError.message}`);
  universityId = uni.id;
  const { data: progs, error: progError } = await admin.from("programs").insert(
    ["A", "B", "C", "D"].map((x) => ({ university_id: uni.id, level: "masters", name: `zztmp Apptable Programme ${x}` }))
  ).select("id, name");
  if (progError) throw new Error(`programmes: ${progError.message}`);
  const prog = Object.fromEntries(progs.map((p) => [p.name.slice(-1), p.id]));
  const { data: round, error: roundError } = await admin.from("program_intake_rounds")
    .insert({ program_id: prog.A, label: "zztmp Round 1", application_deadline: "2099-01-15", sort_order: 1 })
    .select("id").single();
  if (roundError) throw new Error(`round: ${roundError.message}`);

  // One at a time, so each has its own creation time and the order is certain.
  const app = {};
  for (const [key, row] of [
    ["review", { program_id: prog.A, current_stage: "under_review" }],
    ["offer", { program_id: prog.B, current_stage: acceptance }],
    ["docs", { program_id: null, current_stage: "documents_pending" }],
    ["submitted", { program_id: prog.D, current_stage: "application_submitted" }],
  ]) {
    const { data, error } = await admin.from("applications").insert({ student_id: studentId, university_id: uni.id, intake: "Fall 2099", ...row }).select("id").single();
    if (error) throw new Error(`application ${key}: ${error.message}`);
    app[key] = data.id;
  }
  const read = async (id) => (await admin.from("applications").select("*").eq("id", id).single()).data;

  browser = await openBrowser();
  const page = await signIn(browser, sup.email);
  await page.setViewportSize({ width: 1600, height: 1000 });
  page.on("dialog", (d) => d.accept());

  const tab = `${BASE}/students/${studentId}/applications`;
  const rowOf = (p, id) => p.locator("tbody tr[data-row]", { has: p.locator(`a[href$="/applications/${id}"]`) });
  const tones = (p) => p.locator("[data-applications-table] tbody tr[data-row]").evaluateAll((trs) => trs.map((tr) => tr.getAttribute("data-tone")));
  const rowIds = (p) =>
    p.locator("[data-applications-table] tbody tr[data-row]").evaluateAll((trs) =>
      trs.map((tr) => tr.querySelector('a[href*="/applications/"]')?.getAttribute("href")?.split("/").pop())
    );
  const bg = (locator) => locator.evaluate((el) => getComputedStyle(el).backgroundColor);
  const rgb = (s) => (s.match(/[\d.]+/g) ?? []).map(Number);

  // ------------------------------------------------------------ the tab
  console.log("\n--- a student's Applications tab ---");
  await page.goto(tab, { waitUntil: "domcontentloaded" });
  await page.locator("[data-applications-table='student'] tbody tr[data-row]").first().waitFor({ timeout: 120000 });
  await hydrated(page, "[data-stage-cell] button");
  await shot(page, "1-student-tab");
  ok("the tab is a table, a row an application", (await page.locator("[data-applications-table='student'] tbody tr[data-row]").count()) === 4);
  ok("no card list is left beside it", (await page.getByText(/^Application #\d/).count()) === 0);
  ok("the offer is first, and green", (await rowIds(page))[0] === app.offer && (await tones(page))[0] === "accepted", JSON.stringify(await tones(page)));
  const offerHue = await rowOf(page, app.offer).locator("[data-stage-cell]").getAttribute("data-hue");
  const reviewHue = await rowOf(page, app.review).locator("[data-stage-cell]").getAttribute("data-hue");
  const docsHue = await rowOf(page, app.docs).locator("[data-stage-cell]").getAttribute("data-hue");
  ok("each kind of stage has its own colour", new Set([offerHue, reviewHue, docsHue]).size === 3, `${offerHue} ${reviewHue} ${docsHue}`);
  const offerPill = await bg(rowOf(page, app.offer).locator("[data-stage-cell] button"));
  const reviewPill = await bg(rowOf(page, app.review).locator("[data-stage-cell] button"));
  ok("...painted, not only named", offerPill !== reviewPill && offerPill !== "rgba(0, 0, 0, 0)", `${offerPill} / ${reviewPill}`);
  ok("an application with no programme asks for one", (await rowOf(page, app.docs).getByText("Choose a programme").count()) === 1);

  // ------------------------------------------------------------ priority
  console.log("\n--- priority ---");
  const progressBefore = (await rowIds(page)).filter((id) => id !== app.offer);
  const firstProgress = progressBefore[0];
  await rowOf(page, firstProgress).getByRole("button", { name: /^Move .* down$/ }).click();
  const swapped = await poll(async () => {
    const { data } = await admin.from("applications").select("id, sort_order").eq("student_id", studentId);
    const at = (id) => data.find((a) => a.id === id)?.sort_order ?? null;
    return at(firstProgress) !== null && at(progressBefore[1]) !== null && at(firstProgress) > at(progressBefore[1]) ? data : null;
  });
  ok("a move down saves the new priority", Boolean(swapped), JSON.stringify(swapped));
  ok("...and the row moves on the page", (await poll(async () => ((await rowIds(page)).indexOf(firstProgress) === 2 ? true : null), 10)) === true, JSON.stringify(await rowIds(page)));

  // ------------------------------------------------------------ stage
  console.log("\n--- the stage ---");
  await rowOf(page, app.review).locator("[data-stage-cell] button").click();
  const stageSelect = rowOf(page, app.review).locator("[data-stage-cell] select");
  const offered = await stageSelect.locator("option").evaluateAll((os) => os.map((o) => o.value));
  ok("the stage list offers Rejected, Not eligible and Withdrawn", ["rejected", "declined", "withdrawn"].every((s) => offered.includes(s)), offered.join(","));
  ok("...and not Pre-Enrolled, which finalising sets", !offered.includes("pre_enrolled"));
  await stageSelect.selectOption("rejected");
  const rejected = await poll(async () => ((await read(app.review))?.current_stage === "rejected" ? true : null));
  ok("Rejected is saved", rejected === true);
  const sank = await poll(async () => {
    const ids = await rowIds(page);
    return ids.at(-1) === app.review ? ids : null;
  }, 15);
  ok("...and the row sinks to the bottom", Boolean(sank), JSON.stringify(await rowIds(page)));
  const redRow = rgb(await bg(rowOf(page, app.review).locator("td").nth(2)));
  ok("...tinted red", (await rowOf(page, app.review).getAttribute("data-tone")) === "rejected" && redRow[0] > redRow[1] && redRow[0] > redRow[2], JSON.stringify(redRow));
  await shot(page, "2-rejected");

  // ------------------------------------------------------------ intake, programme, round
  console.log("\n--- typed and chosen cells ---");
  await rowOf(page, app.docs).locator('[data-edit-cell="Intake"]').click();
  await rowOf(page, app.docs).locator('input[aria-label="Intake"]').fill("zztmp Spring 2100");
  await rowOf(page, app.docs).locator('input[aria-label="Intake"]').press("Enter");
  ok("the intake saves from its cell", (await poll(async () => ((await read(app.docs))?.intake === "zztmp Spring 2100" ? true : null))) === true);

  // Programme A is already this student's at this university, in no round: refused.
  await rowOf(page, app.docs).locator('[data-choice-cell="Programme"]').click();
  await rowOf(page, app.docs).locator('select[aria-label="Programme"]').selectOption(prog.A);
  const refusal = await page.locator('[data-toast="danger"]').filter({ hasText: /already has that programme/ }).first().waitFor({ timeout: 20000 }).then(() => true, () => false);
  ok("a duplicate programme is refused, and the refusal said", refusal);
  ok("...nothing saved", (await read(app.docs))?.program_id === null);
  ok("...and the cell put back", (await poll(async () => ((await rowOf(page, app.docs).getByText("Choose a programme").count()) === 1 ? true : null), 10)) === true);
  await page.locator('[data-toast="danger"]').first().waitFor({ state: "detached", timeout: 15000 }).catch(() => {});

  await rowOf(page, app.docs).locator('[data-choice-cell="Programme"]').click();
  await rowOf(page, app.docs).locator('select[aria-label="Programme"]').selectOption(prog.C);
  ok("another programme saves", (await poll(async () => ((await read(app.docs))?.program_id === prog.C ? true : null))) === true);

  // The rejected row's programme A has a round.
  await rowOf(page, app.review).locator('[data-choice-cell="Round"]').click();
  await rowOf(page, app.review).locator('select[aria-label="Round"]').selectOption(round.id);
  ok("the round saves", (await poll(async () => ((await read(app.review))?.round_id === round.id ? true : null))) === true);
  const roundDeadline = await poll(async () => {
    const text = await rowOf(page, app.review).locator("[data-deadline]").first().innerText().catch(() => "");
    return /2099/.test(text) && /round/.test(text) ? text : null;
  }, 20);
  ok("...and Deadline shows the round's date, saying where it is from", Boolean(roundDeadline), roundDeadline ?? "");

  // ------------------------------------------------------------ remark
  console.log("\n--- a remark ---");
  await rowOf(page, app.offer).locator("[data-remark-add]").click();
  const dialog = page.locator(`[data-remark-dialog="${app.offer}"]`);
  await dialog.locator("[data-remark-input]").fill("zztmp Waiting on the bank letter");
  await dialog.getByRole("button", { name: "Save remark" }).click();
  const remark = await poll(async () => (await admin.from("application_remark_current").select("body").eq("application_id", app.offer).maybeSingle()).data?.body);
  ok("a remark is saved against the application", remark === "zztmp Waiting on the bank letter", String(remark));
  const appColumns = Object.keys((await read(app.offer)) ?? {});
  ok("...not on the application, which the student can read", !appColumns.some((c) => /remark/.test(c)), appColumns.join(","));
  await page.keyboard.press("Escape");

  // ------------------------------------------------------------ finalising
  console.log("\n--- finalising ---");
  await rowOf(page, app.offer).locator("[data-finalize]").click();
  ok("Finalize saves", (await poll(async () => ((await read(app.offer))?.is_finalized ? true : null))) === true);
  const locked = await poll(async () => ((await page.locator("[data-finalize]").count()) === 0 && (await rowOf(page, app.offer).locator("[data-finalized]").count()) === 1 ? true : null), 20);
  ok("...the others' Finalize is locked while it stands", locked === true);
  await shot(page, "3-finalized");
  await rowOf(page, app.offer).locator("[data-finalized] button").click();
  ok("Undo un-finalises it", (await poll(async () => ((await read(app.offer))?.is_finalized === false ? true : null))) === true);
  ok("...and frees the others", (await poll(async () => ((await page.locator("[data-finalize]").count()) >= 3 ? true : null), 20)) === true);

  // ------------------------------------------------------------ catalogue links
  console.log("\n--- a programme's link ---");
  await rowOf(page, app.offer).locator('[data-edit-cell="Programme page"]').click();
  await rowOf(page, app.offer).locator('input[aria-label="Programme page"]').fill("zztmp.example/apptable");
  await rowOf(page, app.offer).locator('input[aria-label="Programme page"]').press("Enter");
  const link = await poll(async () => (await admin.from("programs").select("page_link").eq("id", prog.B).single()).data?.page_link);
  ok("a Super Admin changes a programme's page link from the table", link === "zztmp.example/apptable", String(link));

  const procPage = await signIn(browser, proc.email);
  await procPage.setViewportSize({ width: 1600, height: 1000 });
  await procPage.goto(tab, { waitUntil: "domcontentloaded" });
  await procPage.locator("[data-applications-table='student'] tbody tr[data-row]").first().waitFor({ timeout: 120000 });
  await hydrated(procPage, "[data-stage-cell] button");
  ok("processing staff are offered no pencil for a programme's link", (await procPage.locator('[data-edit-cell="Programme page"]').count()) === 0);
  ok("...but are for the application's own cells", (await procPage.locator('[data-edit-cell="Intake"]').count()) === 4);
  await rowOf(procPage, app.submitted).locator("[data-stage-cell] button").click();
  await rowOf(procPage, app.submitted).locator("[data-stage-cell] select").selectOption("under_review");
  ok("...and can change a stage", (await poll(async () => ((await read(app.submitted))?.current_stage === "under_review" ? true : null))) === true);
  await procPage.close();

  // ------------------------------------------------------------ the all-applications page
  console.log("\n--- the Applications page ---");
  await page.goto(`${BASE}/applications`, { waitUntil: "domcontentloaded" });
  const all = page.locator("[data-applications-table='all']");
  await all.locator("tbody tr[data-row]").first().waitFor({ timeout: 120000 });
  await hydrated(page, "[data-group-chip='rejected']");
  await all.locator('input[placeholder^="Search"]').fill(STUDENT);
  ok("the page lists the student's applications", (await poll(async () => ((await all.locator("tbody tr[data-row]").count()) === 4 ? true : null), 15)) === true);
  await shot(page, "4-all-page");
  await page.locator("[data-group-chip='rejected']").click();
  const onlyRejected = await poll(async () => {
    const t = await tones(page);
    return t.length === 1 && t[0] === "rejected" ? t : null;
  }, 10);
  ok("the Rejected chip shows only the rejections", Boolean(onlyRejected), JSON.stringify(await tones(page)));
  await page.locator("[data-group-chip='rejected']").click();

  // ------------------------------------------------------------ arranging the columns
  console.log("\n--- arranging the columns ---");
  await page.locator("[data-arrange-columns]").click();
  const arrange = page.locator("[data-arrange-dialog]");
  await arrange.waitFor();
  const firstBefore = await arrange.locator("[data-arrange-item]").first().getAttribute("data-arrange-item");
  for (let i = 0; i < 30; i++) {
    const up = arrange.getByRole("button", { name: "Move Stage up" });
    if (await up.isDisabled()) break;
    await up.click();
  }
  await arrange.getByRole("button", { name: "Save order" }).click();
  const order = await poll(async () => {
    const { data } = await admin.from("list_column_orders").select("column_keys").eq("list_key", "applications").maybeSingle();
    return data?.column_keys?.[0] === "stage" ? data.column_keys : null;
  });
  ok("a Super Admin's column order is saved", Boolean(order), `${firstBefore} → ${JSON.stringify(order)}`);
  ok("...and the page shows Stage first", (await poll(async () => {
    const heads = await all.locator("thead th").allInnerTexts();
    return heads[1]?.trim().toLowerCase() === "stage" ? true : null;
  }, 20)) === true, JSON.stringify(await all.locator("thead th").allInnerTexts()));
  await page.goto(tab, { waitUntil: "domcontentloaded" });
  await page.locator("[data-applications-table='student'] thead th").nth(1).waitFor({ timeout: 60000 });
  ok("...and so does the student's tab", (await page.locator("[data-applications-table='student'] thead th").nth(1).innerText()).trim().toLowerCase() === "stage");

  // ------------------------------------------------------------ export
  console.log("\n--- the Excel export ---");
  const response = await page.request.get(`${BASE}/api/export/applications?student=${studentId}`);
  ok("the export downloads", response.ok() && /spreadsheetml/.test(response.headers()["content-type"] ?? ""), String(response.status()));
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await response.body());
  const sheet = book.getWorksheet("Applications");
  const headers = sheet.getRow(1).values.slice(1).map(String);
  ok("its columns are in the arranged order", headers[0] === "Stage" && headers.includes("University") && !headers.includes("Student"), headers.join(", "));
  const uniCol = headers.indexOf("Programme") + 1;
  const programmes = [2, 3, 4, 5].map((n) => String(sheet.getRow(n).getCell(uniCol).value ?? ""));
  ok("its rows are the table's: the offer first", programmes[0] === "zztmp Apptable Programme B", programmes.join(" | "));
  ok("...the rejection last", programmes[3] === "zztmp Apptable Programme A", programmes.join(" | "));
  const fill = (n) => sheet.getRow(n).getCell(1).fill?.fgColor?.argb ?? "";
  ok("...tinted as on screen", /FDE7E7/i.test(fill(5)) && /E7F6EC/i.test(fill(2)), `${fill(2)} / ${fill(5)}`);
} finally {
  await browser?.close().catch(() => {});
  // The column order as it was.
  if (savedOrder === null) await admin.from("list_column_orders").delete().eq("list_key", "applications");
  else if (savedOrder) await admin.from("list_column_orders").upsert(savedOrder);
  if (universityId) {
    await admin.from("applications").delete().eq("university_id", universityId);
    await admin.from("universities").delete().eq("id", universityId);
  }
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
