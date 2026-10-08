// Row colours and long values in the Registered students list, end to end
// against a deployed portal.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:studentcells
//
//   Rows are striped, the one under the pointer lit, the one clicked kept
//   marked. Contact, Country, Backup Country and Intake each keep to one line: a value
//   too long for its column is cut short, and a click on it opens the whole of
//   it in a pop-up titled with the column and the student — several backup
//   countries listed one to a line. A value that fits is plain text, not
//   something to click. A long name is cut short too, the whole of it on
//   hover, and still opens the student.
//
// The same cell is on the leads list, where check:leadimport covers it.
// Everything is named zztmp and removed in a finally.
import { BASE, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:studentcells");

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const NAME = "zztmp Cells Student Muhammad Abdullah Rehman Siddiqui Khan";
const SHORT = "zztmp Cells Short";
const EMAIL = "zztmp-cells-student-with-a-very-long-address@hmark-test.local";
const COUNTRY = "zztmp Italy (Public), Milan or Pavia, whichever offers the larger scholarship";

let browser = null;

try {
  const admin1 = await fx.staff("studentcells", ["super_admin"]);
  const registered = { status: "registered", registration_status: "registered", registered_at: new Date().toISOString() };
  const longId = await fx.lead({ full_name: NAME, email: EMAIL, contact_number: null, country_of_interest: COUNTRY, ...registered });
  const shortId = await fx.lead({ full_name: SHORT, contact_number: "0300-9999991", country_of_interest: "Italy", ...registered });

  const { data: destinations } = await admin.from("destinations").select("id, display_name").order("display_name").limit(3);
  if ((destinations ?? []).length < 3) throw new Error("fewer than three destinations to use as backups");
  const { error: backupError } = await admin
    .from("lead_destinations")
    .insert(destinations.map((d) => ({ lead_id: longId, destination_id: d.id, is_backup: true })));
  if (backupError) throw new Error(`backup countries: ${backupError.message}`);
  const backupNames = destinations.map((d) => d.display_name);

  browser = await openBrowser();
  const page = await signIn(browser, admin1.email);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(`${BASE}/students`, { waitUntil: "domcontentloaded" });
  const search = page.getByPlaceholder("Search name, email, phone, Student ID…");
  await search.waitFor({ timeout: 60000 });
  await page.waitForFunction(() => {
    const i = document.querySelector('input[placeholder="Search name, email, phone, Student ID…"]');
    return Boolean(i && Object.keys(i).some((k) => k.startsWith("__reactProps")));
  }, null, { timeout: 30000 });
  await search.fill("zztmp Cells");
  const longRow = page.locator("tbody tr", { has: page.locator(`a[href="/students/${longId}"]`) });
  const shortRow = page.locator("tbody tr", { has: page.locator(`a[href="/students/${shortId}"]`) });
  await longRow.waitFor({ timeout: 30000 });
  await shortRow.waitFor({ timeout: 30000 });

  const headers = (await page.locator("thead th").allInnerTexts()).map((t) => t.trim().toLowerCase());
  const col = (h) => headers.indexOf(h);
  const cell = (row, h) => row.locator("td").nth(col(h)).locator("[data-long-text]");
  ok("the list has Contact, Country, Backup Country and Intake columns",
    ["contact", "country", "backup country", "intake"].every((h) => col(h) >= 0), headers.join(" | "));

  // Row colours first: a click on a cell marks its row, so the pop-ups below
  // would leave one marked before the stripes were measured.
  const bg = (row) => row.locator("td").nth(col("contact")).evaluate((el) => getComputedStyle(el).backgroundColor);
  const rows = page.locator("table[data-row-highlight] > tbody > tr");
  ok("the table is marked for row colours", (await rows.count()) >= 2, String(await rows.count()));
  await page.mouse.move(5, 5);
  const [first, second] = [await bg(rows.nth(0)), await bg(rows.nth(1))];
  ok("rows are striped", first !== second, `${first} / ${second}`);
  await rows.nth(1).locator("td").nth(col("contact")).hover();
  const hovered = await bg(rows.nth(1));
  ok("the row under the pointer is lit", hovered !== first && hovered !== second, hovered);
  await rows.nth(0).locator("td").nth(col("month")).click();
  await page.mouse.move(5, 5);
  const clicked = await bg(rows.nth(0));
  ok("the row clicked stays marked once the pointer has gone",
    (await rows.nth(0).getAttribute("data-current")) !== null && clicked !== first && clicked !== second, clicked);

  const isCut = async (loc) => (await loc.evaluate((el) => el.scrollWidth > el.clientWidth)) && (await loc.getAttribute("data-cut")) !== null;
  const openAndRead = async (loc) => {
    await loc.click();
    const dialog = page.locator("dialog[open] [data-long-dialog]");
    await dialog.waitFor({ timeout: 15000 });
    const title = (await page.locator("dialog[open] h3").innerText()).trim();
    const items = await dialog.locator("[data-long-full] li").allInnerTexts();
    const full = (await dialog.locator("[data-long-full]").innerText()).trim();
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("dialog[open]"), null, { timeout: 10000 });
    return { title, items, full };
  };

  const contact = cell(longRow, "contact");
  ok("a long email in Contact is cut short on one line", await isCut(contact));
  const c = await openAndRead(contact);
  ok("...and a click opens the whole of it, titled with the column and the student", c.full === EMAIL && c.title === `Contact — ${NAME}`, JSON.stringify(c));

  const country = cell(longRow, "country");
  ok("a long Country is cut short", await isCut(country));
  ok("...and opens whole", (await openAndRead(country)).full === COUNTRY);

  const backups = cell(longRow, "backup country");
  ok("three backup countries are cut short", await isCut(backups), await backups.innerText());
  const b = await openAndRead(backups);
  ok("...and open listed one to a line", JSON.stringify(b.items) === JSON.stringify(backupNames), JSON.stringify(b));

  for (const h of ["contact", "country"]) {
    const short = cell(shortRow, h);
    ok(`a ${h} that fits is plain text, not something to click`,
      (await short.innerText()).trim().length > 0 && (await short.getAttribute("data-cut")) === null && (await short.getAttribute("role")) === null,
      await short.innerText());
  }

  const name = longRow.locator(`a[href="/students/${longId}"]`);
  // The whole name shows beside it while the pointer rests on it (LongTextCell).
  const nameCut = await name.evaluate((el) => el.scrollWidth > el.clientWidth);
  await name.hover();
  const preview = page.locator("[data-hover-preview]");
  await preview.waitFor({ timeout: 10000 }).catch(() => {});
  const previewText = (await preview.count()) ? (await preview.innerText()).trim() : null;
  ok("a long name is cut short, with the whole of it on hover", nameCut && previewText === NAME, String(previewText));
  await page.mouse.move(5, 5);
  await name.click();
  await page.waitForURL(new RegExp(`/students/${longId}`), { timeout: 60000 });
  ok("...and still opens the student", page.url().includes(`/students/${longId}`));
} catch (e) {
  ok(`the check itself stopped: ${e?.stack ?? e}`, false);
} finally {
  await browser?.close().catch(() => {});
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
