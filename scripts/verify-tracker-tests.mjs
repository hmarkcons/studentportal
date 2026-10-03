// Tests ticked in the documentation tracker, end to end against a deployed
// portal.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:trackertests
//
//   pre-tick   an Italy bachelors student with 65% in high school has CEnT-S
//              ticked in their Italy tracker, saying why; one with 75% does not.
//   fields     each ticked test opens a Test date and a Score; ticking SAT
//              opens SAT's.
//   saved      saving keeps the ticks and writes each test's date and score to
//              the student's Test scores; a changed score updates that same
//              record rather than adding another; the fields come back filled.
//
// Everything is named zztmp and removed in a finally.
import { BASE, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:trackertests");

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

async function poll(fn, seconds = 60) {
  for (let i = 0; i < seconds; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

let browser = null;

try {
  const sup = await fx.staff("trackertests", ["super_admin"]);
  const { data: italy } = await admin.from("destinations").select("id, display_name").eq("display_name", "Italy (Public)").single();
  const { data: uni } = await admin.from("universities").select("id").eq("destination_id", italy.id).limit(1).single();
  const { data: program } = await admin.from("programs").select("id").eq("university_id", uni.id).limit(1).maybeSingle();

  const studentId = await fx.lead({
    full_name: "zztmp Tracker Tests Student", email: "zztmp-trackertests@example.invalid",
    status: "registered", registration_status: "registered", registered_at: new Date().toISOString(),
    country_of_interest: italy.display_name, level_applying_for: "bachelors",
  });
  await admin.from("lead_destinations").insert({ lead_id: studentId, destination_id: italy.id });
  const { error: qualError } = await admin.from("student_qualifications").insert({ student_id: studentId, qualification_type: "high_school", grade_percentage: "65%" });
  if (qualError) throw new Error(`qualification: ${qualError.message}`);
  const { data: app, error: appError } = await admin.from("applications").insert({ student_id: studentId, university_id: uni.id, program_id: program?.id ?? null }).select("id").single();
  if (appError) throw new Error(`application: ${appError.message}`);

  browser = await openBrowser();
  const page = await signIn(browser, sup.email);
  const openTracker = async () => {
    await page.goto(`${BASE}/students/${studentId}`, { waitUntil: "domcontentloaded" });
    const header = page.locator('button[aria-expanded="false"]').filter({ hasText: "Documentation tracker" }).first();
    await header.waitFor({ timeout: 60000 });
    await page.waitForFunction(() => {
      const b = [...document.querySelectorAll('button[aria-expanded]')].find((x) => x.textContent?.includes("Documentation tracker"));
      return Boolean(b && Object.keys(b).some((k) => k.startsWith("__reactProps")));
    }, null, { timeout: 30000 });
    await header.click();
    const save = page.getByRole("button", { name: "Save tracker fields" });
    await save.waitFor({ timeout: 30000 });
    return save;
  };
  const tick = (label) => page.locator("label", { hasText: new RegExp(`^${label}$`) }).locator('input[type="checkbox"]').first();

  // ------------------------------------------------------------ pre-tick
  console.log("\n--- pre-tick ---");
  let save = await openTracker();
  ok("an Italy bachelors student below 70% has CEnT-S ticked", await tick("CEnT-S").isChecked());
  ok("...saying why", /65% — below 70%/.test(await page.locator("[data-pretick-note]").innerText().catch(() => "")));
  ok("...and CEnT-S opens its date and score", (await page.locator('[data-test-fields="cent_s"] input').count()) === 2);

  // -------------------------------------------------------------- fields
  console.log("\n--- fields ---");
  await tick("SAT").check();
  await page.locator('[data-test-fields="sat"]').waitFor({ timeout: 15000 });
  ok("ticking SAT opens SAT's date and score", (await page.locator('[data-test-fields="sat"] input').count()) === 2);
  await page.locator('input[name="tracker_test_date__cent_s"]').fill("2026-11-20");
  await page.locator('input[name="tracker_test_score__cent_s"]').fill("38");
  await page.locator('input[name="tracker_test_date__sat"]').fill("2026-12-05");
  await page.locator('input[name="tracker_test_score__sat"]').fill("1250");
  await save.click();

  // --------------------------------------------------------------- saved
  console.log("\n--- saved ---");
  const scores = await poll(async () => {
    const { data } = await admin.from("student_test_scores").select("id, test_type, score, test_date").eq("student_id", studentId).order("test_type");
    return (data ?? []).length === 2 ? data : null;
  });
  const byType = Object.fromEntries((scores ?? []).map((s) => [s.test_type, s]));
  ok("each test's date and score is in the student's Test scores",
    byType.cent_s?.score === "38" && byType.cent_s?.test_date === "2026-11-20" && byType.sat?.score === "1250" && byType.sat?.test_date === "2026-12-05",
    JSON.stringify(scores));
  const { data: ticked } = await admin.from("application_country_extra").select("field_value").eq("application_id", app.id).eq("field_key", "test_status").maybeSingle();
  ok("...and the ticks are kept in the tracker", JSON.stringify(JSON.parse(ticked?.field_value ?? "[]").sort()) === JSON.stringify(["CEnT-S", "SAT"]), ticked?.field_value);

  save = await openTracker();
  ok("the fields come back filled", (await page.locator('input[name="tracker_test_score__cent_s"]').inputValue()) === "38" &&
    (await page.locator('input[name="tracker_test_date__sat"]').inputValue()) === "2026-12-05");
  ok("...and the note is gone once a test is ticked and saved", (await page.locator("[data-pretick-note]").count()) === 0);
  await page.locator('input[name="tracker_test_score__cent_s"]').fill("41");
  await save.click();
  const updated = await poll(async () => {
    const { data } = await admin.from("student_test_scores").select("id, score").eq("student_id", studentId).eq("test_type", "cent_s");
    return data?.length === 1 && data[0].score === "41" ? data : null;
  });
  ok("a changed score updates that same record rather than adding another", updated?.[0].id === byType.cent_s?.id, JSON.stringify(updated));

  // ------------------------------------------------------ 70% and above
  console.log("\n--- 70% and above ---");
  await admin.from("student_qualifications").update({ grade_percentage: "75%" }).eq("student_id", studentId).eq("qualification_type", "high_school");
  await admin.from("application_country_extra").delete().eq("application_id", app.id).eq("field_key", "test_status");
  await openTracker();
  ok("a student with 75% has nothing ticked for them", !(await tick("CEnT-S").isChecked()) && (await page.locator("[data-pretick-note]").count()) === 0);
} catch (e) {
  ok(`the check itself stopped: ${e?.stack ?? e}`, false);
} finally {
  await browser?.close().catch(() => {});
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
