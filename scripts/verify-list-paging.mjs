// The leads and registered-students lists hold every record, a thousand to a
// page — end to end against a deployed portal.
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

  for (const [path, label, total, unit] of [
    ["/leads", "Leads", leadCount, "in the pipeline"],
    ["/students", "Registered students", studentCount, "students"],
  ]) {
    console.log(`\n--- ${label} ---`);
    const started = Date.now();
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await page.locator("tbody tr").first().waitFor({ timeout: 120000 });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    const said = (await page.locator("p", { hasText: unit }).first().innerText()).trim();
    ok(`the list holds every one of the ${total} on file`, said.startsWith(`${total} `), `${said} (loaded in ${seconds}s)`);
    const rows = await page.locator("table tbody tr").count();
    ok("...a thousand to a page at most", rows === Math.min(1000, total), String(rows));
    if (total > 1000) {
      const top = page.locator('[data-pager="top"]');
      ok("...with the page controls above the table as well as below", (await top.count()) === 1 && (await page.locator('[data-pager="bottom"]').count()) === 1);
      ok("...saying where the page is", /Showing 1–1000 of /.test(await top.innerText()), await top.innerText());
      await page.waitForFunction(() => {
        const b = [...document.querySelectorAll('[data-pager="top"] button')].find((x) => x.textContent?.trim() === "Next");
        return Boolean(b && Object.keys(b).some((k) => k.startsWith("__reactProps")));
      }, null, { timeout: 30000 });
      await top.getByRole("button", { name: "Next" }).click();
      await page.waitForFunction(() => /Showing 1001–/.test(document.querySelector('[data-pager="top"]')?.textContent ?? ""), null, { timeout: 15000 });
      ok("Next shows the next thousand", /Showing 1001–\d+ of /.test(await top.innerText()), await top.innerText());
    }
  }
} catch (e) {
  ok(`the check itself stopped: ${e?.stack ?? e}`, false);
} finally {
  await browser?.close().catch(() => {});
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
