import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { REPORT_CATALOGUE, visibleReports } from "../src/lib/reportsCatalogue.ts";

const REPORTS_DIR = "src/app/(staff)/reports";
const pageDirs = readdirSync(REPORTS_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

// requireReportAccess fails closed: an href with no catalogue entry is denied
// to everyone, Super Admin included. That is the right default, but it means a
// typo would silently take a report away from the whole company, so the two
// lists are asserted to agree here rather than discovered in production.
test("every report page has a catalogue entry", () => {
  const hrefs = new Set(REPORT_CATALOGUE.map((r) => r.href));
  for (const dir of pageDirs) {
    assert.ok(hrefs.has(`/reports/${dir}`), `no catalogue entry for /reports/${dir}`);
  }
});

test("every catalogue entry has a page", () => {
  for (const r of REPORT_CATALOGUE) {
    const dir = r.href.replace("/reports/", "");
    assert.ok(pageDirs.includes(dir), `catalogue lists ${r.href} but there is no page`);
  }
});

test("every report page actually calls the gate, with its own href", () => {
  for (const dir of pageDirs) {
    const src = readFileSync(`${REPORTS_DIR}/${dir}/page.tsx`, "utf8");
    assert.match(src, /requireReportAccess\(/, `${dir} does not gate`);
    assert.ok(
      src.includes(`requireReportAccess("/reports/${dir}")`),
      `${dir} gates on the wrong href — copy-paste would grant it another report's audience`
    );
  }
});

test("no report page still builds its own unscoped client", () => {
  // The gate returns the request-cached client; a page calling createClient
  // itself would work, but it is the shape a page takes when the gate was
  // added around it and then quietly dropped.
  for (const dir of pageDirs) {
    const src = readFileSync(`${REPORTS_DIR}/${dir}/page.tsx`, "utf8");
    assert.ok(!src.includes("@/lib/supabase/server"), `${dir} still imports createClient directly`);
  }
});

test("Super Admin sees every report", () => {
  assert.equal(visibleReports("super_admin").length, REPORT_CATALOGUE.length);
});

test("a counselor is not offered the money reports", () => {
  const hrefs = visibleReports("counselor").map((r) => r.href);
  for (const denied of ["/reports/staff-commission", "/reports/revenue-commission", "/reports/refunds"]) {
    assert.ok(!hrefs.includes(denied), `counselor should not see ${denied}`);
  }
});

test("no role is offered a report, and nobody at all is offered an unknown one", () => {
  assert.deepEqual(visibleReports(undefined), []);
  assert.ok(!REPORT_CATALOGUE.some((r) => r.roles.length === 0), "a report nobody can see is dead weight");
});

test("every catalogue entry includes super_admin, so the gate cannot lock them out", () => {
  for (const r of REPORT_CATALOGUE) {
    assert.ok(r.roles.includes("super_admin"), `${r.href} omits super_admin`);
  }
});
