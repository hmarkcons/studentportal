import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildChecklistReport,
  checklistQuery,
  checklistState,
  countDocs,
  describeFilters,
  groupIntoSections,
  parseChecklistFilters,
  percentDone,
  DEFAULT_FILTERS,
} from "../src/lib/documentChecklistReport.ts";
import { checklistWorkbookSheets } from "../src/lib/documentChecklistWorkbook.ts";
import { checklistSectionsFor } from "../src/lib/studentChecklistSections.ts";
import { pickCycleDocuments } from "../src/lib/studentCycleDocuments.ts";
import { REPORT_CATALOGUE, visibleReports } from "../src/lib/reportsCatalogue.ts";

const OFFICER = "11111111-1111-4111-8111-111111111111";
const OTHER_OFFICER = "22222222-2222-4222-8222-222222222222";
const ITALY = "33333333-3333-4333-8333-333333333333";
const GERMANY = "44444444-4444-4444-8444-444444444444";

const SECTIONS = [
  { key: "admission", label: "Admission Documents" },
  { key: "acceptance_letters", label: "Acceptance Letters" },
  { key: "visa", label: "Visa Application Requirements" },
];

let n = 0;
function doc(studentId, status, extra = {}) {
  n++;
  return {
    id: `d${n}`,
    studentId,
    name: `Doc ${n}`,
    category: "admission",
    status,
    uploadedAt: null,
    verifiedAt: null,
    rejectedReason: null,
    deadline: null,
    carriedFrom: null,
    ...extra,
  };
}

function student(id, name, extra = {}) {
  return { id, name, code: `HMC-${id}`, intake: "Fall 2027", officerId: OFFICER, countries: [{ id: ITALY, name: "Italy (Public)" }], ...extra };
}

function build(students, docs, filters = DEFAULT_FILTERS, today = "2026-11-02") {
  return buildChecklistReport({
    students,
    docs,
    sectionsByStudent: new Map(students.map((s) => [s.id, SECTIONS])),
    officerNames: new Map([
      [OFFICER, "Imran Ali"],
      [OTHER_OFFICER, "Sara Khan"],
    ]),
    filters,
    today,
  });
}

// ------------------------------------------------------------------ statuses

test("only an approved document is done; uploaded is waiting for review; unknown is owed", () => {
  assert.equal(checklistState("verified"), "approved");
  assert.equal(checklistState("submitted"), "review");
  assert.equal(checklistState("under_review"), "review");
  assert.equal(checklistState("missing"), "missing");
  assert.equal(checklistState("rejected"), "sent_back");
  assert.equal(checklistState("something new"), "missing");
  assert.equal(checklistState(null), "missing");
});

test("counts: left is missing plus sent back, and review is counted on its own", () => {
  const c = countDocs([{ state: "approved" }, { state: "review" }, { state: "missing" }, { state: "missing" }, { state: "sent_back" }]);
  assert.deepEqual(c, { total: 5, approved: 1, review: 1, missing: 2, sentBack: 1, left: 3 });
});

test("the share approved rounds down, so 100% means every document", () => {
  assert.equal(percentDone({ total: 43, approved: 42 }), 97);
  assert.equal(percentDone({ total: 3, approved: 3 }), 100);
  assert.equal(percentDone({ total: 3, approved: 0 }), 0);
  assert.equal(percentDone({ total: 0, approved: 0 }), null);
});

// ------------------------------------------------------------------ sections

test("documents fall into the student's sections in order; empty ones are left out", () => {
  const docs = [
    { ...doc("s", "missing"), state: "missing", category: "visa" },
    { ...doc("s", "verified"), state: "approved", category: "admission" },
  ];
  const out = groupIntoSections(docs, SECTIONS);
  assert.deepEqual(
    out.map((s) => s.key),
    ["admission", "visa"]
  );
  assert.equal(out[0].counts.approved, 1);
  assert.ok(!("category" in out[0].docs[0]), "the category is not carried into the output");
});

test("an offer letter is filed under Acceptance Letters, as the Documents tab files it", () => {
  const out = groupIntoSections([{ ...doc("s", "missing"), state: "missing", category: "offer_letter" }], SECTIONS);
  assert.equal(out[0].key, "acceptance_letters");
});

test("a document in a section the student does not carry is kept, under Other", () => {
  const out = groupIntoSections(
    [
      { ...doc("s", "missing"), state: "missing", category: "italian_translations" },
      { ...doc("s", "missing"), state: "missing", category: null },
    ],
    SECTIONS
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].key, "other");
  assert.equal(out[0].docs.length, 2);
});

test("within a section, what is owed comes first, and the tab's order holds inside each status", () => {
  const rows = [
    { ...doc("s", "verified"), state: "approved", name: "A approved" },
    { ...doc("s", "missing"), state: "missing", name: "B missing" },
    { ...doc("s", "submitted"), state: "review", name: "C review" },
    { ...doc("s", "rejected"), state: "sent_back", name: "D sent back" },
    { ...doc("s", "missing"), state: "missing", name: "E missing" },
  ];
  const out = groupIntoSections(rows, SECTIONS);
  assert.deepEqual(
    out[0].docs.map((d) => d.name),
    ["D sent back", "B missing", "E missing", "C review", "A approved"]
  );
});

// ------------------------------------------------------------------ the report

test("each student gets their counts, percentage and officer's name", () => {
  const r = build([student("a", "Ali")], [doc("a", "verified"), doc("a", "missing"), doc("a", "rejected", { rejectedReason: " Blurry " })]);
  const s = r.students[0];
  assert.equal(s.officer, "Imran Ali");
  assert.deepEqual(s.counts, { total: 3, approved: 1, review: 0, missing: 1, sentBack: 1, left: 2 });
  assert.equal(s.percent, 33);
  const sentBack = s.sections[0].docs.find((d) => d.state === "sent_back");
  assert.equal(sentBack.reason, "Blurry");
});

test("a sent-back reason is only kept for a document that is sent back now", () => {
  const r = build([student("a", "Ali")], [doc("a", "verified", { rejectedReason: "old reason" })]);
  assert.equal(r.students[0].sections[0].docs[0].reason, null);
});

test("a deadline that has passed is overdue unless the document is approved", () => {
  const r = build(
    [student("a", "Ali")],
    [doc("a", "missing", { deadline: "2026-11-01" }), doc("a", "verified", { deadline: "2026-11-01" }), doc("a", "missing", { deadline: "2026-11-02" })]
  );
  const docs = r.students[0].sections[0].docs;
  assert.deepEqual(
    docs.map((d) => d.overdue),
    [true, false, false]
  );
});

test("totals add up across the students shown, and a student with nothing is counted as having no checklist", () => {
  const r = build([student("a", "Ali"), student("b", "Bano"), student("c", "Chand")], [doc("a", "verified"), doc("a", "missing"), doc("b", "verified")]);
  assert.equal(r.totals.students, 3);
  assert.equal(r.totals.total, 3);
  assert.equal(r.totals.approved, 2);
  assert.equal(r.totals.left, 1);
  assert.equal(r.totals.complete, 1, "Bano has every document approved");
  assert.equal(r.totals.noChecklist, 1, "Chand has none");
  assert.equal(r.totals.percent, 66);
});

test("filters: one officer, no officer, one destination", () => {
  const students = [
    student("a", "Ali"),
    student("b", "Bano", { officerId: OTHER_OFFICER, countries: [{ id: GERMANY, name: "Germany (Public)" }] }),
    student("c", "Chand", { officerId: null }),
  ];
  assert.deepEqual(
    build(students, [], { ...DEFAULT_FILTERS, officer: OTHER_OFFICER }).students.map((s) => s.name),
    ["Bano"]
  );
  assert.deepEqual(
    build(students, [], { ...DEFAULT_FILTERS, officer: "none" }).students.map((s) => s.name),
    ["Chand"]
  );
  assert.deepEqual(
    build(students, [], { ...DEFAULT_FILTERS, country: GERMANY }).students.map((s) => s.name),
    ["Bano"]
  );
  assert.equal(build(students, [], { ...DEFAULT_FILTERS, officer: "none" }).students[0].officer, null);
});

test("filters: with documents left, and complete — a student with no checklist is not complete", () => {
  const students = [student("a", "Ali"), student("b", "Bano"), student("c", "Chand")];
  const docs = [doc("a", "verified"), doc("b", "verified"), doc("b", "submitted")];
  assert.deepEqual(
    build(students, docs, { ...DEFAULT_FILTERS, show: "complete" }).students.map((s) => s.name),
    ["Ali"]
  );
  assert.deepEqual(
    build(students, docs, { ...DEFAULT_FILTERS, show: "left" }).students.map((s) => s.name),
    ["Bano", "Chand"],
    "awaiting review still counts as not finished"
  );
});

test("sorting: by name ignoring case, or least complete first with no checklist at the very top", () => {
  const students = [student("a", "zara"), student("b", "Ahmed"), student("c", "Bilal")];
  const docs = [doc("a", "verified"), doc("a", "missing"), doc("b", "verified")];
  assert.deepEqual(
    build(students, docs).students.map((s) => s.name),
    ["Ahmed", "Bilal", "zara"]
  );
  assert.deepEqual(
    build(students, docs, { ...DEFAULT_FILTERS, sort: "progress" }).students.map((s) => s.name),
    ["Bilal", "zara", "Ahmed"]
  );
});

// ------------------------------------------------------------------ filters in the address

test("filters from the address: anything unknown falls back to the default", () => {
  assert.deepEqual(parseChecklistFilters(new URLSearchParams("officer=drop%20table&country=Italy&show=everything&sort=random")), DEFAULT_FILTERS);
  assert.deepEqual(parseChecklistFilters({ officer: "none", country: ITALY, show: "left", sort: "progress" }), {
    officer: "none",
    country: ITALY,
    show: "left",
    sort: "progress",
  });
  assert.equal(parseChecklistFilters({ officer: [OFFICER, "x"] }).officer, OFFICER);
});

test("the query string leaves defaults out and survives a round trip", () => {
  assert.equal(checklistQuery(DEFAULT_FILTERS), "");
  assert.equal(checklistQuery(DEFAULT_FILTERS, { format: "pdf" }), "?format=pdf");
  const f = { officer: OFFICER, country: ITALY, show: "complete", sort: "progress" };
  assert.deepEqual(parseChecklistFilters(new URLSearchParams(checklistQuery(f).slice(1))), f);
});

test("the filters are described in words for the PDF and the workbook", () => {
  const words = describeFilters({ ...DEFAULT_FILTERS, officer: OFFICER, country: ITALY, show: "left" }, () => "Imran Ali", () => "Italy (Public)");
  assert.equal(words, "Officer: Imran Ali · Italy (Public) · Students with documents left");
  assert.equal(describeFilters(DEFAULT_FILTERS, () => null, () => null), "All registered students");
});

// ------------------------------------------------------------------ the workbook

test("workbook: a summary with totals, every document, and only what is still to do", () => {
  const r = build(
    [student("a", "Ali"), student("b", "Bano")],
    [
      doc("a", "verified", { verifiedAt: "2026-10-04T20:30:00Z" }),
      doc("a", "missing"),
      doc("b", "rejected", { rejectedReason: "Blurry", uploadedAt: "2026-10-03T10:00:00Z" }),
    ]
  );
  const [summary, checklist, todo] = checklistWorkbookSheets(r, { preparedOn: "2 Nov 2026", preparedBy: "Tester", filters: "All registered students" });
  assert.deepEqual(
    [summary.sheet, checklist.sheet, todo.sheet],
    ["Summary", "Checklist", "Still to do"]
  );

  const header = summary.data.findIndex((row) => row[0]?.value === "#");
  assert.ok(header > 0, "the summary has a title above its header");
  assert.equal(summary.stickyRowsCount, header + 1, "the header stays in view");
  const totalRow = summary.data.at(-1);
  assert.equal(totalRow[1].value, "Total");
  assert.equal(totalRow[6].value, 3, "documents");
  assert.equal(totalRow[7].value, 1, "approved");
  assert.equal(totalRow[11].value, 2, "left to do");
  const ali = summary.data[header + 1];
  assert.equal(ali[1].value, "Ali");
  assert.equal(ali[12].value, 0.5);
  assert.equal(ali[12].format, "0%");

  assert.equal(checklist.data.length, 1 + 3);
  assert.equal(todo.data.length, 1 + 2, "the approved document is not on the to-do sheet");
  const statusCol = checklist.data[0].findIndex((c) => c?.value === "Status");
  assert.ok(todo.data.slice(1).every((row) => row[statusCol].value !== "Approved"));

  // An approval at 01:30 in Karachi on 5 October is the 5th, not UTC's 4th.
  const approvedRow = checklist.data.find((row) => row[statusCol]?.value === "Approved");
  const approvedOn = approvedRow[statusCol + 2].value;
  assert.ok(approvedOn instanceof Date);
  assert.equal(approvedOn.toISOString().slice(0, 10), "2026-10-05");

  const sentBack = checklist.data.find((row) => row[statusCol]?.value === "Sent back");
  assert.equal(sentBack.at(-1).value, "Sent back: Blurry");
});

test("workbook: with no students the sheets say so rather than standing empty", () => {
  const r = build([], []);
  const [summary, checklist, todo] = checklistWorkbookSheets(r, { preparedOn: "x", preparedBy: null, filters: "y" });
  assert.match(summary.data.at(-1)[0].value, /No students/);
  assert.match(checklist.data.at(-1)[0].value, /No documents/);
  assert.match(todo.data.at(-1)[0].value, /Nothing left/);
});

// ------------------------------------------------------------------ the shared pieces

test("sections: a student's destinations' own sections plus the shared ones, the earlier position winning", () => {
  const sections = [
    { key: "admission", label: "Admission" },
    { key: "visa", label: "Visa" },
    { key: "italian_translations", label: "Italian Translations" },
  ];
  const placements = [
    { destination_id: null, section_key: "admission", sort_order: 1 },
    { destination_id: ITALY, section_key: "italian_translations", sort_order: 2 },
    { destination_id: GERMANY, section_key: "visa", sort_order: 5 },
    { destination_id: ITALY, section_key: "visa", sort_order: 3 },
  ];
  assert.deepEqual(
    checklistSectionsFor(new Set([ITALY, GERMANY]), sections, placements).map((s) => s.key),
    ["admission", "italian_translations", "visa", "other"]
  );
  assert.deepEqual(
    checklistSectionsFor(new Set([GERMANY]), sections, placements).map((s) => s.key),
    ["admission", "visa", "other"]
  );
  assert.ok(checklistSectionsFor(new Set(), [], []).length > 1, "nothing configured falls back to the built-in order");
});

test("cycles: a student with one intake keeps every document; with two, the current intake's are picked", () => {
  const docs = [
    { id: "x", cycle_id: "c1", category: "admission", template_id: "t1", derived_key: null, status: "verified" },
    { id: "y", cycle_id: "c2", category: "visa", template_id: "t2", derived_key: null, status: "missing" },
  ];
  assert.equal(pickCycleDocuments(docs, [{ id: "c1", sequence: 1, intake: "2026", is_current: true }], new Set()).docs.length, 2);
  const two = pickCycleDocuments(
    docs,
    [
      { id: "c1", sequence: 1, intake: "2026", is_current: false },
      { id: "c2", sequence: 2, intake: "2027", is_current: true },
    ],
    new Set()
  );
  assert.equal(two.activeCycleId, "c2");
  assert.ok(two.docs.some((d) => d.id === "y"));
  // The degree approved for the first intake carries over into the second.
  assert.equal(two.inheritedFromById.get("x"), 1);
});

test("the report is for Processing and Super Admin only — not Management, not counsellors", () => {
  const entry = REPORT_CATALOGUE.find((r) => r.href === "/reports/documents-checklist");
  assert.ok(entry);
  const sees = (role) => visibleReports(role).some((r) => r.href === entry.href);
  assert.ok(sees("super_admin"));
  assert.ok(sees("processing"));
  for (const role of ["management", "counselor", "finance", "marketing"]) assert.ok(!sees(role), `${role} should not see it`);
  assert.ok(sees(["counselor", "processing"]), "a counsellor who is also on the processing team does");
});
