// Suggested programmes on the Applications tab, separated by country (0343-less
// UI feature), end to end against a portal:
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:suggest
//
// A student with a course of interest and more than one country sees the
// matching programmes split into one section per country they are registered
// for, primary countries before backups, and inside each country grouped by
// university; a country whose catalogue has no match is still shown, saying so
// rather than being dropped; each programme is addable on the spot; a country
// section collapses. PORTAL_URL=http://localhost:3000 runs it against a local
// server. Everything is named zztmp and removed in a finally.
import { BASE, clients, fixtures, openBrowser, requireConfirmation, reporter, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:suggest");

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

// Two primary countries with masters programmes in these fields, and one
// backup whose catalogue has none — so every branch is exercised.
const PRIMARY_A = "Italy (Public)";
const PRIMARY_B = "Germany (Public)";
const EMPTY_BACKUP = "Spain (Public)";
const INTERESTS = ["computer_science", "physics"];

let browser = null;
let studentId = null;

try {
  const officer = await fx.staff(`suggest${Date.now().toString(36)}`, ["processing"]);
  const { data: dests } = await admin.from("destinations").select("id, display_name").in("display_name", [PRIMARY_A, PRIMARY_B, EMPTY_BACKUP]);
  const idOf = (n) => dests.find((d) => d.display_name === n)?.id;

  studentId = await fx.lead({
    full_name: "zztmp Suggest Student",
    email: `zztmp-suggest-${Date.now().toString(36)}@hmark-test.local`,
    contact_number: "0300-9999996",
    status: "registered",
    registration_status: "registered",
    registered_at: new Date().toISOString(),
    date_of_inquiry: new Date().toISOString().slice(0, 10),
    processing_officer_id: officer.id,
    assigned_counselor_id: officer.id,
    intake: "Fall 2099",
    level_applying_for: "masters",
    country_of_interest: PRIMARY_A,
    interest_field_groups: INTERESTS,
    course_of_interest: "Computer Science, Physics",
  });
  await admin.from("lead_destinations").insert([
    { lead_id: studentId, destination_id: idOf(PRIMARY_A), is_backup: false },
    { lead_id: studentId, destination_id: idOf(PRIMARY_B), is_backup: false },
    { lead_id: studentId, destination_id: idOf(EMPTY_BACKUP), is_backup: true },
  ]);

  browser = await openBrowser();
  const page = await signIn(browser, officer.email);
  await page.goto(`${BASE}/students/${studentId}/applications`, { waitUntil: "domcontentloaded" });
  const panel = page.locator("[data-suggested-programmes]");
  await panel.waitFor({ timeout: 60000 });

  const countries = await panel.locator("[data-country]").evaluateAll((els) => els.map((e) => e.getAttribute("data-country")));
  ok(
    "the suggestions are split into one section per registered country, the backup last",
    countries.length === 3 && countries.includes(PRIMARY_A) && countries.includes(PRIMARY_B) && countries[countries.length - 1] === EMPTY_BACKUP,
    JSON.stringify(countries)
  );

  const primary = panel.locator(`[data-country="${PRIMARY_A}"]`);
  const universities = await primary.locator("[data-university]").count();
  const programmes = await primary.locator("[data-programme]").count();
  const addButtons = await primary.getByRole("button", { name: "+ Add" }).count();
  ok(
    `${PRIMARY_A} groups its matches by university, each programme addable`,
    universities > 0 && programmes >= universities && addButtons === programmes,
    `${universities} universities, ${programmes} programmes, ${addButtons} Add buttons`
  );
  ok(`${PRIMARY_B} has its own matches, kept apart from ${PRIMARY_A}`, (await panel.locator(`[data-country="${PRIMARY_B}"] [data-programme]`).count()) > 0);

  const backup = panel.locator(`[data-country="${EMPTY_BACKUP}"]`);
  const backupText = await backup.innerText();
  ok("a backup country is labelled, and one with no match says so rather than being dropped", backupText.includes("(backup)") && /Nothing to suggest|No programme at/.test(backupText), backupText.replace(/\s+/g, " "));

  // Collapsible: collapsing a country hides its programmes.
  await primary.locator("[data-country-toggle]").click();
  await page.waitForTimeout(300);
  ok("a country section collapses", (await primary.locator("[data-programme]").count()) === 0);
} catch (e) {
  ok("the run finished", false, e?.stack ?? String(e));
} finally {
  await browser?.close().catch(() => {});
  if (studentId) await admin.from("lead_destinations").delete().eq("lead_id", studentId);
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
