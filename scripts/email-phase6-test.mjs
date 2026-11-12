// Email campaigns, Phase 6 (0361 onwards): content blocks, the built-in spam
// check, and resend to non-openers' audience.
//
// What these guard against: a block tag left in a sent email, a block that
// carries a script or nests another block, a spam check that flags a clean
// HMARK email or misses a link that hides where it goes, and a resend whose
// stored audience is lost or forged.
import test from "node:test";
import assert from "node:assert/strict";
import { blockKeyOf, blocksIn, cleanBlockHtml, expandBlocks } from "../src/lib/emailCampaigns/contentBlocks.ts";
import { spamCheck } from "../src/lib/emailCampaigns/spamCheck.ts";

// ---- content blocks -----------------------------------------------------------

test("blocks: found, put in, the missing ones listed and left", () => {
  const html = "<p>{{block:header}}</p><p>Hi {{first_name}}</p>{{ block:Footer }}{{block:header}}{{block:gone}}";
  assert.deepEqual(blocksIn(html), ["header", "footer", "gone"]);
  const out = expandBlocks(html, { header: "<h1>HMARK</h1>", footer: "<footer>Karachi</footer>" });
  assert.equal(out.html, "<p><h1>HMARK</h1></p><p>Hi {{first_name}}</p><footer>Karachi</footer><h1>HMARK</h1>{{block:gone}}");
  assert.deepEqual(out.missing, ["gone"]);
  assert.deepEqual(expandBlocks("<p>none</p>", {}), { html: "<p>none</p>", missing: [] });
});

test("blocks: keys from names", () => {
  assert.equal(blockKeyOf("Footer — social icons!"), "footer_social_icons");
  assert.equal(blockKeyOf("Università"), "universita");
  assert.equal(blockKeyOf("!!!"), "");
});

test("blocks: cleaned of what an email cannot carry, and of blocks inside", () => {
  const { html, removed } = cleanBlockHtml(
    '<div onclick="steal()"><a href="javascript:alert(1)">x</a><script>alert(2)</script><iframe src="https://x"></iframe><form><input></form><a href="https://hmarkconsultants.com">ok</a>{{block:other}}</div>'
  );
  assert.ok(!/onclick|javascript:|<script|<iframe|<form|<input/i.test(html), html);
  assert.ok(html.includes('href="https://hmarkconsultants.com"'));
  assert.ok(!html.includes("{{block:"), "no block inside a block");
  for (const what of ["scripts", "embedded frames", "forms", "click and other event handlers", "javascript: links", "a block inside the block"]) assert.ok(removed.includes(what), what);
  assert.deepEqual(cleanBlockHtml("<p>Plain <b>footer</b></p>"), { html: "<p>Plain <b>footer</b></p>", removed: [] });
});

// ---- the spam check -------------------------------------------------------------

const CLEAN = `<html><body>
<h1>Study in Italy with a scholarship</h1>
<p>Dear Ayesha, Italian public universities have opened applications for September 2027. Many charge low fees and offer regional scholarships that cover tuition and living costs for students from Pakistan.</p>
<p>Your counsellor can check which programmes fit your degree and help you prepare the documents.</p>
<p><a href="https://hmarkconsultants.com/study-in-italy">Read about studying in Italy</a></p>
<img src="https://portal.hmarkconsultants.com/logo.png" alt="HMARK">
</body></html>`;

test("spam: a plain, honest HMARK email scores low", () => {
  const r = spamCheck({ subject: "Italy scholarships are open for September 2027", preheader: "Low fees and regional grants", html: CLEAN, text: "Study in Italy" });
  assert.equal(r.level, "low");
  assert.equal(r.score, 0, JSON.stringify(r.findings));
});

test("spam: shouting, money and urgency in the subject", () => {
  const r = spamCheck({ subject: "URGENT!!! GUARANTEED VISA — ACT NOW", html: CLEAN, text: "x" });
  const whats = r.findings.map((f) => f.what).join(" | ");
  assert.match(whats, /CAPITAL LETTERS/);
  assert.match(whats, /more than one exclamation/);
  assert.match(whats, /“urgent”/);
  assert.match(whats, /“guaranteed”/);
  assert.match(whats, /“act now”/);
  assert.ok(r.score >= 5, String(r.score));
  assert.equal(r.level, "high");
  assert.ok(r.findings.every((f) => f.fix.length > 0), "every finding says how to fix it");
});

test("spam: a fake reply and a word inside another word", () => {
  assert.match(spamCheck({ subject: "RE: your application", html: CLEAN, text: "x" }).findings.map((f) => f.what).join(), /RE: or FW:/);
  // "winner" inside "winners'"? A whole phrase only: "breadwinner" is not "winner".
  assert.equal(spamCheck({ subject: "A note for every breadwinner's family", html: CLEAN, text: "x" }).score, 0);
});

test("spam: all pictures, no text version, shorteners, bare IPs and links that hide where they go", () => {
  const html = `<body><img src="https://x.com/a.png"><a href="https://bit.ly/abc">here</a><a href="http://203.0.113.9/x">x</a>
  <a href="https://evil.example.net/login">hmarkconsultants.com/apply</a><a href="https://www.hmarkconsultants.com/a">hmarkconsultants.com</a></body>`;
  const r = spamCheck({ subject: "Your application", html, text: "" });
  const whats = r.findings.map((f) => f.what).join(" | ");
  assert.match(whats, /almost all pictures/);
  assert.match(whats, /no plain-text version/);
  assert.match(whats, /link shortener/);
  assert.match(whats, /bare IP address/);
  assert.match(whats, /shows one website but goes to another/);
  assert.match(whats, /not https/);
  assert.equal(r.level, "high");
  assert.ok(r.score <= 10);
  // The www. link showing its own site is not misleading on its own.
  const honest = spamCheck({ subject: "Your application", html: CLEAN.replace("Read about studying in Italy", "hmarkconsultants.com"), text: "x" });
  assert.ok(!honest.findings.some((f) => /shows one website/.test(f.what)));
});

// ---- engagement, best hours, the sunset (0362) ------------------------------------

import { didWhat, engagementLevel, HOT_SCORE, nextBestHour, peakWindow, sunsetSuppressDue, WARM_SCORE } from "../src/lib/emailCampaigns/engagement.ts";

test("engagement: levels and what they did", () => {
  assert.equal(engagementLevel(HOT_SCORE), "hot");
  assert.equal(engagementLevel(HOT_SCORE - 0.1), "warm");
  assert.equal(engagementLevel(WARM_SCORE), "warm");
  assert.equal(engagementLevel(WARM_SCORE - 0.1), "cold");
  assert.equal(engagementLevel(null), "cold");
  assert.equal(didWhat({ opened: 3, clicked: 1, visited: 1, converted: 0 }), "opened 3, clicked 1, visited the website");
  assert.equal(didWhat({ opened: 1, clicked: 0, visited: 2, converted: 2 }), "opened 1, visited the website 2 times, enquired 2 times");
});

test("best hour: the next time that Karachi hour begins, within a day; now if we are in it", () => {
  const at = new Date("2026-11-13T05:30:00Z"); // 10:30 Karachi
  assert.equal(nextBestHour(at, 20).toISOString(), "2026-11-13T15:00:00.000Z", "20:00 today");
  assert.equal(nextBestHour(at, 9).toISOString(), "2026-11-14T04:00:00.000Z", "09:00 tomorrow");
  assert.equal(nextBestHour(at, 10).toISOString(), at.toISOString(), "in that hour already: now");
  assert.equal(nextBestHour(new Date("2026-11-13T18:59:00Z"), 0).toISOString(), "2026-11-13T19:00:00.000Z", "midnight Karachi");
  for (let h = 0; h < 24; h++) {
    const t = nextBestHour(at, h).getTime() - at.getTime();
    assert.ok(t >= 0 && t < 86_400_000, `hour ${h}`);
  }
});

test("peak hours: the busiest two hours, wrapping past midnight; none with too few opens", () => {
  const hours = [
    { hour: 23, opens: 30 },
    { hour: 0, opens: 25 },
    { hour: 9, opens: 10 },
    { hour: 20, opens: 20 },
  ];
  assert.deepEqual(peakWindow(hours), { from: 23, to: 1, share: 55 / 85 });
  assert.equal(peakWindow([{ hour: 9, opens: 5 }]), null);
});

test("sunset: step two falls due once the email has finished and the grace period passed", () => {
  const now = new Date("2026-12-20T00:00:00Z");
  assert.deepEqual(sunsetSuppressDue({ finishedAt: null, graceDays: 30, now }), { due: false, on: null });
  assert.equal(sunsetSuppressDue({ finishedAt: "2026-11-01T00:00:00Z", graceDays: 30, now }).due, true);
  const notYet = sunsetSuppressDue({ finishedAt: "2026-12-01T00:00:00Z", graceDays: 30, now });
  assert.equal(notYet.due, false);
  assert.equal(notYet.on.toISOString(), "2026-12-31T00:00:00.000Z");
});

// ---- A/B tests (0363) ------------------------------------------------------------

import { AB_MIN_AUDIENCE, abProblems, pickWinner, splitForTest } from "../src/lib/emailCampaigns/abTest.ts";

test("A/B: the test group is the share asked for, half each, the rest held; repeatable, and different per campaign", () => {
  const people = Array.from({ length: 1000 }, (_, i) => `p${i}@x.com`);
  const s = splitForTest(people, { seed: "camp-1", percent: 20 });
  assert.equal(s.A.length, 100);
  assert.equal(s.B.length, 100);
  assert.equal(s.held.length, 800);
  assert.equal(new Set([...s.A, ...s.B, ...s.held]).size, 1000, "everyone exactly once");
  assert.deepEqual(splitForTest(people, { seed: "camp-1", percent: 20 }), s, "the same campaign splits the same way");
  assert.notDeepEqual(splitForTest(people, { seed: "camp-2", percent: 20 }).A, s.A, "another campaign, another split");
  const small = splitForTest(["a", "b", "c"], { seed: "x", percent: 10 });
  assert.equal(small.A.length + small.B.length, 2, "at least one each");
});

test("A/B: the winner by opens or clicks, as a share of each version's sends; a tie keeps A", () => {
  const stats = [
    { variant: "A", sent: 100, opened: 30, clicked: 2 },
    { variant: "B", sent: 90, opened: 30, clicked: 6 },
  ];
  assert.equal(pickWinner(stats, "opens").winner, "B", "30/90 beats 30/100");
  assert.equal(pickWinner(stats, "clicks").winner, "B");
  assert.equal(pickWinner([{ variant: "A", sent: 50, opened: 10, clicked: 1 }, { variant: "B", sent: 50, opened: 10, clicked: 1 }], "opens").winner, "A");
  assert.equal(pickWinner([], "opens").winner, "A", "nothing to go on keeps A");
});

test("A/B: what stops it, in words", () => {
  const base = { ab_enabled: true, subject: "Italy", template_version_id: "v1", ab_subject_b: "Italy now", ab_template_version_id_b: null };
  assert.deepEqual(abProblems(base, 100), []);
  assert.deepEqual(abProblems({ ...base, ab_enabled: false, ab_subject_b: null }, 5), [], "off: nothing to check");
  assert.match(abProblems({ ...base, ab_subject_b: null }, 100).join(), /its own subject line or template/);
  assert.match(abProblems({ ...base, ab_subject_b: "Italy" }, 100).join(), /the same as version A/);
  assert.deepEqual(abProblems({ ...base, ab_subject_b: null, ab_template_version_id_b: "v2" }, 100), [], "another template is a test too");
  assert.match(abProblems({ ...base, spread_hours: 3 }, 100).join(), /spread over hours/);
  assert.match(abProblems({ ...base, send_at_best_hour: true }, 100).join(), /each person's hour/);
  assert.match(abProblems(base, AB_MIN_AUDIENCE - 1).join(), new RegExp(`at least ${AB_MIN_AUDIENCE} people`));
});
