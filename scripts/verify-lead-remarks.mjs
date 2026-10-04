// The Remarks column on the leads list (0306, 0307), end to end against a
// deployed portal.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:leadremarks
//
//   the column    sits right before Follow-up; a long remark is cut short on
//                 one line, and opens whole in a pop-up on a click.
//   editing       the pop-up edits it: the new words show at once, the old
//                 ones are kept as an earlier version with who wrote them, and
//                 the database holds both. A lead with none offers "+ Add
//                 remark", straight into the box. The list's search finds a
//                 lead by its remark. The lead's own page shows the same
//                 remark and its history.
//   import        a "remarks" column in the leads import becomes the new
//                 lead's first remark, under the importer's name.
//   new lead      the New lead form's Remarks box does the same for a lead
//                 added by hand, shown on its page the moment it opens.
//   who          its counsellor and Marketing (who can open any lead) may
//                 read and write it; a counsellor who is not its own may do
//                 neither; the student it is about cannot read it at all — not
//                 even through their own access to their lead; and nobody can
//                 write the current remark except by adding a version.
//
// Everything is named zztmp and removed in a finally.
import { BASE, apiAs, clients, fixtures, FIXTURE_PASSWORD, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";
import { orderedLeadColumns } from "../src/lib/leadSheet.ts";

requireConfirmation("check:leadremarks");

const { admin, url, anonKey } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const karachiToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
const IMPORTED = "zztmp Remarks Imported";
const BY_FORM = "zztmp Remarks NewForm";
const STUDENT_EMAIL = "zztmp-remarks-student@hmark-test.local";

async function poll(fn, seconds = 30) {
  for (let i = 0; i < seconds; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

let browser = null;
let studentUserId = null;

try {
  const counsellor = await fx.staff("remarksown", ["counselor"]);
  const otherCounsellor = await fx.staff("remarksother", ["counselor"]);
  const marketing = await fx.staff("remarksmkt", ["marketing"]);
  const lead = (name, phone, extra = {}) =>
    fx.lead({ full_name: name, contact_number: phone, status: "potential", date_of_inquiry: karachiToday(), assigned_counselor_id: counsellor.id, ...extra });
  const longId = await lead("zztmp Remarks Long", "0300-9999971");
  const emptyId = await lead("zztmp Remarks Empty", "0300-9999972");

  // The student the long remark is about, with a portal login of their own.
  const { data: su, error: suError } = await admin.auth.admin.createUser({ email: STUDENT_EMAIL, password: FIXTURE_PASSWORD, email_confirm: true });
  if (suError) throw new Error(`student login: ${suError.message}`);
  studentUserId = su.user.id;
  await admin.from("leads").update({ auth_user_id: studentUserId }).eq("id", longId);

  const LONG =
    "zztmp Wants a master's in Italy, preferably Milan or Pavia; budget is tight so only public universities. " +
    "Father decides — call him after 6 pm. Has IELTS 6.5, wants to start in Fall 2027. Asked twice about scholarships.";
  const asOwn = await apiAs(url, anonKey, counsellor.email);
  const { error: firstError } = await asOwn.from("lead_remarks").insert({ lead_id: longId, body: LONG, written_by: counsellor.id });
  if (firstError) throw new Error(`first remark: ${firstError.message}`);

  const versions = async (id) => (await admin.from("lead_remarks").select("body, written_by").eq("lead_id", id).order("created_at")).data ?? [];
  const current = async (id) => (await admin.from("lead_remark_current").select("body, updated_by").eq("lead_id", id).maybeSingle()).data;

  browser = await openBrowser();
  let page = await signIn(browser, counsellor.email);
  await page.setViewportSize({ width: 1400, height: 900 });

  // ------------------------------------------------------------ the column
  console.log("\n--- the column ---");
  const openList = async (query) => {
    await page.goto(`${BASE}/leads`, { waitUntil: "domcontentloaded" });
    const search = page.getByPlaceholder("Search name, contact, course, remarks…");
    await search.waitFor({ timeout: 60000 });
    await page.waitForFunction(() => {
      const i = document.querySelector('input[placeholder="Search name, contact, course, remarks…"]');
      return Boolean(i && Object.keys(i).some((k) => k.startsWith("__reactProps")));
    }, null, { timeout: 30000 });
    await search.fill(query);
    // The list is searched by the server: wait for the search to reach the
    // address, and the page it asked for to arrive, before reading the rows.
    await page.waitForURL((u) => u.searchParams.get("q") === query, { timeout: 30000 });
    await page.waitForFunction(() => !document.querySelector("[aria-busy]"), null, { timeout: 30000 });
  };
  await openList("zztmp Remarks");
  const longCell = page.locator(`[data-remark-cell="${longId}"]`);
  await longCell.waitFor({ timeout: 30000 });
  // Upper-cased by the stylesheet, so compared without case.
  const headers = (await page.locator("thead th").allInnerTexts()).map((h) => h.trim().toLowerCase());
  // Where it sits is a Super Admin's to arrange (0313), so the list is held to
  // the arranged order rather than to one place.
  const { data: savedOrder } = await admin.from("list_column_orders").select("column_keys").eq("list_key", "leads").maybeSingle();
  const arranged = orderedLeadColumns(savedOrder?.column_keys).map((c) => c.key);
  const remarksBeforeFollowUp = arranged.indexOf("remarks") < arranged.indexOf("follow_up_date");
  ok(
    "Remarks is a column of the list, where the arranged order puts it",
    headers.indexOf("remarks") !== -1 && headers.indexOf("remarks") < headers.indexOf("follow-up") === remarksBeforeFollowUp,
    headers.join(" | ")
  );
  const shortened = await longCell.locator("[data-remark-text]").evaluate((el) => el.scrollWidth > el.clientWidth);
  ok("a long remark is cut short on one line", shortened);

  await longCell.locator("[data-remark-text]").click();
  const dialog = page.locator(`[data-remark-dialog="${longId}"]`);
  await dialog.waitFor({ timeout: 30000 });
  ok("a click opens it whole in a pop-up", (await dialog.locator("[data-remark-full]").innerText()) === LONG);
  ok("...saying who last edited it", /Last edited by zztmp remarksown/.test(await dialog.locator("[data-remark-meta]").innerText()));

  // ----------------------------------------------------------- editing
  console.log("\n--- editing ---");
  const EDITED = "zztmp Decided on Pavia — zztmpkeyword7731. Call the father on Friday.";
  await dialog.getByRole("button", { name: "Edit remark" }).click();
  await dialog.locator("[data-remark-input]").fill(EDITED);
  await dialog.getByRole("button", { name: "Save remark" }).click();
  await poll(async () => (await dialog.locator("[data-remark-full]").innerText().catch(() => "")) === EDITED, 30);
  ok("the edit shows at once", (await dialog.locator("[data-remark-full]").innerText().catch(() => "")) === EDITED);
  const kept = await poll(async () => {
    const v = await versions(longId);
    return v.length === 2 ? v : null;
  });
  ok("...and the database keeps both versions, each under who wrote it",
    kept?.[0].body === LONG && kept?.[1].body === EDITED && kept.every((v) => v.written_by === counsellor.id), JSON.stringify(kept));
  ok("...the current one being the edit", (await current(longId))?.body === EDITED);
  await dialog.getByRole("button", { name: /Show earlier versions \(1\)/ }).click();
  const history = (await dialog.locator("[data-remark-history]").innerText()).replace(/\s+/g, " ");
  ok("the earlier version is in the pop-up, with who wrote it", history.includes(LONG.slice(0, 60)) && history.includes("zztmp remarksown"), history.slice(0, 200));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("dialog[open]"), null, { timeout: 10000 }).catch(() => {});
  ok("closed, the cell shows the new remark", (await longCell.locator("[data-remark-text]").innerText()).startsWith("zztmp Decided on Pavia"));

  const emptyCell = page.locator(`[data-remark-cell="${emptyId}"]`);
  await emptyCell.locator("[data-remark-add]").click();
  const addDialog = page.locator(`[data-remark-dialog="${emptyId}"]`);
  await addDialog.locator("[data-remark-input]").waitFor({ timeout: 30000 });
  ok("a lead with no remark offers one, straight into the box", await addDialog.locator("[data-remark-input]").isVisible());
  await addDialog.locator("[data-remark-input]").fill("zztmp Short one");
  await addDialog.getByRole("button", { name: "Save remark" }).click();
  ok("...and saves it", Boolean(await poll(async () => (await current(emptyId))?.body === "zztmp Short one")));
  await page.keyboard.press("Escape");

  await openList("zztmpkeyword7731");
  await page.locator(`[data-remark-cell="${longId}"]`).waitFor({ timeout: 30000 }).catch(() => {});
  ok("the list's search finds a lead by its remark",
    (await page.locator(`[data-remark-cell="${longId}"]`).count()) === 1 && (await page.locator(`[data-remark-cell="${emptyId}"]`).count()) === 0);

  await page.goto(`${BASE}/leads/${longId}`, { waitUntil: "domcontentloaded" });
  const card = page.locator(`[data-remark-editor="${longId}"]`);
  await card.waitFor({ timeout: 60000 });
  ok("the lead's own page shows the same remark", (await card.locator("[data-remark-full]").innerText()) === EDITED);
  await card.getByRole("button", { name: /Show earlier versions/ }).click();
  ok("...and its history", (await card.locator("[data-remark-history]").innerText()).includes(LONG.slice(0, 60)));

  // ------------------------------------------------------------ the import
  console.log("\n--- the import ---");
  await page.close();
  page = await signIn(browser, marketing.email);
  await page.goto(`${BASE}/leads`, { waitUntil: "domcontentloaded" });
  const importPanel = page.locator("details", { hasText: "Import leads from Excel" });
  await importPanel.waitFor({ timeout: 60000 });
  await importPanel.locator("summary").click();
  // The Import button wakes only once React has seen the file chosen.
  await page.waitForFunction(() => {
    const input = document.querySelector('details input[type="file"]');
    return Boolean(input && Object.keys(input).some((k) => k.startsWith("__reactProps")));
  }, null, { timeout: 30000 });
  const csv = `full_name,contact_number,remarks\n${IMPORTED},0300-9999973,"zztmp From the fair, wants Germany"\n`;
  await importPanel.locator('input[type="file"]').setInputFiles({ name: "leads.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
  await importPanel.getByRole("button", { name: "Import", exact: true }).click();
  const imported = await poll(async () => {
    const { data } = await admin.from("leads").select("id").eq("full_name", IMPORTED).maybeSingle();
    if (!data) return null;
    const c = await current(data.id);
    return c ? { id: data.id, ...c } : null;
  }, 60);
  ok("a remarks column in the import becomes the new lead's first remark, under the importer's name",
    imported?.body === "zztmp From the fair, wants Germany" && imported?.updated_by === marketing.id, JSON.stringify(imported));

  // -------------------------------------------------------- the new lead form
  console.log("\n--- the new lead form ---");
  await page.goto(`${BASE}/leads/new`, { waitUntil: "domcontentloaded" });
  const nameBox = page.locator('input[name="full_name"]');
  await nameBox.waitFor({ timeout: 60000 });
  await page.waitForFunction(() => {
    const t = document.querySelector('textarea[name="remarks"]');
    return Boolean(t && Object.keys(t).some((k) => k.startsWith("__reactProps")));
  }, null, { timeout: 30000 });
  const TYPED = "zztmp Walk-in, asked about Hungary\nWill bring transcripts Monday";
  await nameBox.fill(BY_FORM);
  await page.locator('textarea[name="remarks"]').fill(TYPED);
  await page.getByRole("button", { name: "Create lead" }).click();
  await page.waitForURL(/\/leads\/[0-9a-f-]{36}$/, { timeout: 60000 });
  const newId = page.url().split("/").pop();
  const newCard = page.locator(`[data-remark-editor="${newId}"]`);
  await newCard.waitFor({ timeout: 60000 });
  ok("a remark typed in the New lead form is on the lead's page the moment it opens, line break and all",
    (await newCard.locator("[data-remark-full]").innerText()) === TYPED, await newCard.innerText());
  const byForm = await current(newId);
  ok("...kept as its first version, under whoever added the lead",
    byForm?.updated_by === marketing.id && (await versions(newId)).length === 1, JSON.stringify(byForm));

  // ---------------------------------------------------------------- who
  console.log("\n--- who ---");
  const asOther = await apiAs(url, anonKey, otherCounsellor.email);
  const { data: otherRead } = await asOther.from("lead_remarks").select("body").eq("lead_id", longId);
  const { error: otherWrite } = await asOther.from("lead_remarks").insert({ lead_id: longId, body: "zztmp not mine", written_by: otherCounsellor.id });
  ok("a counsellor who is not the lead's can neither read its remark nor write one", (otherRead ?? []).length === 0 && Boolean(otherWrite));

  const asMarketing = await apiAs(url, anonKey, marketing.email);
  const { error: mktWrite } = await asMarketing.from("lead_remarks").insert({ lead_id: longId, body: "zztmp Marketing note", written_by: marketing.id });
  ok("Marketing, who can open any lead, may add one", !mktWrite, String(mktWrite?.message));

  const { error: spoof } = await asOwn.from("lead_remarks").insert({ lead_id: longId, body: "zztmp in your name", written_by: marketing.id });
  ok("nobody can write a version in somebody else's name", Boolean(spoof));
  const { error: direct } = await asOwn.from("lead_remark_current").upsert({ lead_id: longId, body: "zztmp no version", updated_at: new Date().toISOString() });
  ok("...nor write the current remark except by adding a version", Boolean(direct) || (await current(longId))?.body !== "zztmp no version");

  const asStudent = await apiAs(url, anonKey, STUDENT_EMAIL);
  const { data: ownLead } = await asStudent.from("leads").select("id").eq("id", longId).maybeSingle();
  const { data: studentCurrent } = await asStudent.from("lead_remark_current").select("body").eq("lead_id", longId);
  const { data: studentVersions } = await asStudent.from("lead_remarks").select("body").eq("lead_id", longId);
  ok("the student it is about can see their own lead, but not one word of its remarks",
    Boolean(ownLead) && (studentCurrent ?? []).length === 0 && (studentVersions ?? []).length === 0,
    JSON.stringify({ ownLead: Boolean(ownLead), current: studentCurrent, versions: studentVersions?.length }));
} catch (e) {
  ok(`the check itself stopped: ${e?.stack ?? e}`, false);
} finally {
  await browser?.close().catch(() => {});
  await admin.from("leads").delete().in("full_name", [IMPORTED, BY_FORM]);
  const removed = await fx.cleanup();
  if (studentUserId) await admin.auth.admin.deleteUser(studentUserId).catch(() => {});
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
