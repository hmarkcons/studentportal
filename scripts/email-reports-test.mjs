// Email campaigns, part 5 (0359): the reports.
//
// What these guard against: a filter that counts machine opens as people's,
// or lets a bounced address into "did not open"; an exported name that Excel
// runs as a formula; a timeline that skips the quiet hours and so squeezes a
// day into an hour; a comparison where one huge campaign drowns the rest; a
// sender called healthy at a bounce rate that would get the domain blocked;
// and a click map whose links still go somewhere.
import test from "node:test";
import assert from "node:assert/strict";
import {
  applyFilter,
  compareWithEarlier,
  csvCell,
  exportFileName,
  fillHours,
  filterConditions,
  karachiStamp,
  RECIPIENT_EXPORT_HEADER,
  RECIPIENT_FILTERS,
  recipientExportRow,
  recipientFilter,
  recipientOutcome,
  senderHealth,
  timelineHours,
  toCsv,
} from "../src/lib/emailCampaigns/reportRules.ts";
import { clickMapHtml, prepareCampaignHtml } from "../src/lib/emailCampaigns/render.ts";

const blank = {
  status: "sent",
  bounce: null,
  complained_at: null,
  unsubscribed_at: null,
  converted_at: null,
  visited_at: null,
  human_click_count: 0,
  human_open_count: 0,
  delivered_at: null,
};

test("filters: unknown falls back to everyone; each one's conditions", () => {
  assert.equal(recipientFilter("opened"), "opened");
  assert.equal(recipientFilter("drop table"), "all");
  assert.equal(recipientFilter(null), "all");
  assert.equal(new Set(RECIPIENT_FILTERS.map((f) => f.key)).size, RECIPIENT_FILTERS.length);
  for (const f of RECIPIENT_FILTERS) assert.ok(filterConditions(f.key).length > 0, f.key);
  assert.deepEqual(filterConditions("opened"), [{ op: "gt", col: "human_open_count", value: 0 }], "people's opens, not machines'");
  assert.deepEqual(filterConditions("clicked"), [{ op: "gt", col: "human_click_count", value: 0 }]);
  assert.ok(filterConditions("not_opened").some((c) => c.op === "is_null" && c.col === "bounce"), "a bounced email was never there to open");
  assert.ok(filterConditions("not_opened").some((c) => c.op === "eq" && c.col === "status" && c.value === "sent"), "an unsent one is not 'did not open'");
});

test("filters: applied to a query builder in order", () => {
  const calls = [];
  const q = {
    eq(c, v) { calls.push(["eq", c, v]); return q; },
    gt(c, v) { calls.push(["gt", c, v]); return q; },
    is(c, v) { calls.push(["is", c, v]); return q; },
    not(c, op, v) { calls.push(["not", c, op, v]); return q; },
  };
  assert.equal(applyFilter(q, "not_opened"), q);
  assert.deepEqual(calls, [["eq", "status", "sent"], ["eq", "human_open_count", 0], ["is", "bounce", null]]);
  calls.length = 0;
  applyFilter(q, "visited");
  assert.deepEqual(calls, [["not", "visited_at", "is", null]]);
});

test("what a recipient did: the most telling thing", () => {
  assert.equal(recipientOutcome({ ...blank, status: "failed" }), "Could not be sent");
  assert.equal(recipientOutcome({ ...blank, status: "queued" }), "Waiting");
  assert.equal(recipientOutcome({ ...blank, bounce: "hard" }), "Bounced");
  assert.equal(recipientOutcome({ ...blank, human_open_count: 2, human_click_count: 1, visited_at: "x", converted_at: "x" }), "Converted");
  assert.equal(recipientOutcome({ ...blank, human_open_count: 2, human_click_count: 1, unsubscribed_at: "x" }), "Unsubscribed");
  assert.equal(recipientOutcome({ ...blank, human_open_count: 1, human_click_count: 1 }), "Clicked");
  assert.equal(recipientOutcome({ ...blank, human_open_count: 1 }), "Opened");
  assert.equal(recipientOutcome({ ...blank, delivered_at: "x" }), "Delivered");
  assert.equal(recipientOutcome(blank), "Sent");
});

test("CSV: quoted where needed, formulas defused, UTF-8 for Excel", () => {
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell('say "hi", ok'), '"say ""hi"", ok"');
  assert.equal(csvCell("two\nlines"), '"two\nlines"');
  assert.equal(csvCell("=HYPERLINK(\"http://x\")"), "\"'=HYPERLINK(\"\"http://x\"\")\"");
  assert.equal(csvCell("+92 300"), "'+92 300");
  assert.equal(csvCell("-1"), "'-1");
  assert.equal(csvCell("@x"), "'@x");
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(3), "3");
  const csv = toCsv([["a", "b"], ["Università", "x"]]);
  assert.ok(csv.startsWith("﻿a,b\r\n"));
  assert.ok(csv.includes("Università,x\r\n"));
});

test("export: a row per recipient, in the header's order, times in Karachi", () => {
  const row = recipientExportRow(
    {
      ...blank,
      email: "a@x.com",
      merge_values: { full_name: "Ayesha Khan" },
      sent_at: "2026-11-11T05:00:00Z",
      delivered_at: "2026-11-11T05:00:10Z",
      first_open_at: "2026-11-11T07:30:00Z",
      open_count: 3,
      human_open_count: 2,
      first_click_at: null,
      click_count: 1,
      human_click_count: 0,
      bounce_reason: null,
      client: "Gmail",
      device: "mobile",
      city: "Karachi",
      country: "PK",
      lead_id: "L1",
    },
    (id) => `https://portal/leads/${id}`
  );
  assert.equal(row.length, RECIPIENT_EXPORT_HEADER.length);
  const at = (h) => row[RECIPIENT_EXPORT_HEADER.indexOf(h)];
  assert.equal(at("Name"), "Ayesha Khan");
  assert.equal(at("Sent"), "2026-11-11 10:00");
  assert.equal(at("First opened"), "2026-11-11 12:30");
  assert.equal(at("Opens (person)"), "2");
  assert.equal(at("Opens (machines)"), "1");
  assert.equal(at("Clicks (machines)"), "1");
  assert.equal(at("What they did"), "Opened");
  assert.equal(at("Lead"), "https://portal/leads/L1");
  assert.equal(karachiStamp(null), "");
  assert.equal(karachiStamp("nonsense"), "");
  assert.equal(exportFileName("italy-nov", "opened_not_clicked", "2026-11-11", "csv"), "italy-nov-opened-not-clicked-2026-11-11.csv");
  assert.equal(exportFileName('evil"/name', "all", "2026-11-11", "xlsx"), "evil-name-all-2026-11-11.xlsx");
});

test("timeline: every hour present, quiet ones as zeros, in order", () => {
  const from = new Date("2026-11-11T05:20:00Z");
  const filled = fillHours(
    [
      { bucket: "2026-11-11T07:00:00+00:00", opens: 4, clicks: 1, visits: 0 },
      { bucket: "2026-11-11T05:00:00+00:00", opens: 2, clicks: 0, visits: 0 },
    ],
    from,
    4
  );
  assert.deepEqual(filled.map((p) => [p.bucket.slice(11, 13), p.opens, p.clicks]), [["05", 2, 0], ["06", 0, 0], ["07", 4, 1], ["08", 0, 0]]);
  assert.equal(fillHours([], from, 0).length, 0);
  assert.equal(timelineHours(new Date("2026-11-11T00:00:00Z"), new Date("2026-11-11T02:00:00Z")), 24, "at least a day");
  assert.equal(timelineHours(new Date("2026-11-01T00:00:00Z"), new Date("2026-11-11T00:00:00Z")), 72, "at most 72 hours — day by day after that");
  assert.equal(timelineHours(new Date("2026-11-11T00:00:00Z"), new Date("2026-11-12T23:30:00Z")), 49);
});

test("comparison: each earlier campaign counts once, whatever its size; differences in points", () => {
  const current = { sent: 1000, delivered: 1000, opened: 400, clicked: 100, bounced: 10, unsubscribed: 2, complained: 0 };
  const earlier = [
    { sent: 100000, delivered: 100000, opened: 20000, clicked: 2000, bounced: 1000, unsubscribed: 100, complained: 10 },
    { sent: 100, delivered: 100, opened: 40, clicked: 10, bounced: 1, unsubscribed: 0, complained: 0 },
    { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0, complained: 0 },
  ];
  const c = compareWithEarlier(current, earlier);
  assert.equal(c.open.value, 0.4);
  assert.ok(Math.abs(c.open.average - 0.3) < 1e-9, "20% and 40% average to 30%; the unsent one is left out");
  assert.equal(c.open.points, 10);
  assert.equal(c.click.points, 4);
  assert.equal(c.clickToOpen.value, 0.25);
  const none = compareWithEarlier(current, []);
  assert.equal(none.open.average, null);
  assert.equal(none.open.points, null);
  const empty = compareWithEarlier({ sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0, complained: 0 }, earlier);
  assert.equal(empty.open.value, null);
});

test("sender health: healthy, watch, at risk", () => {
  assert.equal(senderHealth({ sent: 0, bounced: 0, complaints: 0 }).label, "Nothing sent yet");
  assert.equal(senderHealth({ sent: 10000, bounced: 150, complaints: 5 }).label, "Healthy");
  assert.equal(senderHealth({ sent: 10000, bounced: 300, complaints: 5 }).label, "Watch it");
  assert.equal(senderHealth({ sent: 10000, bounced: 100, complaints: 20 }).label, "Watch it");
  assert.equal(senderHealth({ sent: 10000, bounced: 600, complaints: 0 }).label, "At risk");
  assert.equal(senderHealth({ sent: 10000, bounced: 0, complaints: 40 }).label, "At risk", "over Gmail's 0.3%");
});

test("click map: links go nowhere, each tracked one carries its share, the pixel is gone", () => {
  const { html } = prepareCampaignHtml(
    '<html><body><p>Hi {{first_name|there}}</p><a href="https://hmarkconsultants.com/a" target="_blank">A</a><a href="https://example.org/b">B</a><a href="{{unsubscribe_url}}">Unsub</a></body></html>',
    { trackClicks: true, trackOpens: true }
  );
  const map = clickMapHtml(html, { first_name: "Ayesha", unsubscribe_url: "https://portal/test" }, { 1: { people: 12, share: "60.0%" } });
  assert.ok(!map.includes("%%HMARK"), "no marker left");
  assert.ok(!/href="https?:/.test(map), "no link goes anywhere");
  assert.ok(!map.includes("target="));
  assert.ok(map.includes('data-click-badge="1"') && map.includes("60.0% · 12"));
  assert.ok(map.includes('data-click-badge="2"') && /data-click-badge="2"[^>]*>0</.test(map), "a link nobody clicked shows 0");
  assert.ok(!map.includes('data-click-badge="3"'), "the unsubscribe link is not a tracked link");
  assert.ok(map.includes("Hi Ayesha"));
});
