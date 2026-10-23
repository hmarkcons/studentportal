import { test } from "node:test";
import assert from "node:assert/strict";
import { rollupStatus, backoffMinutes } from "../src/lib/social/publisher.ts";

test("a post's status rolls up from its targets", () => {
  assert.equal(rollupStatus(["published", "published"]), "published");
  assert.equal(rollupStatus(["failed", "failed"]), "failed");
  assert.equal(rollupStatus(["published", "failed"]), "partially_published");
  assert.equal(rollupStatus(["published", "pending"]), "publishing");
  assert.equal(rollupStatus(["publishing"]), "publishing");
  assert.equal(rollupStatus([]), "publishing");
});

test("retry backoff grows and is capped", () => {
  assert.equal(backoffMinutes(1), 1);
  assert.equal(backoffMinutes(2), 5);
  assert.equal(backoffMinutes(3), 15);
  assert.equal(backoffMinutes(4), 15); // capped
  assert.equal(backoffMinutes(0), 1); // clamped up
});
