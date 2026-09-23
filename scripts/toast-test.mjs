import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_TOASTS, currentToasts, dismissToast, subscribeToasts, toast } from "../src/lib/toast.ts";

const clear = () => currentToasts().forEach((t) => dismissToast(t.id));

test("a toast is shown to whoever is listening", () => {
  clear();
  const seen = [];
  const stop = subscribeToasts((list) => seen.push(list.map((t) => t.message)));
  toast("Deleted.");
  stop();
  assert.deepEqual(seen.at(-1), ["Deleted."]);
});

test("the same message again restarts rather than stacking", () => {
  // Deleting three rows in a row should read "Deleted.", not three of them.
  clear();
  toast("Deleted.");
  toast("Deleted.");
  assert.equal(currentToasts().length, 1);
});

test("a burst keeps only the newest few", () => {
  clear();
  for (let i = 0; i < MAX_TOASTS + 2; i++) toast(`Removed ${i}.`);
  assert.equal(currentToasts().length, MAX_TOASTS);
  assert.equal(currentToasts().at(-1).message, `Removed ${MAX_TOASTS + 1}.`);
});

test("an empty message shows nothing", () => {
  clear();
  assert.equal(toast("   "), 0);
  assert.equal(currentToasts().length, 0);
});

test("dismissing removes only that toast", () => {
  clear();
  const a = toast("Deleted.");
  toast("Sent.");
  dismissToast(a);
  assert.deepEqual(currentToasts().map((t) => t.message), ["Sent."]);
});
