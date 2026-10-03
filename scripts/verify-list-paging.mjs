// The leads and registered-students lists hold every record, a page at a time
// (250 leads, 1000 students) — end to end against a deployed portal.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:paging
//
// PostgREST returns at most 1000 rows to one request and says nothing about
// the rest, so a list that read its records in one request showed 1,000 of
// 2,803 leads. This counts what a Super Admin's list says it holds against the
// database, and pages through it: a thousand rows a page, Next above the table
// and below it.
//
// Read-only. Its one fixture, the Super Admin it signs in as, is removed.
import { BASE, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:paging");

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

let browser = null;

try {
  const sup = await fx.staff("paging", ["super_admin"]);
  const { count: leadCount } = await admin.from("leads").select("id", { count: "exact", head: true });
  const { count: studentCount } = await admin.from("students").select("id", { count: "exact", head: true });

  browser = await openBrowser();
  const page = await signIn(browser, sup.email);
  await page.setViewportSize({ width: 1400, height: 900 });

  for (const [path, label, total, unit, size] of [
    ["/leads", "Leads", leadCount, "in the pipeline", 250],
    ["/students", "Registered students", studentCount, "students", 1000],
  ]) {
    console.log(`\n--- ${label} ---`);
    const started = Date.now();
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await page.locator("tbody tr").first().waitFor({ timeout: 120000 });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    const said = (await page.locator("p", { hasText: unit }).first().innerText()).trim();
    ok(`the list holds every one of the ${total} on file`, said.startsWith(`${total} `), `${said} (loaded in ${seconds}s)`);
    const rows = await page.locator("table tbody tr").count();
    ok(`...${size} to a page at most`, rows === Math.min(size, total), String(rows));
    if (total > size) {
      const top = page.locator('[data-pager="top"]');
      ok("...with the page controls above the table as well as below", (await top.count()) === 1 && (await page.locator('[data-pager="bottom"]').count()) === 1);
      ok("...saying where the page is", new RegExp(`Showing 1–${size} of `).test(await top.innerText()), await top.innerText());
      await page.waitForFunction(() => {
        const b = [...document.querySelectorAll('[data-pager="top"] button')].find((x) => x.textContent?.trim() === "Next");
        return Boolean(b && Object.keys(b).some((k) => k.startsWith("__reactProps")));
      }, null, { timeout: 30000 });
      await top.getByRole("button", { name: "Next" }).click();
      await page.waitForFunction((next) => (document.querySelector('[data-pager="top"]')?.textContent ?? "").includes(`Showing ${next}–`), size + 1, { timeout: 30000 });
      ok(`Next shows the next ${size}`, new RegExp(`Showing ${size + 1}–\\d+ of `).test(await top.innerText()), await top.innerText());
    }
  }
  // ------------------------------------- searched and filtered by the server
  console.log("\n--- students: search and filters ---");
  const { data: sample } = await admin
    .from("students")
    .select("id, full_name, student_code, registered_at, registration_status")
    .not("student_code", "is", null)
    .order("registered_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sample) {
    const rowsAt = async (query) => {
      await page.goto(`${BASE}/students${query}`, { waitUntil: "domcontentloaded" });
      await page.locator("table").first().waitFor({ timeout: 120000 });
      return page.locator("table tbody tr").evaluateAll((trs) => trs.map((tr) => tr.textContent ?? ""));
    };
    const byCode = await rowsAt(`?q=${encodeURIComponent(sample.student_code)}`);
    ok("a search by Student ID finds that student, by the server", byCode.length >= 1 && byCode.every((t) => t.includes(sample.student_code)), `${byCode.length} rows`);
    const when = new Date(sample.registered_at);
    const monthName = when.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
    const inMonth = await rowsAt(`?f_month=${monthName}&f_year=${when.getUTCFullYear()}`);
    const start = new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), 1)).toISOString();
    const end = new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth() + 1, 1)).toISOString();
    const { count: monthCount } = await admin.from("students").select("id", { count: "exact", head: true }).gte("registered_at", start).lt("registered_at", end);
    ok("the month and year filters hold that month's students, all of them", inMonth.length === monthCount && inMonth.some((t) => t.includes(sample.full_name)),
      `${inMonth.length} shown, ${monthCount} on file`);
    const { count: statusCount } = await admin.from("students").select("id", { count: "exact", head: true }).eq("registration_status", sample.registration_status);
    const byStatus = await rowsAt(`?f_regStatus=${sample.registration_status}`);
    ok("the registration filter holds every student with that status", byStatus.length === Math.min(1000, statusCount ?? 0), `${byStatus.length} shown, ${statusCount} on file`);
  }
} catch (e) {
  ok(`the check itself stopped: ${e?.stack ?? e}`, false);
} finally {
  await browser?.close().catch(() => {});
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
