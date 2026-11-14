// Application fee receipts (0365): src/lib/applicationFeeReceipts.ts, and what
// the rest of the documents code must do with them.
import test from "node:test";
import assert from "node:assert/strict";
import { FEE_RECEIPT_CATEGORY, MAX_FEE_RECEIPTS_AT_ONCE, feeReceiptPath, isFeeReceiptPath } from "../src/lib/applicationFeeReceipts.ts";
import { CATEGORY_ORDER, CATEGORY_LABELS, sectionOfCategory } from "../src/lib/documentCategories.ts";
import { CATEGORIES_NOT_CARRIED } from "../src/lib/intakeCycle.ts";
import { planAutoStages } from "../src/lib/autoStages.ts";

const STUDENT = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const APP = "0a1b2c3d-4e5f-4061-8728-394a5b6c7d8e";

test("a receipt is stored where the storage policies look: <student>/fee-receipts/<application>/", () => {
  const path = feeReceiptPath(STUDENT, APP, "receipt.pdf", "ab12cd34");
  assert.equal(path, `${STUDENT}/fee-receipts/${APP}/ab12cd34/receipt.pdf`);
  // storage.foldername(name): [1] the student, [2] 'fee-receipts', [3] the application.
  const folders = path.split("/").slice(0, -1);
  assert.deepEqual(folders.slice(0, 3), [STUDENT, "fee-receipts", APP]);
  // add_student_document_file refuses a file outside the student's folder.
  assert.ok(path.startsWith(`${STUDENT}/`));
});

test("two receipts with the same name are kept apart by their tags", () => {
  assert.notEqual(feeReceiptPath(STUDENT, APP, "receipt.pdf", "aaaa1111"), feeReceiptPath(STUDENT, APP, "receipt.pdf", "bbbb2222"));
});

test("isFeeReceiptPath knows the receipts' folder from any other document's", () => {
  assert.equal(isFeeReceiptPath(feeReceiptPath(STUDENT, APP, "r.pdf", "t")), true);
  assert.equal(isFeeReceiptPath(`${STUDENT}/passport.pdf`), false);
  assert.equal(isFeeReceiptPath(`${STUDENT}/university/${APP}/letter.pdf`), false);
  assert.equal(isFeeReceiptPath(`fee-receipts/${APP}/r.pdf`), false);
  assert.equal(isFeeReceiptPath(null), false);
  assert.equal(isFeeReceiptPath(undefined), false);
});

test("the Application Fee section sits after the admission documents, under its own name", () => {
  const order = [...CATEGORY_ORDER];
  assert.ok(order.includes(FEE_RECEIPT_CATEGORY));
  assert.equal(order.indexOf(FEE_RECEIPT_CATEGORY), order.indexOf("admission") + 1);
  assert.equal(CATEGORY_LABELS[FEE_RECEIPT_CATEGORY], "Application Fee");
  assert.equal(sectionOfCategory(FEE_RECEIPT_CATEGORY), FEE_RECEIPT_CATEGORY);
});

test("receipts are not carried into a new intake: they belong to the application they paid for", () => {
  assert.ok(CATEGORIES_NOT_CARRIED.includes(FEE_RECEIPT_CATEGORY));
});

test("a receipt, filed approved, does not make an application's documents look complete", () => {
  const ITALY_PIPELINE = ["documents_pending", "documents_verified", "application_submitted", "under_review", "acceptance_letter"];
  const input = (documents) => ({
    countries: [{ destinationId: "it", stages: [], values: {} }],
    applications: [{ id: "a1", destinationId: "it", stage: "documents_pending", pipeline: ITALY_PIPELINE, finalized: false }],
    documents,
    trackers: [],
  });
  const to = (plan) => plan.applications.find((a) => a.id === "a1")?.to ?? null;

  // Only a receipt: nothing of the student's is in yet.
  assert.equal(to(planAutoStages(input([{ category: FEE_RECEIPT_CATEGORY, status: "verified", applicationId: "a1" }]))), null);
  // A receipt beside an admission document still missing: still nothing.
  assert.equal(
    to(planAutoStages(input([
      { category: FEE_RECEIPT_CATEGORY, status: "verified", applicationId: "a1" },
      { category: "admission", status: "missing", applicationId: null },
    ]))),
    null
  );
  // And it does not hold one back that is otherwise complete.
  assert.equal(
    to(planAutoStages(input([
      { category: FEE_RECEIPT_CATEGORY, status: "verified", applicationId: "a1" },
      { category: "admission", status: "verified", applicationId: null },
    ]))),
    "documents_verified"
  );
});

test("several at once, but not without limit", () => {
  assert.ok(MAX_FEE_RECEIPTS_AT_ONCE >= 2);
  assert.ok(MAX_FEE_RECEIPTS_AT_ONCE <= 20);
});
