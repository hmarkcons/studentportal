import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize } from "../src/lib/social/analytics.ts";

test("empty input summarises to zeros", () => {
  const s = summarize([]);
  assert.deepEqual([s.totalPosts, s.totalPublished, s.totalEngagement], [0, 0, 0]);
  assert.deepEqual(s.perPlatform, []);
});

test("engagement totals, per-platform and per-country aggregate; top posts rank", () => {
  const posts = [
    { id: "a", caption: "big", country: "Germany", targets: [{ platform: "facebook", metrics: { likes: 10, comments: 5 } }, { platform: "instagram", metrics: { likes: 20 } }] },
    { id: "b", caption: "small", country: "Italy", targets: [{ platform: "facebook", metrics: { likes: 1 } }] },
    { id: "c", caption: "none yet", country: "Germany", targets: [{ platform: "tiktok", metrics: null }] },
  ];
  const s = summarize(posts);
  assert.equal(s.totalPublished, 3);
  assert.equal(s.totalEngagement, 36); // 15+20 + 1 + 0
  const fb = s.perPlatform.find((p) => p.platform === "facebook");
  assert.deepEqual([fb.posts, fb.engagement], [2, 16]);
  const tk = s.perPlatform.find((p) => p.platform === "tiktok");
  assert.equal(tk.metricsAvailable, false); // null metrics -> not available
  assert.deepEqual(s.perCountry[0], { country: "Germany", posts: 2 });
  assert.deepEqual(s.topPosts.map((p) => p.id), ["a", "b", "c"]); // 35, 1, 0
});
