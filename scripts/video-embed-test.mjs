// Unit tests for the Guide section's video-link parser.
//
// This one is worth a permanent test rather than a manual check: it is the
// boundary between a link a staff member pastes and an <iframe src> rendered
// inside the student portal. Getting it wrong once means either a broken
// player for every student, or an arbitrary page framed in the portal — so
// the refusals below matter at least as much as the successes.
//
// Imports src/lib/videoEmbed.ts directly: Node strips the types, so there is
// no build step and the test exercises exactly the module the app ships.
//
// Usage:
//   npm run test:unit

import test from "node:test";
import assert from "node:assert/strict";
import { parseVideoUrl, watchUrl } from "../src/lib/videoEmbed.ts";

const YT_ID = "aBcDeFgHiJ1";
const YT_EMBED = `https://www.youtube-nocookie.com/embed/${YT_ID}`;

test("accepts the YouTube link shapes staff actually paste", () => {
  for (const url of [
    `https://www.youtube.com/watch?v=${YT_ID}`,
    `https://youtube.com/watch?v=${YT_ID}`,
    `https://m.youtube.com/watch?v=${YT_ID}`,
    `https://youtu.be/${YT_ID}`,
    `https://www.youtube.com/embed/${YT_ID}`,
    `https://www.youtube.com/shorts/${YT_ID}`,
    `https://www.youtube.com/live/${YT_ID}`,
  ]) {
    const got = parseVideoUrl(url);
    assert.equal(got?.embedUrl, YT_EMBED, `expected an embed for ${url}`);
    assert.equal(got?.provider, "youtube");
    assert.equal(got?.videoId, YT_ID);
  }
});

test("ignores the extra query and hash a share link carries", () => {
  for (const url of [
    `https://www.youtube.com/watch?v=${YT_ID}&t=42s`,
    `https://www.youtube.com/watch?v=${YT_ID}&list=PLabc&index=3`,
    `https://youtu.be/${YT_ID}?si=trackingnonsense`,
    `https://www.youtube.com/watch?v=${YT_ID}#fragment`,
  ]) {
    assert.equal(parseVideoUrl(url)?.embedUrl, YT_EMBED, url);
  }
});

test("tolerates surrounding whitespace from a copy-paste", () => {
  assert.equal(parseVideoUrl(`  https://youtu.be/${YT_ID}\n`)?.embedUrl, YT_EMBED);
});

test("accepts Vimeo links", () => {
  assert.equal(parseVideoUrl("https://vimeo.com/123456789")?.embedUrl, "https://player.vimeo.com/video/123456789");
  assert.equal(parseVideoUrl("https://player.vimeo.com/video/123456789")?.provider, "vimeo");
  assert.equal(parseVideoUrl("https://vimeo.com/123456789/abcdef")?.videoId, "123456789");
});

// The important half. Anything here that returned a value would end up as an
// iframe src in the portal.
test("refuses a host that is not YouTube or Vimeo", () => {
  for (const url of [
    "https://evil.example.com/embed/whatever",
    "https://youtube.com.evil.example/watch?v=aBcDeFgHiJ1",
    "https://notyoutube.com/watch?v=aBcDeFgHiJ1",
    "https://vimeo.com.evil.example/123456789",
  ]) {
    assert.equal(parseVideoUrl(url), null, `should have refused ${url}`);
  }
});

test("refuses anything that is not https", () => {
  assert.equal(parseVideoUrl(`http://www.youtube.com/watch?v=${YT_ID}`), null);
  assert.equal(parseVideoUrl("javascript:alert(1)"), null);
  assert.equal(parseVideoUrl(`data:text/html,<script>alert(1)</script>`), null);
  assert.equal(parseVideoUrl(`//www.youtube.com/watch?v=${YT_ID}`), null);
});

test("refuses an id that is not the right shape", () => {
  assert.equal(parseVideoUrl("https://www.youtube.com/watch?v=short"), null);
  assert.equal(parseVideoUrl("https://www.youtube.com/watch?v=waytoolongforanid"), null);
  assert.equal(parseVideoUrl("https://www.youtube.com/watch?v=has spaces"), null);
  assert.equal(parseVideoUrl("https://www.youtube.com/watch?v=bad/slash!!"), null);
  assert.equal(parseVideoUrl("https://vimeo.com/notanumber"), null);
});

test("refuses empty and malformed input", () => {
  for (const url of ["", "   ", "not a url", "https://", "https://www.youtube.com/"]) {
    assert.equal(parseVideoUrl(url), null, JSON.stringify(url));
  }
  // The action passes whatever came off the form, which can be absent.
  assert.equal(parseVideoUrl(undefined), null);
  assert.equal(parseVideoUrl(null), null);
});

test("watchUrl points back at the provider's own page", () => {
  assert.equal(watchUrl({ provider: "youtube", videoId: YT_ID }), `https://www.youtube.com/watch?v=${YT_ID}`);
  assert.equal(watchUrl({ provider: "vimeo", videoId: "123456789" }), "https://vimeo.com/123456789");
});

test("every accepted embed URL is on a player host we chose", () => {
  const accepted = [
    `https://www.youtube.com/watch?v=${YT_ID}`,
    `https://youtu.be/${YT_ID}`,
    "https://vimeo.com/123456789",
  ].map((u) => parseVideoUrl(u));

  for (const embed of accepted) {
    assert.ok(embed, "expected a parse result");
    const host = new URL(embed.embedUrl).hostname;
    assert.ok(
      ["www.youtube-nocookie.com", "player.vimeo.com"].includes(host),
      `embed host ${host} is not one of ours`
    );
  }
});
