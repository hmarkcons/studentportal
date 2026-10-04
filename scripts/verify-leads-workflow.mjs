// The leads list and a lead's page, end to end against a deployed portal:
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:leadswork
//
//   * a new lead starts Unattended (0315, 0316);
//   * rows are one line deep, a cut-short value shows whole on hover and in a
//     pop-up on a click, and no pop-up is sent with a row until it is opened;
//   * Expand opens the table over the whole window, and Escape puts it back;
//   * an inline status change needs no remark, answers without the page — a
//     small answer, not the list rendered again — and is still there after
//     going to the lead and coming Back;
//   * in the dark theme the browser's own controls are dark, so the status
//     dropdown's open list is readable;
//   * on the lead's page a status change needs no remark and the call history
//     says so; a details save shows on the page; "Register this lead" asks for
//     date of birth, address and the emergency contact, and saves them where
//     the Profile tab reads them;
//   * the Register student form asks for the same five, all required;
//   * a counsellor's leads list counts only their own leads (0317).
//
// Fixtures are named zztmp and removed in a finally. The lead registered here
// belongs to a fixture counsellor, so the registration notice goes to nobody
// real; nothing here registers a student through the Register student form,
// which hands the student to a real processing officer.
import { BASE, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:leadswork");

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const NAME = "zztmp leads workflow";
const LONG_COURSE = "Business Administration with a specialisation in International Finance and Accounting, taught in English";
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });

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

let browser = null;

try {
  const sup = await fx.staff("leadswork", ["super_admin"]);
  const cou = await fx.staff("leadsworkcou", ["counselor"]);
  // No status given: the database's default is what is being checked.
  const leadId = await fx.lead({
    full_name: NAME,
    contact_number: "03001234500",
    course_of_interest: LONG_COURSE,
    assigned_counselor_id: cou.id,
    date_of_inquiry: today,
  });

  console.log("\n--- a new lead ---");
  const { data: fresh } = await admin.from("leads").select("status").eq("id", leadId).single();
  ok("a lead added with no status starts Unattended", fresh?.status === "unattended", fresh?.status);

  browser = await openBrowser();
  const page = await signIn(browser, sup.email);
  await page.setViewportSize({ width: 1400, height: 900 });

  // ------------------------------------------------------------ the list
  console.log("\n--- the leads list ---");
  await page.goto(`${BASE}/leads`, { waitUntil: "domcontentloaded" });
  const row = page.locator("tbody tr", { has: page.locator(`[data-remark-cell="${leadId}"]`) });
  await row.waitFor({ timeout: 120000 });
  await hydrated(page, `[data-remark-cell="${leadId}"] button`);
  const statusButton = row.locator("[data-lead-status]");
  ok("...where it says Unattended", (await statusButton.getAttribute("data-lead-status")) === "unattended", await statusButton.innerText());

  const height = await row.evaluate((tr) => Math.round(tr.getBoundingClientRect().height));
  ok("rows are one line deep", height <= 44, `${height}px — the follow-up cell's two lines made a row about 78px`);
  ok("no row carries a pop-up until one is opened", (await page.locator("table dialog").count()) === 0, String(await page.locator("table dialog").count()));

  const course = row.locator("[data-long-text]", { hasText: "Business Administration" });
  // Measured by the cell once it is on screen, so waited for.
  ok("a long value is cut short on its line", Boolean(await poll(async () => (await course.getAttribute("data-cut")) !== null, 10)));
  await course.hover();
  const preview = page.locator("[data-hover-preview]");
  const shown = await poll(async () => (await preview.count()) === 1 && (await preview.innerText()).trim() === LONG_COURSE, 10);
  ok("...and shown whole while the pointer rests on it", Boolean(shown), (await preview.count()) ? await preview.innerText() : "no preview");
  await page.mouse.move(5, 890);
  ok("...gone when it leaves", Boolean(await poll(async () => (await preview.count()) === 0, 5)));
  await course.click();
  const full = page.locator("dialog[open] [data-long-full]");
  ok("...and whole in a pop-up on a click", (await poll(async () => (await full.count()) === 1 && (await full.innerText()).trim() === LONG_COURSE, 10)) === true);
  await page.keyboard.press("Escape");
  await poll(async () => (await page.locator("dialog[open]").count()) === 0, 5);

  // Expand
  await page.locator("[data-expand-table]").click();
  const expanded = page.locator("[data-table-expanded]");
  const box = await poll(async () => ((await expanded.count()) === 1 ? expanded.boundingBox() : null), 5);
  ok("Expand opens the table over the whole window", Boolean(box && box.x === 0 && box.y === 0 && box.width === 1400 && box.height === 900), JSON.stringify(box));
  const covered = await page.evaluate(() => Boolean(document.elementFromPoint(20, 450)?.closest("[data-table-expanded]")));
  ok("...the sidebar under it", covered);
  await page.keyboard.press("Escape");
  ok("...and Escape puts it back", Boolean(await poll(async () => (await expanded.count()) === 0, 5)));

  // Dark theme: the open list of a <select> is drawn by the browser.
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await statusButton.click();
  const select = row.locator('select[name="status"]');
  await select.waitFor();
  const look = await select.evaluate((el) => {
    const s = getComputedStyle(el);
    // The theme's own card and ink, resolved the same way, to compare with.
    const probe = document.createElement("span");
    probe.style.backgroundColor = "var(--card)";
    probe.style.color = "var(--ink)";
    document.body.appendChild(probe);
    const theme = getComputedStyle(probe);
    const out = { scheme: s.colorScheme, bg: s.backgroundColor, color: s.color, card: theme.backgroundColor, ink: theme.color };
    probe.remove();
    return out;
  });
  ok(
    "in the dark theme the browser's controls are dark, so the status list is readable",
    look.scheme === "dark" && look.bg === look.card && look.color === look.ink && look.card !== "rgb(255, 255, 255)",
    JSON.stringify(look)
  );
  await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));

  // An inline status change with no remark, answered without the page.
  console.log("\n--- an inline status change ---");
  await select.selectOption("busy");
  ok("the remark is optional", (await row.locator('input[name="remark"]').getAttribute("required")) === null);
  const started = Date.now();
  const [answer] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/leads"), { timeout: 60000 }),
    row.getByRole("button", { name: "Save", exact: true }).click(),
  ]);
  const bytes = (await answer.body()).length;
  await row.getByText("Saved.").waitFor({ timeout: 30000 });
  const took = Date.now() - started;
  ok("saved with no remark, and the cell says so at once", (await statusButton.getAttribute("data-lead-status")) === "busy", `${took}ms`);
  ok("...in a small answer, not the list rendered again", bytes < 20000, `${bytes} bytes — the list re-rendered was about 86,000`);
  const { data: afterInline } = await admin.from("leads").select("status").eq("id", leadId).single();
  const { data: logs } = await admin.from("lead_call_logs").select("status_at_time, remark").eq("lead_id", leadId);
  ok("...and the database has it, logged with no remark", afterInline?.status === "busy" && logs?.length === 1 && logs[0].remark === null, JSON.stringify({ afterInline, logs }));

  // Back to a list the browser held from before the change.
  await row.locator(`a[href="/leads/${leadId}"]`).click();
  await page.waitForURL(`**/leads/${leadId}`, { timeout: 60000 });
  await page.getByText("Call log & status").waitFor({ timeout: 60000 });
  await page.goBack();
  const backRow = page.locator("tbody tr", { has: page.locator(`[data-remark-cell="${leadId}"]`) });
  const kept = await poll(async () => (await backRow.locator("[data-lead-status]").getAttribute("data-lead-status")) === "busy", 30);
  ok("going Back to the list shows the change, not the list as it was", Boolean(kept), await backRow.locator("[data-lead-status]").getAttribute("data-lead-status").catch(() => "row not found"));

  // ------------------------------------------------------- the lead's page
  console.log("\n--- the lead's page ---");
  await page.goto(`${BASE}/leads/${leadId}`, { waitUntil: "domcontentloaded" });
  await hydrated(page, "[data-register-lead]");
  ok("the call log's remark is optional", (await page.locator('textarea[name="remark"]').getAttribute("required")) === null);
  await page.locator('select[name="status"]').selectOption("call_later");
  await page.getByRole("button", { name: "Update status" }).click();
  await page.getByText("Saved.").first().waitFor({ timeout: 30000 });
  const history = await poll(async () => {
    const text = await page.locator("ol").first().innerText();
    return /Call Later — no remark/.test(text) ? text : null;
  }, 30);
  ok("a status change with no remark shows in the call history as one", Boolean(history), history ?? (await page.locator("ol").first().innerText().catch(() => "")));

  await page.getByRole("button", { name: "Edit details" }).click();
  await page.locator('input[name="course_of_interest"]').fill("zztmp Medicine");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Saved.").first().waitFor({ timeout: 30000 });
  const detailShown = await poll(async () => (await page.locator("dl").first().innerText()).includes("zztmp Medicine"), 30);
  ok("a details save shows on the page behind its Saved.", Boolean(detailShown));

  // Register this lead
  await page.locator("[data-register-lead]").click();
  const form = page.locator("[data-register-lead-form]");
  await form.waitFor({ timeout: 10000 });
  const fields = ["date_of_birth", "address", "emergency_contact_name", "emergency_contact_relation", "emergency_contact_number"];
  const required = await Promise.all(fields.map((f) => form.locator(`[name="${f}"]`).getAttribute("required")));
  ok("Register this lead asks for date of birth, address and the emergency contact, all required", required.every((r) => r !== null), JSON.stringify(required));
  await form.locator('[name="date_of_birth"]').fill("2004-02-10");
  await form.locator('[name="address"]').fill("zztmp 12 Garden Road, Karachi");
  await form.locator('[name="emergency_contact_name"]').fill("zztmp Parent");
  await form.locator('[name="emergency_contact_relation"]').fill("Mother");
  await form.locator('[name="emergency_contact_number"]').fill("+92 300 7654321");
  await form.getByRole("button", { name: "Register", exact: true }).click();
  await page.waitForURL(`**/students/${leadId}/profile`, { timeout: 60000 });
  const { data: registered } = await admin.from("leads").select("status, date_of_birth, address").eq("id", leadId).single();
  const { data: profile } = await admin
    .from("student_profiles")
    .select("emergency_contact_name, emergency_contact_relation, emergency_contact_number")
    .eq("student_id", leadId)
    .maybeSingle();
  ok(
    "...and registers them with all five, the emergency contact where the Profile tab reads it",
    registered?.status === "registered" &&
      registered.date_of_birth === "2004-02-10" &&
      registered.address === "zztmp 12 Garden Road, Karachi" &&
      profile?.emergency_contact_name === "zztmp Parent" &&
      profile?.emergency_contact_relation === "Mother" &&
      profile?.emergency_contact_number === "+92 300 7654321",
    JSON.stringify({ registered, profile })
  );
  const onProfile = await poll(async () => (await page.locator('input[name="emergency_contact_name"]').inputValue()) === "zztmp Parent", 30);
  ok("...and the Profile tab shows the emergency contact", Boolean(onProfile));

  // The Register student form — looked at, not submitted (see the top).
  await page.goto(`${BASE}/students/new`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-registration-personal]").waitFor({ timeout: 60000 });
  const newForm = await Promise.all(fields.map((f) => page.locator(`[data-registration-personal] [name="${f}"]`).getAttribute("required")));
  ok("the Register student form asks for the same five, all required", newForm.every((r) => r !== null), JSON.stringify(newForm));

  // ----------------------------------------------------- a counsellor's list
  console.log("\n--- a counsellor's list ---");
  const own = await fx.lead({ full_name: "zztmp leads workflow own", contact_number: "03001234501", assigned_counselor_id: cou.id, date_of_inquiry: today });
  void own;
  const cp = await signIn(browser, cou.email);
  const t0 = Date.now();
  await cp.goto(`${BASE}/leads`, { waitUntil: "domcontentloaded" });
  await cp.locator("tbody tr").first().waitFor({ timeout: 120000 });
  const said = (await cp.locator("p", { hasText: "in the pipeline" }).first().innerText()).trim();
  const rows = await cp.locator("tbody tr").count();
  // Both fixtures are theirs — the registered one stays on the leads list —
  // and nothing else of the 2,800 is.
  ok("a counsellor's list holds their own leads only", said.startsWith("2 ") && rows === 2, `${said}, ${rows} rows, opened in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await cp.close();
} catch (e) {
  ok(`the check itself stopped: ${e?.stack ?? e}`, false);
} finally {
  await browser?.close().catch(() => {});
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
