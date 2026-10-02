// Payment receipts (0308): where each kind is stored, who handles it, and how
// a count is read back.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RECEIPT_COLUMN,
  RECEIPT_KINDS,
  RECEIPT_PERMISSION,
  RECEIPT_TABLE,
  isReceiptKind,
  receiptButtonLabel,
  receiptCount,
  receiptFileName,
  receiptPath,
} from "../src/lib/paymentReceipts.ts";

test("the five kinds, each with its table, column and permission", () => {
  assert.deepEqual([...RECEIPT_KINDS], ["installment", "staff_commission", "payroll", "refund", "referral"]);
  for (const k of RECEIPT_KINDS) {
    assert.ok(RECEIPT_TABLE[k] && RECEIPT_COLUMN[k] && RECEIPT_PERMISSION[k], k);
  }
  assert.equal(RECEIPT_PERMISSION.installment, "finance.invoices.manage");
  assert.equal(RECEIPT_PERMISSION.refund, "finance.refunds.review", "whoever processes a refund");
  assert.equal(RECEIPT_PERMISSION.payroll, RECEIPT_PERMISSION.staff_commission);
});

test("only the five are kinds", () => {
  assert.equal(isReceiptKind("refund"), true);
  assert.equal(isReceiptKind("invoice"), false);
  assert.equal(isReceiptKind(undefined), false);
});

test("a file name is made safe for a storage key, its extension kept", () => {
  assert.equal(receiptFileName("Bank slip (Oct).PDF"), "Bank-slip-Oct.PDF");
  assert.equal(receiptFileName("../../etc/passwd"), "etc-passwd");
  assert.equal(receiptFileName("رسید.jpg"), "receipt.jpg");
  assert.equal(receiptFileName(""), "receipt");
  assert.ok(receiptFileName(`${"x".repeat(300)}.png`).length <= 84);
});

test("a receipt is stored in its own payment's folder", () => {
  assert.equal(
    receiptPath("installment", "1b2c", "slip 1.pdf", "abc"),
    "payment-receipts/installment/1b2c/abc-slip-1.pdf"
  );
});

test("an embedded count is read back, whatever shape PostgREST gives it", () => {
  assert.equal(receiptCount([{ count: 2 }]), 2);
  assert.equal(receiptCount({ count: 3 }), 3);
  assert.equal(receiptCount([]), 0);
  assert.equal(receiptCount(null), 0);
});

test("the button says how many, or invites the first", () => {
  assert.equal(receiptButtonLabel(0), "+ Receipt");
  assert.equal(receiptButtonLabel(2), "Receipts (2)");
});
