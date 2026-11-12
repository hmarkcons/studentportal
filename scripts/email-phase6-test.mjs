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
