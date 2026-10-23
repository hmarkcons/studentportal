import { test } from "node:test";
import assert from "node:assert/strict";
import { validateForPlatform, draftMediaKind } from "../src/lib/social/validate.ts";

const base = { caption: "Hello", link: null, media: [], options: {} };
const img = (n = 1, sizeBytes = 1000) => Array.from({ length: n }, () => ({ kind: "image", sizeBytes }));
const vid = (sizeBytes = 1000) => [{ kind: "video", sizeBytes }];

test("draftMediaKind classifies the media set", () => {
  assert.equal(draftMediaKind([]), "none");
  assert.equal(draftMediaKind(img(3)), "image");
  assert.equal(draftMediaKind(vid()), "video");
  assert.equal(draftMediaKind([...img(1), ...vid()]), "mixed");
});

test("text-only platforms accept a caption with no media; media-required ones don't", () => {
  // Threads, Facebook, LinkedIn allow text only.
  for (const p of ["threads", "facebook", "linkedin"]) {
    assert.deepEqual(validateForPlatform(p, base), [], `${p} should accept text-only`);
  }
  // Instagram, TikTok, Snapchat need media.
  for (const p of ["instagram", "tiktok", "snapchat"]) {
    assert.ok(validateForPlatform(p, base).some((e) => /text only|needs an image/.test(e)), `${p} should reject text-only`);
  }
});

test("caption length is enforced per platform", () => {
  const long = { ...base, caption: "x".repeat(600) };
  assert.ok(validateForPlatform("threads", long).some((e) => /too long/.test(e)), "Threads cap ~500");
  // Facebook's limit is huge, 600 chars is fine.
  assert.deepEqual(validateForPlatform("facebook", long), []);
});

test("Instagram needs a post type and caps carousels at 10", () => {
  const eleven = { ...base, media: img(11), options: {} };
  const errs = validateForPlatform("instagram", eleven);
  assert.ok(errs.some((e) => /up to 10 image/.test(e)), "carousel cap");
  assert.ok(errs.some((e) => /feed, reel or story/.test(e)), "ig type required");
  // With <=10 images and a type, it passes.
  assert.deepEqual(validateForPlatform("instagram", { ...base, media: img(3), options: { igType: "feed" } }), []);
});

test("TikTok needs a privacy level; Snapchat needs a destination", () => {
  assert.ok(validateForPlatform("tiktok", { ...base, media: vid() }).some((e) => /privacy level/.test(e)));
  assert.deepEqual(validateForPlatform("tiktok", { ...base, media: vid(), options: { privacy: "public" } }), []);
  assert.ok(validateForPlatform("snapchat", { ...base, media: vid() }).some((e) => /destination/.test(e)));
  assert.deepEqual(validateForPlatform("snapchat", { ...base, media: vid(), options: { destination: "story" } }), []);
});

test("images and a video can't be mixed", () => {
  assert.ok(validateForPlatform("facebook", { ...base, media: [...img(1), ...vid()] }).some((e) => /not both/.test(e)));
});

test("oversized media is rejected", () => {
  // Instagram image limit is 8 MB.
  const huge = { ...base, media: [{ kind: "image", sizeBytes: 20 * 1024 * 1024 }], options: { igType: "feed" } };
  assert.ok(validateForPlatform("instagram", huge).some((e) => /MB limit/.test(e)));
});
