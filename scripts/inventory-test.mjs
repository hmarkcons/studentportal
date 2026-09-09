import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INVENTORY_REQUEST_STATUSES,
  INVENTORY_REQUEST_STATUS_LABELS,
  INVENTORY_REQUEST_STATUS_TONE,
  inventoryRequestStatusLabel,
  requestQuantityError,
  stockQuantityError,
  thresholdError,
  isLowStock,
} from "../src/lib/inventory.ts";

test("the statuses match the database CHECK constraint", () => {
  assert.deepEqual([...INVENTORY_REQUEST_STATUSES].sort(), ["fulfilled", "pending", "rejected"]);
});

test("every status has a label and a tone, and none is shown raw", () => {
  for (const s of INVENTORY_REQUEST_STATUSES) {
    assert.ok(INVENTORY_REQUEST_STATUS_LABELS[s], s);
    assert.ok(INVENTORY_REQUEST_STATUS_TONE[s], s);
  }
  assert.equal(INVENTORY_REQUEST_STATUS_LABELS.pending, "Awaiting decision");
});

test("an unrecognised status still renders", () => {
  assert.equal(inventoryRequestStatusLabel("cancelled"), "cancelled");
});

// The one that mattered: a negative request quantity was accepted, and
// fulfilling it ADDED to stock (verified on production: 10 became 15).
test("a negative request quantity is refused, and the message says why", () => {
  const err = requestQuantityError("-5");
  assert.match(err ?? "", /at least one/);
  assert.match(err ?? "", /add to stock/);
});

test("zero is refused too", () => {
  assert.match(requestQuantityError("0") ?? "", /at least one/);
});

test("a blank or non-numeric quantity is refused", () => {
  assert.match(requestQuantityError("") ?? "", /how many/);
  assert.match(requestQuantityError(null) ?? "", /how many/);
  assert.match(requestQuantityError("a few") ?? "", /not a number/);
});

test("a fractional request is refused — units are whole things", () => {
  assert.match(requestQuantityError("2.5") ?? "", /whole number/);
});

test("an ordinary request passes", () => {
  for (const good of ["1", "5", "100", " 7 "]) assert.equal(requestQuantityError(good), null, good);
});

test("negative stock is refused", () => {
  assert.match(stockQuantityError("-1") ?? "", /cannot be negative/);
});

test("blank stock is fine — the column defaults to zero", () => {
  assert.equal(stockQuantityError(""), null);
  assert.equal(stockQuantityError(null), null);
  assert.equal(stockQuantityError("0"), null);
});

// "Tea Bags" was on file with a threshold of -1, which could never fire.
test("a negative threshold is refused, and points at the way to say 'never warn'", () => {
  const err = thresholdError("-1");
  assert.match(err ?? "", /never be reached/);
  assert.match(err ?? "", /blank/);
});

test("a blank threshold is how the warning is turned off", () => {
  assert.equal(thresholdError(""), null);
  assert.equal(thresholdError(null), null);
  assert.equal(isLowStock(0, null), false, "no threshold means never low, even at zero stock");
});

test("zero is a legitimate threshold — warn me when it runs out", () => {
  assert.equal(thresholdError("0"), null);
  assert.equal(isLowStock(0, 0), true);
  assert.equal(isLowStock(1, 0), false);
});

test("low stock fires at and below the threshold", () => {
  assert.equal(isLowStock(3, 2), false);
  assert.equal(isLowStock(2, 2), true);
  assert.equal(isLowStock(1, 2), true);
});
