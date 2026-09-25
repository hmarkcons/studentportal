import { test } from "node:test";
import assert from "node:assert/strict";
import {
  admissionDoneValue,
  admittedStage,
  canSetService,
  serviceOf,
  templateServiceError,
  templatesForService,
  withAdmissionStagesDone,
} from "../src/lib/serviceType.ts";
import { categorizeApplicationStage } from "../src/lib/applicationStage.ts";

// Italy's list, as 0101 seeds it.
const ITALY = [
  { key: "admission_docs", label: "Admission Docs", type: "checkbox", options: ["Completed"] },
  { key: "admission", label: "Admission", type: "select", options: ["In process", "Issued"] },
  { key: "university_and_program", label: "University & Program", type: "checkbox", options: ["Selection Finalized"] },
  { key: "visa_docs", label: "Visa Docs", type: "checkbox", options: ["Completed"] },
  { key: "visa_status", label: "Visa Status", type: "select", options: ["Granted", "Rejected"] },
];
const TODAY = "2026-09-25";

test("a visa-only student's admission stages are recorded as done, and only those", () => {
  const { values, changed } = withAdmissionStagesDone(ITALY, {}, TODAY);
  assert.equal(changed, true);
  assert.deepEqual(values, { admission_docs: "Completed", admission: "Issued", university_and_program: "Selection Finalized" });
});

test("anything already recorded is left as it was", () => {
  const { values, changed } = withAdmissionStagesDone(ITALY, { admission: "In process", visa_docs: "Completed" }, TODAY);
  assert.equal(values.admission, "In process");
  assert.equal(values.visa_docs, "Completed");
  assert.equal(changed, true, "the other two were still filled");
  assert.equal(withAdmissionStagesDone(ITALY, values, TODAY).changed, false);
});

test("'done' is the option that means done, and a date is today", () => {
  assert.equal(admissionDoneValue({ key: "admission", label: "", type: "select", options: ["Pending", "Received", "Rejected"] }, TODAY), "Received");
  assert.equal(admissionDoneValue({ key: "admission", label: "", type: "select", options: ["A", "B"] }, TODAY), "B", "no obvious one: the last");
  assert.equal(admissionDoneValue({ key: "admission_docs", label: "", type: "date", options: [] }, TODAY), TODAY);
  assert.equal(admissionDoneValue({ key: "admission_docs", label: "", type: "checkbox", options: [] }, TODAY), "Completed");
});

test("a destination with none of the standard admission stages is left alone", () => {
  const custom = [{ key: "tuition_fee", label: "Tuition Fee", type: "checkbox", options: ["Paid"] }];
  assert.equal(withAdmissionStagesDone(custom, {}, TODAY).changed, false);
});

test("a recorded admission puts the application where it counts as having an offer", () => {
  const italy = ["documents_pending", "documents_verified", "application_submitted", "under_review", "acceptance_letter"];
  assert.equal(admittedStage(italy), "acceptance_letter");
  const standard = ["documents_pending", "documents_verified", "application_submitted", "under_review", "conditional_offer_received", "unconditional_offer_received", "offer_accepted", "visa_filed"];
  assert.equal(admittedStage(standard), "offer_accepted");
  for (const list of [italy, standard]) assert.equal(categorizeApplicationStage(admittedStage(list), list), "with_offer");
  assert.equal(admittedStage(["a", "b"]), "b");
  assert.equal(admittedStage([]), null);
});

test("only Super Admin and processing may set the service", () => {
  assert.equal(canSetService({ role: "processing", roles: ["processing"] }), true);
  assert.equal(canSetService({ role: "super_admin" }), true);
  assert.equal(canSetService({ role: "counselor", roles: ["counselor", "processing"] }), true, "a second role counts");
  for (const r of ["counselor", "management", "finance", "marketing"]) assert.equal(canSetService({ role: r, roles: [r] }), false, r);
});

test("a visa-only student is offered visa-service templates only, and a template says why it does not fit", () => {
  const templates = [
    { id: "a", service_type: "full" },
    { id: "b", service_type: "visa_only" },
    { id: "c", service_type: null },
  ];
  assert.deepEqual(
    templatesForService(templates, "visa_only").map((t) => t.id),
    ["b"]
  );
  assert.deepEqual(
    templatesForService(templates, "full").map((t) => t.id),
    ["a", "c"],
    "an unmarked template is a full-service one"
  );
  assert.equal(templateServiceError("visa_only", "visa_only"), null);
  assert.match(templateServiceError("full", "visa_only"), /visa service only/);
  assert.match(templateServiceError("visa_only", "full"), /full service/);
  assert.equal(serviceOf("nonsense"), "full");
});

test("a visa-only schedule dates every installment, because there is no admission left to wait on", async () => {
  const { installmentDuePlan, missingDueDates } = await import("../src/lib/installmentDueConditions.ts");
  const dates = ["2026-10-01", "2026-11-01"];
  const visa = installmentDuePlan(2, "public", dates, { visaOnly: true });
  assert.deepEqual(
    visa.map((p) => [p.date, p.condition]),
    [["2026-10-01", null], ["2026-11-01", null]]
  );
  // The full service still waits on the admission for the last one, which is
  // what makes the visa-only branch the thing under test.
  const full = installmentDuePlan(2, "public", dates);
  assert.equal(full[1].date, null);
  assert.match(full[1].condition, /admission/i);
  // An undated visa-only installment is one Finance still has to date.
  assert.deepEqual(missingDueDates(installmentDuePlan(3, "private", ["2026-10-01"], { visaOnly: true })), [2, 3]);
});

test("the fee is named for the service on every document", async () => {
  const { SERVICE_FEE_NAME, SERVICE_FEE_TITLE, VISA_INVOICE_TERMS } = await import("../src/lib/serviceType.ts");
  assert.equal(SERVICE_FEE_NAME.full, "Consultancy fee");
  assert.match(SERVICE_FEE_NAME.visa_only, /^Visa documentation/);
  assert.match(SERVICE_FEE_TITLE.visa_only, /^Visa Documentation & Application Fee$/);
  // The visa terms must not promise the university-refusal refund the full
  // service carries: there is no university left to refuse them.
  assert.doesNotMatch(VISA_INVOICE_TERMS, /university/i);
  assert.match(VISA_INVOICE_TERMS, /non-refundable/);
});
