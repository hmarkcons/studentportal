// Every table scrolls like a spreadsheet (TableFrame), checked on the pages
// with the longest and widest tables.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:tables
//
// A table's scrollbars used to be at its far edges — the sideways one two
// hundred rows down the page. Now each table has a window of its own that
// ends on screen, with the heading row and the row's name frozen. Every part
// of that is CSS and measurement, so none of it shows in a build and each
// fails quietly: a wrapper that is not the scroller makes the heading scroll
// away, an extra overflow ancestor unfreezes the column, a window taller than
// the screen puts the scrollbar back out of reach. So this measures the real
// pages, on a laptop-sized screen, as a Super Admin:
//
//   the window ends inside the screen, so its bottom scrollbar is visible
//     where the page opens (for a table near the top of the page);
//   scrolling down inside it, the heading row stays at the window's top;
//   scrolling across, the frozen column stays at the window's left while the
//     next column moves;
//   the scrollbars take up room — they are not the kind that fade away.
//
// Read-only: it opens pages and scrolls them. Its one fixture, the Super
// Admin it signs in as, is removed at the end.
import { clients, fixtures, openBrowser, signIn, requireConfirmation, BASE } from "./verify-portal-lib.mjs";

requireConfirmation("check:tables");

const { admin } = clients();
// With its scrollbars. Playwright starts headless Chromium with them hidden,
// which would make "the scrollbar takes up room" unmeasurable.
const browser = await (async () => {
  // The library's check that playwright is installed, with its advice if not.
  await (await openBrowser()).close();
  const { chromium } = await import("playwright");
  return chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
})();
const fx = fixtures(admin);
let pass = 0, fail = 0;
const ok = (l, c, x = "") => { if (c) { pass++; console.log(`PASS  ${l}`); } else { fail++; console.log(`FAIL  ${l}${x ? "  — " + x : ""}`); } };

// The long lists, and a card-held table (Permissions), a DataTable with its
// name in the third column (Students) and one in the first (Referrals).
const PAGES = [
  ["/leads", "Leads"],
  ["/students", "Registered students"],
  ["/admin/audit-log", "Audit log"],
  ["/admin/attendance", "Attendance"],
  ["/admin/permissions", "Role permissions"],
  ["/admin/staff", "Staff"],
  ["/finance/staff-commission", "Staff commission"],
  ["/marketing/referrals", "Referrals"],
  ["/setup/scholarship-bodies", "Scholarship bodies"],
];

try {
  const sup = await fx.staff("tables", ["super_admin"]);
  const page = await signIn(browser, sup.email);
  // A laptop, and short enough that the long tables overflow downwards too.
  await page.setViewportSize({ width: 1280, height: 640 });

  for (const [path, name] of PAGES) {
    console.log(`\n--- ${name} (${path}) ---`);
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    const frame = page.locator("[data-table-frame]").first();
    const found = await frame.waitFor({ timeout: 30000 }).then(() => true, () => false);
    if (!found && (await page.locator("main table").count()) === 0) {
      // A list with nothing in it shows its empty message rather than a table.
      console.log("      (no rows here yet, so no table to scroll)");
      continue;
    }
    ok("the table has a scrolling window", found);
    if (!found) continue;
    await page.waitForTimeout(800);

    const box = await frame.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        top: r.top, bottom: r.bottom, left: r.left,
        tall: el.scrollHeight > el.clientHeight + 1, wide: el.scrollWidth > el.clientWidth + 1,
        // What the bars occupy: the box less its content area and its border.
        barBottom: el.offsetHeight - el.clientHeight - parseFloat(getComputedStyle(el).borderTopWidth) - parseFloat(getComputedStyle(el).borderBottomWidth),
        viewport: window.innerHeight, role: el.getAttribute("role"), label: el.getAttribute("aria-label"),
      };
    });
    ok("...announced as a scrollable region with a name", box.role === "region" && /\w/.test(box.label ?? ""), String(box.label));
    if (!box.tall && !box.wide) {
      console.log("      (this table fits its window here — nothing to scroll)");
      continue;
    }
    // A table with room for its minimum height on screen ends on it.
    if (box.top + 18 * 16 + 16 <= box.viewport) {
      ok("...its window ends inside the screen, scrollbar and all", box.bottom <= box.viewport + 1, `bottom ${Math.round(box.bottom)} of ${box.viewport}`);
    }
    if (box.wide) ok("...its sideways scrollbar takes up room, so it cannot fade away", box.barBottom >= 8, `${box.barBottom}px`);

    // Scrolling the page up brings the window's top up; it grows with it and
    // still ends at the bottom of the screen.
    if (box.tall) {
      const startHeight = box.bottom - box.top;
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(400);
      const grown = await frame.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, height: r.height, viewport: window.innerHeight };
      });
      ok("scrolling the page, the window still ends on screen", grown.bottom <= grown.viewport + 1, JSON.stringify(grown));
      if (box.top > 40) ok("...having grown to use the room", grown.height > startHeight + 20, `${Math.round(startHeight)} → ${Math.round(grown.height)}`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
    }

    if (box.tall) {
      const header = await frame.evaluate((el) => {
        const th = el.querySelector("thead th");
        el.scrollTop = Math.min(400, el.scrollHeight);
        return th ? { before: th.getBoundingClientRect().top - el.getBoundingClientRect().top } : null;
      });
      await page.waitForTimeout(150);
      const after = await frame.evaluate((el) => {
        const th = el.querySelector("thead th");
        return { offset: th.getBoundingClientRect().top - el.getBoundingClientRect().top, scrolled: el.scrollTop, marked: el.hasAttribute("data-scrolled-y") };
      });
      ok("scrolling down, the heading row stays at the top of the window",
        header !== null && after.scrolled > 0 && Math.abs(after.offset) <= 2, JSON.stringify({ ...after, ...header }));
      ok("...with an edge drawn under it", after.marked);
      await frame.evaluate((el) => (el.scrollTop = 0));
    }

    if (box.wide) {
      const across = await frame.evaluate((el) => {
        const row = el.querySelector("tbody tr:has(td[data-frozen]), tbody tr");
        const cells = row ? [...row.children] : [];
        const frozenIndex = Math.max(0, cells.findIndex((c) => c.hasAttribute("data-frozen")));
        const frozen = cells[frozenIndex];
        const next = cells[frozenIndex + 1];
        if (!frozen || !next) return null;
        const frameLeft = el.getBoundingClientRect().left;
        const before = { frozen: frozen.getBoundingClientRect().left - frameLeft, next: next.getBoundingClientRect().left - frameLeft };
        el.scrollLeft = el.scrollWidth;
        return { before, frozenIndex, text: frozen.innerText.trim().slice(0, 40) };
      });
      await page.waitForTimeout(150);
      const moved = await frame.evaluate((el, i) => {
        const row = el.querySelector("tbody tr:has(td[data-frozen]), tbody tr");
        const cells = [...row.children];
        const frameLeft = el.getBoundingClientRect().left;
        return {
          frozen: cells[i].getBoundingClientRect().left - frameLeft,
          next: cells[i + 1].getBoundingClientRect().left - frameLeft,
          scrolled: el.scrollLeft,
          marked: el.hasAttribute("data-scrolled-x"),
          headFrozen: (() => {
            const th = el.querySelectorAll("thead th")[i];
            return th ? th.getBoundingClientRect().left - frameLeft : null;
          })(),
        };
      }, across?.frozenIndex ?? 0);
      ok(`scrolling across, the row's name ("${across?.text ?? "?"}") stays at the left of the window`,
        across !== null && moved.scrolled > 0 && Math.abs(moved.frozen) <= 2, JSON.stringify({ before: across?.before, moved }));
      ok("...and so does its heading", moved.headFrozen !== null && Math.abs(moved.headFrozen) <= 2, String(moved.headFrozen));
      ok("...while the columns after it move", across !== null && moved.next < across.before.next - 20, JSON.stringify(moved));
      ok("...with an edge drawn beside it", moved.marked);
      await frame.evaluate((el) => (el.scrollLeft = 0));
    }
  }
} finally {
  const n = await fx.cleanup();
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed  (${n} fixture removed)`);
  process.exitCode = fail ? 1 : 0;
}
