// The reports of 2026-11-18: consultancy fee, applications, universities and
// deadlines (src/lib/reports/*), and the documents report's new choices.
import test from "node:test";
import assert from "node:assert/strict";
import { buildFeeReport, feeCategory, overdueSince, parseFeeFilters } from "../src/lib/reports/consultancyFeeReport.ts";
import { appCategory, buildAppReport, parseAppFilters } from "../src/lib/reports/applicationsStatusReport.ts";
import { atLevel, buildDeadlinesReport, deadlineStatus, fieldsOf, parseDeadlinesFilters, REPORT_FIELDS } from "../src/lib/reports/universityDeadlinesReport.ts";
import { reportFileName, tableReportSheet } from "../src/lib/reports/tableReport.ts";
import { parseChecklistFilters, showOptions } from "../src/lib/documentChecklistReport.ts";

const meta = { preparedOn: "18 November 2026", preparedBy: "zztmp" };
const ITALY = ["documents_pending", "documents_verified", "application_submitted", "under_review", "acceptance_letter", "pre_enrolled"];

// ------------------------------------------------------------ consultancy fee

const fee = (over = {}) => ({
  studentId: "s", name: "zz", code: null, country: "Italy", intake: "Fall 2026", counsellor: null,
  withdrawn: false, invoiced: true, currency: "PKR", total: 1000, paid: 0, outstanding: 1000,
  instalmentsPaid: 0, instalmentsTotal: 2, nextDue: null, overdueSince: null, ...over,
});

test("a fee is withdrawn, paid in full, overdue or pending — in that order", () => {
  assert.equal(feeCategory(fee({ withdrawn: true, overdueSince: "2026-01-01" })), "withdrawn");
  assert.equal(feeCategory(fee({ outstanding: 0, paid: 1000 })), "paid_in_full");
  assert.equal(feeCategory(fee({ overdueSince: "2026-10-01" })), "overdue");
  assert.equal(feeCategory(fee({ paid: 400, outstanding: 600 })), "pending");
  // Never invoiced, or an invoice with nothing on it: not paid.
  assert.equal(feeCategory(fee({ invoiced: false, outstanding: 0, instalmentsTotal: 0 })), "pending");
  assert.equal(feeCategory(fee({ outstanding: 0, instalmentsTotal: 0 })), "pending");
});

test("overdue since: the earliest unpaid instalment due before today", () => {
  const today = "2026-11-18";
  assert.equal(overdueSince([{ status: "paid", due_date: "2026-01-01" }, { status: "pending", due_date: "2026-12-01" }], today), null);
  assert.equal(overdueSince([{ status: "partial", due_date: "2026-10-01" }, { status: "pending", due_date: "2026-09-01" }], today), "2026-09-01");
  assert.equal(overdueSince([{ status: "pending", due_date: today }], today), null);
});

test("the fee report shows the category chosen, counts them all, and adds what is owed per currency", () => {
  const rows = [
    fee({ studentId: "a", name: "Ali", outstanding: 0, paid: 1000 }),
    fee({ studentId: "b", name: "Bina", overdueSince: "2026-10-01", outstanding: 600, currency: "EUR" }),
    fee({ studentId: "c", name: "Chand", outstanding: 300 }),
    fee({ studentId: "d", name: "Dua", withdrawn: true }),
  ];
  const overdue = buildFeeReport(rows, parseFeeFilters(new URLSearchParams("category=overdue")), meta);
  assert.deepEqual(overdue.rows.map((r) => r.cells.student), ["Bina"]);
  assert.equal(overdue.rows[0].cells.status, "Payment overdue");
  assert.equal(overdue.summary.find((s) => s.label === "Paid in full").value, "1");
  assert.equal(overdue.summary.find((s) => s.label === "Still owed (EUR)").value, "EUR 600.00");
  const all = buildFeeReport(rows, parseFeeFilters(new URLSearchParams()), meta);
  assert.deepEqual(all.rows.map((r) => r.cells.student), ["Ali", "Bina", "Chand", "Dua"]);
  // A withdrawn student's balance is not counted as owed.
  assert.equal(all.summary.find((s) => s.label === "Still owed (PKR)").value, "PKR 300.00");
  assert.equal(parseFeeFilters(new URLSearchParams("category=nonsense")).category, "all");
});

// ------------------------------------------------------------ applications

const app = (over = {}) => ({
  id: "x", studentId: "11111111-1111-4111-8111-111111111111", studentName: "Ali", studentCode: "HMC-1", universityName: "Padova",
  programName: "MSc", level: "masters", country: "Italy", intake: "Fall 2026", roundLabel: null, deadline: null,
  stage: "documents_pending", pipeline: ITALY, createdAt: "2026-10-01T00:00:00Z", submittedAt: null, ...over,
});

test("an application's category: an offer or a later stage counts as submitted", () => {
  assert.equal(appCategory("documents_verified", ITALY), "pending");
  assert.equal(appCategory("application_submitted", ITALY), "submitted");
  assert.equal(appCategory("acceptance_letter", ITALY), "submitted");
  assert.equal(appCategory("rejected", ITALY), "rejected");
  assert.equal(appCategory("declined", ITALY), "not_eligible");
  assert.equal(appCategory("withdrawn", ITALY), "withdrawn");
});

test("the applications report: one student or all, by category, submitted first in submission order", () => {
  const other = "22222222-2222-4222-8222-222222222222";
  const rows = [
    app({ id: "1", stage: "application_submitted", submittedAt: "2026-11-10T00:00:00Z", universityName: "Late" }),
    app({ id: "2", stage: "under_review", submittedAt: "2026-11-01T00:00:00Z", universityName: "Early" }),
    app({ id: "3", stage: "documents_pending", universityName: "Waiting" }),
    app({ id: "4", stage: "rejected", universityName: "No" }),
    app({ id: "5", stage: "declined", universityName: "Ineligible" }),
    app({ id: "6", studentId: other, studentName: "Bina", stage: "application_submitted", universityName: "Hers" }),
  ];
  const submitted = buildAppReport(rows, parseAppFilters(new URLSearchParams("category=submitted")), { ...meta, studentLabel: null });
  assert.deepEqual(submitted.rows.map((r) => r.cells.university), ["Early", "Late", "Hers"]);
  const ali = buildAppReport(rows, parseAppFilters(new URLSearchParams(`student=11111111-1111-4111-8111-111111111111`)), { ...meta, studentLabel: "Ali · HMC-1" });
  assert.equal(ali.rows.length, 5);
  assert.ok(ali.rows.every((r) => r.group === "Ali · HMC-1"));
  assert.equal(ali.summary.find((s) => s.label === "Not eligible").value, "1");
  const notEligible = buildAppReport(rows, parseAppFilters(new URLSearchParams("category=not_eligible")), { ...meta, studentLabel: null });
  assert.deepEqual(notEligible.rows.map((r) => r.cells.university), ["Ineligible"]);
  assert.equal(parseAppFilters(new URLSearchParams("student=not-a-uuid")).student, "");
});

// ------------------------------------------------------------ universities and deadlines

const prog = (over = {}) => ({ id: "p", universityId: "u1", name: "Programme", level: "masters", fieldGroup: "other", coreField: null, rounds: [], ...over });

test("the office's ten fields, from the portal's field groups", () => {
  assert.equal(REPORT_FIELDS.length, 10);
  assert.deepEqual(fieldsOf(prog({ fieldGroup: "eng_mechanical", name: "Mechanical Engineering" })), ["engineering"]);
  assert.deepEqual(fieldsOf(prog({ fieldGroup: "eng_civil", name: "Environmental Engineering" })), ["engineering", "environmental_engineering"]);
  assert.deepEqual(fieldsOf(prog({ fieldGroup: "data_ai", name: "Data Science" })), ["cs_it"]);
  assert.deepEqual(fieldsOf(prog({ fieldGroup: "earth_environment", name: "Climate Change" })), ["environmental_engineering", "environmental_sciences"]);
  assert.deepEqual(fieldsOf(prog({ fieldGroup: "economics_finance", name: "Banking and Finance" })), ["business_finance"]);
  assert.deepEqual(fieldsOf(prog({ fieldGroup: "economics_finance", name: "Economics and Finance" })), ["economics", "business_finance"]);
  assert.deepEqual(fieldsOf(prog({ fieldGroup: "economics_finance", name: "Development Studies" })), ["economics"]);
  assert.deepEqual(fieldsOf(prog({ fieldGroup: "business", name: "MBA" })), ["business_management"]);
  assert.deepEqual(fieldsOf(prog({ fieldGroup: "physics", name: "Physics" })), ["natural_sciences"]);
  assert.deepEqual(fieldsOf(prog({ fieldGroup: "arts_media", name: "Media" })), ["arts_humanities"]);
  assert.deepEqual(fieldsOf(prog({ fieldGroup: "medicine", name: "Medicine" })), []);
});

test("level: Bachelors finds the usual spellings", () => {
  assert.equal(atLevel("Bachelor's", "bachelors"), true);
  assert.equal(atLevel("BSc", "bachelors"), true);
  assert.equal(atLevel("masters", "bachelors"), false);
  assert.equal(atLevel("Foundation", "all"), true);
  assert.equal(atLevel("Dottorato", "phd"), true);
});

test("a deadline is closed, closing soon, open — or words", () => {
  const today = "2026-11-18";
  assert.deepEqual(deadlineStatus({ deadline: "2026-11-01", deadlineText: null }, today), { label: "Closed", tone: "muted" });
  assert.deepEqual(deadlineStatus({ deadline: "2026-11-18", deadlineText: null }, today), { label: "Closes today", tone: "bad" });
  assert.deepEqual(deadlineStatus({ deadline: "2026-11-28", deadlineText: null }, today), { label: "Closes in 10 days", tone: "warn" });
  assert.deepEqual(deadlineStatus({ deadline: "2027-03-01", deadlineText: null }, today), { label: "Open", tone: "good" });
  assert.deepEqual(deadlineStatus({ deadline: null, deadlineText: "Rolling" }, today), { label: "Rolling", tone: null });
});

test("one programme only within one university", () => {
  const uni = "33333333-3333-4333-8333-333333333333";
  const p = "44444444-4444-4444-8444-444444444444";
  assert.equal(parseDeadlinesFilters(new URLSearchParams(`country=${uni}&programme=${p}`)).programme, "");
  assert.equal(parseDeadlinesFilters(new URLSearchParams(`country=${uni}&university=${uni}&programme=${p}`)).programme, p);
  assert.equal(parseDeadlinesFilters(new URLSearchParams(`country=${uni}&programme=all`)).programme, "all");
  assert.equal(parseDeadlinesFilters(new URLSearchParams(`country=${uni}&field=medicine&level=x`)).field, "");
});

test("no programme selection: each university's rounds once, with how many programmes share them", () => {
  const round = (label, deadline) => ({ label, deadline, startDate: "2027-09-01", startText: null, deadlineText: null, sortOrder: 1 });
  const input = {
    countryName: "Italy (Public)",
    universities: [{ id: "u1", name: "Padova", city: "Padova", type: "public" }, { id: "u2", name: "Bologna", city: null, type: "public" }],
    programmes: [
      prog({ id: "a", universityId: "u1", name: "Computer Science", fieldGroup: "computer_science", rounds: [round("Round 1", "2027-01-15")] }),
      prog({ id: "b", universityId: "u1", name: "Data Science", fieldGroup: "data_ai", rounds: [round("Round 1", "2027-01-15"), round("Round 2", "2027-04-30")] }),
      prog({ id: "c", universityId: "u1", name: "Medicine", fieldGroup: "medicine", level: "bachelors", rounds: [round("Round 1", "2027-02-01")] }),
      prog({ id: "d", universityId: "u2", name: "Economics", fieldGroup: "economics_finance", rounds: [] }),
    ],
  };
  const f = parseDeadlinesFilters(new URLSearchParams("country=55555555-5555-4555-8555-555555555555&field=cs_it"));
  const r = buildDeadlinesReport(input, f, { ...meta, today: "2026-11-18" });
  assert.deepEqual(r.rows.map((x) => [x.group, x.cells.round, x.cells.programmes]), [
    ["Padova · Padova · Public", "Round 1", "2 of 2"],
    ["Padova · Padova · Public", "Round 2", "1 of 2"],
  ]);
  const all = buildDeadlinesReport(input, { ...f, field: "", programme: "all", level: "masters" }, { ...meta, today: "2026-11-18" });
  assert.deepEqual(all.rows.map((x) => `${x.cells.programme} ${x.cells.round}`), ["Economics —", "Computer Science Round 1", "Data Science Round 1", "Data Science Round 2"]);
  const none = buildDeadlinesReport({ countryName: null, universities: [], programmes: [] }, parseDeadlinesFilters(new URLSearchParams()), { ...meta, today: "2026-11-18" });
  assert.equal(none.rows.length, 0);
  assert.match(none.empty, /Choose a country/);
});

// ------------------------------------------------------------ the shared table, and the documents report

test("a table report's workbook sheet and file name", () => {
  const report = { title: "Consultancy fee report", filters: "Payment overdue", preparedOn: "18 November 2026", preparedBy: null, summary: [{ label: "Shown", value: "1" }], columns: [{ key: "a", header: "A" }], rows: [{ group: "G", cells: { a: "x" }, tone: "bad" }], empty: "None." };
  const sheet = tableReportSheet(report);
  assert.equal(sheet.data[5][0].value, "Group");
  assert.equal(sheet.data[6][1].value, "x");
  assert.equal(reportFileName("Consultancy fee report", "2026-11-18", "pdf", "Payment overdue"), "Consultancy fee report - Payment overdue - 2026-11-18.pdf");
  assert.equal(reportFileName("A/B: c", "2026-11-18", "xlsx"), "A B c - 2026-11-18.xlsx");
});

test("the documents report takes Completed, Missing and Rejected", () => {
  assert.deepEqual(showOptions().map((o) => o.label), ["All registered students", "Documents completed", "Documents missing", "Documents rejected", "Students with documents left"]);
  assert.equal(parseChecklistFilters(new URLSearchParams("show=missing")).show, "missing");
  assert.equal(parseChecklistFilters(new URLSearchParams("show=rejected")).show, "rejected");
});
