// How long the deployed portal takes to answer, page by page.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:speed
//
// Read-only: it signs in as the E2E Super Admin from .env.local and loads
// pages. It creates nothing and writes nothing, so there is nothing to clean
// up — but it does hit the live portal with a real session, which is why it
// takes the same opt-in as the other check:* scripts.
//
// Two numbers per page. TTFB is the gap before the first byte, and on this app
// it is flat at about 80ms everywhere — the App Router flushes a shell
// immediately and streams the rest, so TTFB measures the platform rather than
// the page. The number that matters is the full load: when the content the
// staff member came for has actually arrived. Pages are ranked by it.
//
// Each page is loaded several times and the MEDIAN is reported. A single
// sample on a serverless platform measures whether you hit a warm instance,
// not how fast the page is. The first load of each page is discarded for the
// same reason.
//
// Why this exists: the portal was slow for a reason no amount of reading the
// code would have revealed — the functions ran in Virginia while the database
// was in Sydney, so every query crossed the Pacific twice. A number per page,
// before and after, is the only way to know whether a change to that kind of
// thing actually helped.
import { clients, openBrowser, requireConfirmation, BASE } from "./verify-portal-lib.mjs";
import { readFileSync } from "node:fs";

requireConfirmation("check:speed");

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const EMAIL = env.E2E_SUPER_ADMIN_EMAIL;
const PASSWORD = env.E2E_SUPER_ADMIN_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.log("E2E_SUPER_ADMIN_EMAIL / E2E_SUPER_ADMIN_PASSWORD are not in .env.local.");
  process.exit(2);
}

const RUNS = Number(process.env.SPEED_RUNS ?? 4);
const LABEL = process.env.SPEED_LABEL ?? "";

const { admin } = clients();
const browser = await openBrowser();

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

try {
  // A real student to open, so the heaviest page in the portal is measured on
  // real data rather than an empty record.
  const { data: student } = await admin
    .from("leads")
    .select("id, full_name")
    .eq("registration_status", "registered")
    .not("full_name", "ilike", "zztmp%")
    .order("registered_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const pages = [
    ["dashboard", "/dashboard"],
    ["students list", "/students"],
    ["student detail", student ? `/students/${student.id}` : null],
    ["consultancy fee", "/finance/consultancy-fee"],
    ["invoice generator", "/finance/invoice-generator"],
    ["revenue report", "/reports/revenue-commission"],
    ["calendar", "/calendar"],
    ["staff admin", "/admin/staff"],
  ].filter(([, path]) => path);

  const page = await browser.newPage({ viewport: { width: 1500, height: 1200 } });
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60000 });

  console.log(`\n${BASE}${LABEL ? `  [${LABEL}]` : ""}`);
  console.log(`median of ${RUNS} loads, first discarded\n`);
  console.log("page                  server (TTFB)     full load");
  console.log("--------------------------------------------------");

  const results = [];
  for (const [name, path] of pages) {
    const ttfbs = [];
    const loads = [];
    for (let i = 0; i <= RUNS; i++) {
      await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 120000 });
      const t = await page.evaluate(() => {
        const [nav] = performance.getEntriesByType("navigation");
        return nav ? { ttfb: nav.responseStart - nav.requestStart, load: nav.loadEventEnd - nav.startTime } : null;
      });
      if (!t) continue;
      // The first load of a page warms the serverless instance and the route;
      // it measures the platform, not the page.
      if (i === 0) continue;
      ttfbs.push(Math.round(t.ttfb));
      loads.push(Math.round(t.load));
    }
    if (ttfbs.length === 0) {
      console.log(`${name.padEnd(20)}  (no timing)`);
      continue;
    }
    const ttfb = median(ttfbs);
    const load = median(loads);
    results.push([name, load]);
    console.log(
      `${name.padEnd(20)}  ${String(ttfb + " ms").padStart(9)}     ${String(load + " ms").padStart(9)}`
    );
  }

  // Ranked by full load, not TTFB: the shell arrives at once whatever the page
  // is doing, so TTFB cannot tell a fast page from a slow one here.
  const worst = [...results].sort((a, b) => b[1] - a[1])[0];
  const total = results.reduce((s, [, ms]) => s + ms, 0);
  console.log("--------------------------------------------------");
  console.log(`slowest: ${worst?.[0]} at ${worst?.[1]} ms · all pages together ${(total / 1000).toFixed(1)} s`);

  await page.close();
} finally {
  await browser.close();
}
