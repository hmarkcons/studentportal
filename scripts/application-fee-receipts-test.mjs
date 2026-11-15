// Receipts from universities (0365, 0366) — src/lib/applicationFeeReceipts.ts —
// and a university's specific requirements in Other (universityRequirements.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { FEE_RECEIPT_CATEGORY, FEE_RECEIPT_SECTION_LABEL, MAX_FEE_RECEIPTS_AT_ONCE, feeReceiptPath, isFeeReceiptPath, looksLikeReceipt, receiptEntryName } from "../src/lib/applicationFeeReceipts.ts";
import { CATEGORY_ORDER, CATEGORY_LABELS, sectionOfCategory } from "../src/lib/documentCategories.ts";
import { CATEGORIES_NOT_CARRIED } from "../src/lib/intakeCycle.ts";
import { planAutoStages } from "../src/lib/autoStages.ts";
import { keepUniversitiesTogether, universityRequirementName } from "../src/lib/universityRequirements.ts";

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

test("the Receipts - Universities section sits after the admission documents, under its own name", () => {
  const order = [...CATEGORY_ORDER];
  assert.ok(order.includes(FEE_RECEIPT_CATEGORY));
  assert.equal(order.indexOf(FEE_RECEIPT_CATEGORY), order.indexOf("admission") + 1);
  assert.equal(CATEGORY_LABELS[FEE_RECEIPT_CATEGORY], "Receipts - Universities");
  assert.equal(FEE_RECEIPT_SECTION_LABEL, CATEGORY_LABELS[FEE_RECEIPT_CATEGORY]);
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

test("an application's receipts are listed under its university's name", () => {
  assert.equal(receiptEntryName("University of Padova", "Application fee receipt"), "University of Padova");
  assert.equal(receiptEntryName("  ", "Application fee receipt"), "Application fee receipt");
  assert.equal(receiptEntryName(null, "Application fee receipt"), "Application fee receipt");
});

test("a name typed for a university's document says when it is a receipt", () => {
  // What was typed when a receipt and an invoice went to Acceptance Letters.
  for (const name of ["Padova App Fee Recceipt", "Padova App Invoice", "Application fee receipt", "Tuition fee receipt", "Payment confirmation", "Fee paid", "Ricevuta di pagamento", "Fattura", "Reciept"]) {
    assert.equal(looksLikeReceipt(name), true, name);
  }
  for (const name of ["Acceptance letter", "Offer letter", "Conditional offer letter", "CAS", "I-20", "Confirmation of enrolment (CoE)", "Pre-admission letter", "Letter of acceptance (LOA)"]) {
    assert.equal(looksLikeReceipt(name), false, name);
  }
});

test("several at once, but not without limit", () => {
  assert.ok(MAX_FEE_RECEIPTS_AT_ONCE >= 2);
  assert.ok(MAX_FEE_RECEIPTS_AT_ONCE <= 20);
});

// ------------------------------------------------ a university's specific requirements, in Other

test("a university's requirement is named with the university and the programme", () => {
  assert.equal(universityRequirementName("Motivation form", "University of Padova", "MSc Data Science"), "Motivation form — University of Padova — MSc Data Science");
  assert.equal(universityRequirementName("Motivation form", "University of Padova", null), "Motivation form — University of Padova");
  assert.equal(universityRequirementName("Motivation form", null, "  "), "Motivation form");
});

test("one university's documents stay together in Other, in the order they were added", () => {
  // Newest first, as the Documents pages read them.
  const docs = [
    { id: "padova-2", uni: "padova", created_at: "2026-11-15T10:00:00Z" },
    { id: "general-1", uni: null, created_at: "2026-11-15T09:00:00Z" },
    { id: "bologna-1", uni: "bologna", created_at: "2026-11-15T08:00:00Z" },
    { id: "padova-1", uni: "padova", created_at: "2026-11-15T07:00:00Z" },
    { id: "general-2", uni: null, created_at: "2026-11-15T06:00:00Z" },
    { id: "padova-3", uni: "padova", created_at: "2026-11-15T11:00:00Z" },
  ];
  const order = keepUniversitiesTogether(docs, (d) => d.uni).map((d) => d.id);
  assert.deepEqual(order, ["padova-1", "padova-2", "padova-3", "general-1", "bologna-1", "general-2"]);
});

test("nothing to group: the order is untouched", () => {
  const docs = [{ id: "a", created_at: "2" }, { id: "b", created_at: "1" }];
  assert.deepEqual(keepUniversitiesTogether(docs, () => null).map((d) => d.id), ["a", "b"]);
});
