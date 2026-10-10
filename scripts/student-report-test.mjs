// The status report's statuses: what counts as done, in progress, to do,
// sent back or not needed in each section, and how the summary adds them up.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agreementSection,
  applicationStatus,
  applicationsSection,
  countStatuses,
  day,
  documentsSection,
  interviewsSection,
  journeySection,
  paymentsSection,
  pdfSafe,
  percentDone,
  registrationSection,
  reportFileName,
  scholarshipSection,
  summariseReport,
  tasksSection,
  trackerSection,
  trackerValueText,
  travelSection,
  visaSection,
  SECTION_COLORS,
  STATUS_COLORS,
} from "../src/lib/studentReport.ts";
import { destinationStatusRows } from "../src/lib/destinationStatus.ts";

const TODAY = "2026-10-10";
const states = (section) => section.items.map((i) => `${i.label}=${i.status}:${i.state}`);
const find = (section, label) => section.items.find((i) => i.label === label);

test("text the standard font cannot draw is written in letters it can", () => {
  assert.equal(pdfSafe("Università degli Studi — €300"), "Università degli Studi — €300");
  assert.equal(pdfSafe("Ayşe Yılmaz → İzmir ✓"), "Ayse Yilmaz -> Izmir ");
  assert.equal(pdfSafe("Budapest Műszaki Egyetem"), "Budapest Muszaki Egyetem");
  assert.equal(pdfSafe("Great news 🎉 done"), "Great news  done");
  assert.equal(pdfSafe(null), "");
});

test("a date column is the day stored, wherever the server is", () => {
  assert.equal(day("2026-10-03"), "3 Oct 2026");
  assert.equal(day("2026-01-31T00:00:00Z"), "31 Jan 2026");
  assert.equal(day(null), null);
  assert.equal(day("soon"), null);
});

test("every section has a colour of its own, and none is a status colour", () => {
  const sections = Object.values(SECTION_COLORS);
  assert.equal(new Set(sections).size, sections.length);
  for (const c of Object.values(STATUS_COLORS)) assert.ok(!sections.includes(c), c);
});

const registration = (over = {}) =>
  registrationSection({
    registrationStatus: "registered",
    registeredAt: "2026-09-01T09:00:00Z",
    intake: "Fall 2026",
    studentCode: "HMC-FALL26-IT-0002",
    hasCountry: true,
    destinations: [{ name: "Italy (Public)", isBackup: false }, { name: "Hungary", isBackup: true }],
    service: "full",
    portal: { hasLogin: true, active: true },
    profile: { contact_number: "0300", passport_number: "AB1", passport_expiry: "2030-01-01" },
    level: "bachelors",
    qualifications: ["secondary_school"],
    savedLogins: ["Universitaly"],
    ...over,
  });

test("registration: what is on file is done, what is missing is to do", () => {
  const s = registration();
  assert.equal(find(s, "Registration").status, "done");
  assert.equal(find(s, "Student ID").detail, "HMC-FALL26-IT-0002");
  assert.match(find(s, "Destination").detail, /Italy \(Public\) · backup: Hungary/);
  assert.equal(find(s, "Student portal").state, "Active");
  assert.equal(find(s, "Contact number").status, "done");
  assert.equal(find(s, "Home address").status, "todo");
  assert.equal(find(s, "Passport validity").state, "Valid");
  assert.equal(find(s, "Secondary School").status, "done");
  assert.equal(find(s, "High School").status, "todo");
  assert.equal(find(s, "High School").group, "Academic qualifications");
  assert.deepEqual(s.facts[0].rows[0], { label: "Logins on file", value: "Universitaly" });
});

test("registration: no intake means no Student ID, and a withdrawn student is flagged", () => {
  const s = registration({ intake: null, studentCode: null, registrationStatus: "withdrawn", portal: { hasLogin: true, active: false } });
  assert.equal(find(s, "Intake").status, "todo");
  assert.equal(find(s, "Student ID").detail, "Needs an intake to be composed.");
  assert.equal(find(s, "Registration").status, "blocked");
  assert.equal(find(s, "Student portal").status, "progress");
  assert.equal(registration({ studentCode: null }).items.find((i) => i.label === "Student ID").detail, "Needs a country on file to be composed.");
});

test("registration: a passport inside six months is in progress, and an expired one is refused", () => {
  const soon = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  assert.equal(find(registration({ profile: { passport_expiry: soon } }), "Passport validity").status, "progress");
  assert.equal(find(registration({ profile: { passport_expiry: "2020-01-01" } }), "Passport validity").status, "blocked");
  assert.equal(find(registration({ profile: {} }), "Passport validity"), undefined);
});

const agreement = (over = {}) => ({
  id: "a1",
  country: "Italy (Public)",
  version: 1,
  status: "pending_signature",
  signingMethod: "paper",
  agreementDate: "2026-09-02",
  createdAt: "2026-09-02T10:00:00Z",
  generatedBy: "Sara",
  signedUploadedAt: null,
  videoUploadedAt: null,
  documentStatus: "pending",
  videoStatus: "pending",
  documentNote: null,
  videoNote: null,
  reviewedAt: null,
  reviewedBy: null,
  approvalUndoneAt: null,
  ...over,
});

test("agreement: none is to do; signed is done; awaiting is in progress; sent back is flagged", () => {
  assert.deepEqual(states(agreementSection([])), ["Student agreement=todo:Not generated"]);
  const signed = agreementSection([agreement({ status: "signed", signedUploadedAt: "2026-09-05T10:00:00Z", reviewedAt: "2026-09-05T11:00:00Z", reviewedBy: "Ali" })]);
  assert.equal(signed.items[0].status, "done");
  assert.match(signed.items[0].stamp, /Signed copy filed 5 Sept? 2026 by Ali/);
  assert.equal(agreementSection([agreement()]).items[0].state, "Awaiting signature");
  const eWaiting = agreementSection([agreement({ signingMethod: "e_signature", signedUploadedAt: "2026-09-05T10:00:00Z", videoUploadedAt: "2026-09-05T10:05:00Z", documentStatus: "approved" })]);
  assert.equal(eWaiting.items[0].state, "Awaiting verification");
  assert.match(eWaiting.items[0].detail, /waiting on the consent video/);
  const sentBack = agreementSection([agreement({ signingMethod: "e_signature", signedUploadedAt: "2026-09-05T10:00:00Z", videoStatus: "rejected", videoNote: "No sound" })]);
  assert.equal(sentBack.items[0].status, "blocked");
  assert.match(sentBack.items[0].detail, /consent video was sent back\. No sound/);
});

test("agreement: one item per country, the latest version, saying how many came before", () => {
  const s = agreementSection([
    agreement({ id: "a1", version: 1, status: "signed" }),
    agreement({ id: "a2", version: 2 }),
    agreement({ id: "b1", country: "Hungary", version: 1, status: "signed" }),
  ]);
  assert.deepEqual(states(s), ["Agreement — Italy (Public) (v2)=progress:Awaiting signature", "Agreement — Hungary (v1)=done:Signed"]);
  assert.equal(s.items[0].detail, "Waiting for the signed paper copy. · 1 earlier version");
  // "Sept" or "Sep", as the server's ICU spells it.
  assert.match(s.items[1].detail, /^Signed by paper · dated 2 Sept? 2026$/);
  const signedLatest = agreementSection([agreement({ id: "a2", version: 2, status: "signed" }), agreement({ id: "a1", version: 1 })]);
  assert.match(signedLatest.items[0].detail, /1 earlier version/);
});

const invoice = (over = {}) => ({
  number: "INV-0042",
  currency: "EUR",
  issuedOn: "2026-09-03",
  createdAt: "2026-09-03T08:00:00Z",
  generatedBy: "Finance Person",
  consultancyFee: 1000,
  adminCharge: 300,
  adminCharges: [{ label: "Italy (Public)", amount: 300, isBackup: false }],
  discountAmount: 100,
  discountReason: "Early bird",
  taxRate: 5,
  taxBase: "total",
  feeName: "Consultancy Fee",
  lineItems: [{ name: "Courier", amount: 20 }],
  installments: [
    { installmentNo: 1, amount: 700, amountPaid: null, status: "paid", dueDate: "2026-09-10", paidDate: "2026-09-09", paymentMethod: "Bank transfer", dueCondition: null },
    { installmentNo: 2, amount: 300, amountPaid: 100, status: "partial", dueDate: "2026-11-01", paidDate: "2026-10-01", paymentMethod: null, dueCondition: null },
    { installmentNo: 3, amount: 276, amountPaid: null, status: "unpaid", dueDate: "2026-10-01", paidDate: null, paymentMethod: null, dueCondition: null },
  ],
  emails: [],
  ...over,
});

test("payments: the figures in detail, and each instalment paid, part paid or overdue", () => {
  const s = paymentsSection([invoice()], TODAY);
  const rows = Object.fromEntries(s.facts[0].rows.map((r) => [r.label, r.value]));
  assert.equal(s.facts[0].title, "Figures (EUR)");
  assert.equal(s.facts[0].group, "Invoice INV-0042");
  assert.equal(rows["Consultancy Fee"], "EUR 1,000.00");
  assert.equal(rows["Discount (Early bird)"], "- EUR 100.00");
  assert.equal(rows["Administrative fee — Italy (Public)"], "EUR 300.00");
  assert.equal(rows["Courier"], "EUR 20.00");
  // 5% of 900 + 20 + 300 under the current rule.
  assert.equal(rows["Tax (5%)"], "EUR 61.00");
  assert.equal(rows["Invoice total"], "EUR 1,281.00");
  assert.equal(rows["Paid"], "EUR 800.00");
  assert.equal(rows["Outstanding"], "EUR 476.00");
  assert.deepEqual(states(s), [
    "Invoice raised=done:Raised",
    "Invoice emailed=todo:Not sent",
    "Instalment 1=done:Paid",
    "Instalment 2=progress:Part paid",
    "Instalment 3=blocked:Overdue",
  ]);
  assert.match(find(s, "Instalment 1").detail, /EUR 700.00 · Bank transfer/);
  assert.match(find(s, "Instalment 2").detail, /EUR 100.00 of EUR 300.00 paid/);
  assert.equal(find(s, "Instalment 3").due, "2026-10-01");
});

test("payments: an old invoice keeps the tax rule it was raised under, and a sent one says so", () => {
  const s = paymentsSection([invoice({ taxBase: null, emails: [{ sentTo: "a@x.it", at: "2026-09-04T05:00:00Z", by: "Sara", status: "sent" }] })], TODAY);
  const rows = Object.fromEntries(s.facts[0].rows.map((r) => [r.label, r.value]));
  // 5% of 900 + 20 only: the administrative fee was outside the tax base.
  assert.equal(rows["Tax (5%)"], "EUR 46.00");
  assert.equal(find(s, "Invoice emailed").status, "done");
  assert.match(find(s, "Invoice emailed").detail, /last to a@x\.it/);
  assert.deepEqual(states(paymentsSection([], TODAY)), ["Invoice=todo:Not raised"]);
});

test("documents: approved, waiting, sent back and missing, in the checklist's section order", () => {
  const doc = (over) => ({ name: "Passport", section: "Admission Documents", status: "missing", files: 0, uploadedAt: null, uploadedByRole: null, verifiedAt: null, verifiedBy: null, rejectedReason: null, deadline: null, carriedFrom: null, ...over });
  const s = documentsSection(
    [
      doc({ name: "Visa form", section: "Visa Application Requirements", status: "submitted", files: 2, uploadedAt: "2026-10-01T10:00:00Z", uploadedByRole: "student" }),
      doc({ name: "Passport", status: "verified", files: 1, verifiedAt: "2026-10-02T10:00:00Z", verifiedBy: "Ali" }),
      doc({ name: "Transcript", status: "rejected", rejectedReason: "Blurry" }),
      doc({ name: "Photo", deadline: "2026-10-01" }),
      doc({ name: "Internship certificates (optional)" }),
      doc({ name: "Degree", status: "submitted", files: 1 }),
    ],
    ["Admission Documents", "Visa Application Requirements"],
    TODAY
  );
  // Sent back, missing, waiting, approved, optional — within each section.
  assert.deepEqual(states(s), [
    "Transcript=blocked:Sent back",
    "Photo=todo:Missing — late",
    "Degree=progress:Submitted",
    "Passport=done:Approved",
    "Internship certificates (optional)=na:Optional",
    "Visa form=progress:Submitted",
  ]);
  assert.equal(find(s, "Passport").detail, null);
  assert.match(find(s, "Passport").stamp, /Approved 2 Oct 2026 by Ali/);
  assert.equal(find(s, "Transcript").detail, "Reason: Blurry");
  assert.match(find(s, "Visa form").detail, /2 files/);
  assert.match(find(s, "Visa form").stamp, /Uploaded by the student/);
  assert.equal(documentsSection([], [], TODAY).items.length, 0);
});

const PIPELINE = ["documents_pending", "documents_verified", "application_submitted", "under_review", "offer_received", "pre_enrolled", "visa_applied"];

test("applications: an offer is done, submitted is under way, a refusal is flagged, withdrawn is not needed", () => {
  assert.equal(applicationStatus("documents_pending", PIPELINE), "todo");
  assert.equal(applicationStatus("documents_verified", PIPELINE), "progress");
  assert.equal(applicationStatus("application_submitted", PIPELINE), "progress");
  assert.equal(applicationStatus("offer_received", PIPELINE), "done");
  assert.equal(applicationStatus("rejected", PIPELINE), "blocked");
  assert.equal(applicationStatus("declined", PIPELINE), "blocked");
  assert.equal(applicationStatus("withdrawn", PIPELINE), "na");
});

test("applications: numbered, finalized named, the deadline and its tasks", () => {
  const app = (over) => ({ number: 1, university: "Uni A", program: "BSc", round: "Round 1", country: "Italy (Public)", stage: "documents_pending", pipeline: PIPELINE, deadline: "2026-11-01", finalized: false, finalizedBadge: null, tasksOpen: 1, tasksTotal: 2, stageSetAt: null, stageSetBy: null, ...over });
  const s = applicationsSection([app({ number: 2, university: "Uni B", finalized: true, finalizedBadge: "Pre-Enrolled", stage: "pre_enrolled" }), app({})], false, TODAY);
  assert.deepEqual(states(s), ["#1 Uni A=todo:Documents Pending", "#2 Uni B=done:Pre-Enrolled"]);
  assert.match(s.items[0].detail, /BSc · round: Round 1 · step 1 of 7 · deadline 1 Nov 2026 · 1 of 2 tasks open/);
  assert.equal(s.items[0].due, "2026-11-01");
  assert.equal(s.items[1].due, null);
  assert.match(applicationsSection([app({ deadline: "2026-10-01" })], false, TODAY).items[0].detail, /deadline passed 1 Oct 2026/);
  assert.equal(applicationsSection([], true, TODAY).items[0].status, "na");
  assert.equal(applicationsSection([], false, TODAY).items[0].status, "todo");
});

test("country journey: done, under way, stopped, next and not started, per country", () => {
  const stages = [
    { key: "docs", label: "Admission Docs", type: "select" },
    { key: "admission", label: "Admission", type: "select" },
    { key: "fee", label: "Fee", type: "select" },
    { key: "visa", label: "Visa", type: "select" },
    { key: "travel", label: "Travel", type: "date" },
  ];
  const rows = destinationStatusRows(
    [{ destinationId: "d1", isBackup: false, values: { docs: "Complete", admission: "In process", fee: "Skipped" }, name: "Italy (Public)", code: "IT", stages }],
    []
  );
  assert.deepEqual(states(journeySection(rows)), [
    "Admission Docs=done:Done",
    "Admission=progress:In process",
    "Fee=na:Skipped",
    "Visa=todo:Next",
    "Travel=todo:Not started",
  ]);
  assert.equal(journeySection(rows).items[0].group, "Italy (Public) — No application yet");
  const refused = destinationStatusRows([{ destinationId: "d1", isBackup: true, values: { docs: "Rejected" }, name: "Hungary", code: "HU", stages }], []);
  assert.equal(journeySection(refused).items[0].status, "blocked");
  assert.match(journeySection(refused).items[0].group, /Hungary \(backup\)/);
});

test("tracker: a field that does not apply yet is left out; answers read as words", () => {
  const s = trackerSection([
    {
      name: "Italy (Public)",
      fields: [
        { key: "dov", label: "DOV requested", type: "boolean" },
        { key: "dov_date", label: "DOV date", type: "date", showWhen: { key: "dov", equals: "true" } },
        { key: "tests", label: "Tests", type: "multi_select" },
        { key: "uni", label: "University", type: "select" },
        { key: "notes", label: "Notes", type: "textarea" },
      ],
      values: { dov: "false", dov_date: "2026-01-01", tests: '["IMAT","TOLC"]', uni: "app-1", notes: "" },
      names: { "app-1": "Università di Pavia" },
    },
  ]);
  assert.deepEqual(states(s), ["DOV requested=done:Recorded", "Tests=done:Recorded", "University=done:Recorded", "Notes=todo:Not recorded"]);
  assert.deepEqual(s.items.map((i) => i.detail ?? null), ["No", "IMAT, TOLC", "Università di Pavia", null]);
  assert.equal(trackerValueText("multi_university_status", '[{"university_id":"app-1","status":"Booked","date":"2026-10-20"}]', { "app-1": "Pavia" }), "Pavia: Booked: 20 Oct 2026");
  assert.equal(trackerValueText("date", "2026-10-20", {}), "20 Oct 2026");
  assert.equal(trackerValueText("multi_select", "[]", {}), "");
});

test("interviews and tests: results, what is booked, and a retest's earlier score", () => {
  const iv = (over) => ({ university: "Uni A", round: null, status: "scheduled", when: "Sat, Oct 24, 2026, 14:00", date: "2026-10-24", platform: "Zoom", addedBy: "Ali", ...over });
  const s = interviewsSection(
    [iv({}), iv({ status: "passed" }), iv({ status: "failed" }), iv({ status: "completed" }), iv({ status: "cancelled" }), iv({ status: "scheduled", date: "2026-10-01" })],
    [
      { label: "IELTS", ticked: true, scores: [{ score: "6.5", date: "2026-08-01" }, { score: "5.5", date: "2026-05-01" }] },
      { label: "IMAT", ticked: true, scores: [] },
    ],
    TODAY
  );
  assert.deepEqual(
    s.items.map((i) => `${i.status}:${i.state}`),
    ["progress:Scheduled", "done:Passed", "blocked:Not successful", "progress:Awaiting result", "na:Cancelled", "progress:Result to record", "done:Score 6.5", "todo:No score yet"]
  );
  assert.equal(s.items[0].due, "2026-10-24");
  assert.equal(s.items[5].due, null);
  assert.match(s.items[6].detail, /taken 1 Aug 2026 · earlier: 5.5 on 1 May 2026/);
  assert.equal(interviewsSection([], [], TODAY).items[0].status, "na");
});

test("scholarship: why there is none, and where one stands", () => {
  assert.equal(scholarshipSection([], "not_finalised", TODAY).items[0].status, "na");
  assert.equal(scholarshipSection([], "declined", TODAY).items[0].state, "Not pursued");
  assert.equal(scholarshipSection([], null, TODAY).items[0].status, "todo");
  const s = scholarshipSection([{ name: "DSU Pavia", university: "Pavia", status: "modification", documentsStatus: "courier", awardAmount: 6000, deadline: "2026-11-30" }], null, TODAY);
  assert.deepEqual(states(s), ["Application=blocked:Modification requested", "Scholarship documents=done:Sent via courier"]);
  assert.match(s.items[0].detail, /award 6,000 · deadline 30 Nov 2026/);
  assert.equal(scholarshipSection([{ name: "X", university: null, status: "accepted", documentsStatus: "not_required", awardAmount: null, deadline: null }], null, TODAY).items[1].status, "na");
});

test("visa and travel: the decision per country; travel only once a visa is approved", () => {
  assert.equal(visaSection([], TODAY).items[0].status, "na");
  const s = visaSection(
    [
      { country: "Italy", university: "Pavia", decision: "pending", reason: null, appointments: [{ label: "Embassy appointment", date: "2026-10-20" }, { label: "Biometrics", date: null }] },
      { country: "Hungary", university: null, decision: "refused", reason: "Funds", appointments: [{ label: "Embassy appointment", date: "2026-09-01" }] },
    ],
    TODAY
  );
  assert.deepEqual(states(s), [
    "Visa decision=progress:In process",
    "Embassy appointment=progress:Booked",
    "Biometrics=todo:Not booked",
    "Visa decision=blocked:Refused",
    "Embassy appointment=done:Attended",
  ]);
  assert.equal(s.items[3].detail, "Reason: Funds");
  assert.equal(travelSection([], false).items[0].status, "na");
  assert.deepEqual(states(travelSection([{ section: "Before you fly", label: "Book flight", checked: true, checkedAt: "2026-10-01T00:00:00Z" }, { section: "Before you fly", label: "Insurance", checked: false, checkedAt: null }], true)), [
    "Book flight=done:Ticked",
    "Insurance=todo:Not yet",
  ]);
});

test("tasks: done, overdue, due and open, application tasks first", () => {
  const s = tasksSection(
    [
      { kind: "follow_up", title: "Call about fees", about: null, done: false, due: "2026-10-05", owner: "Ali", priority: null },
      { kind: "application", title: "Upload SOP", about: "Uni A", done: false, due: "2026-10-20", owner: null, priority: "urgent" },
      { kind: "application", title: "Pay fee", about: "Uni A", done: true, due: "2026-09-01", owner: null, priority: null },
      { kind: "calendar", title: "Prep call", about: null, done: false, due: null, owner: "Sara", priority: null },
    ],
    TODAY
  );
  assert.deepEqual(states(s), ["Upload SOP=todo:Due 20 Oct 2026", "Pay fee=done:Done", "Call about fees=blocked:Overdue", "Prep call=todo:Open"]);
  assert.match(s.items[0].detail, /Uni A · urgent priority/);
  assert.equal(tasksSection([{ kind: "calendar", title: "x", about: null, done: false, due: null, owner: null, priority: "medium" }], TODAY).items[0].detail, null);
  assert.equal(s.items[2].stamp, "For Ali");
  assert.ok(tasksSection([], TODAY).note);
});

test("the summary: done out of what is needed, what needs attention, and what is coming up", () => {
  const sections = [
    { key: "documents", title: "Documents", items: [
      { label: "A", status: "done", state: "Approved" },
      { label: "B", status: "blocked", state: "Sent back" },
      { label: "C", status: "todo", state: "Missing", due: "2026-10-01" },
      { label: "D", status: "todo", state: "Missing", due: "2026-10-30" },
      { label: "E", status: "na", state: "Not needed" },
    ] },
    { key: "tasks", title: "Tasks", items: [
      { label: "F", status: "progress", state: "Booked", due: "2026-10-15" },
      { label: "G", status: "todo", state: "Due", due: "2027-03-01" },
      { label: "H", status: "done", state: "Done", due: "2026-10-12" },
    ] },
  ];
  const sum = summariseReport(sections, TODAY);
  assert.deepEqual(sum.overall.counts, { done: 2, progress: 1, todo: 3, blocked: 1, na: 1 });
  assert.equal(sum.overall.needed, 7);
  assert.equal(sum.overall.percent, 29);
  assert.equal(sum.sections[0].percent, 25);
  assert.equal(sum.sections[0].color, SECTION_COLORS.documents);
  assert.deepEqual(sum.attention.map((i) => i.label), ["B", "C"]);
  assert.equal(sum.attention[0].section, "Documents");
  assert.deepEqual(sum.upcoming.map((i) => i.label), ["F", "D"]);
  assert.equal(percentDone(countStatuses([])), 100);
  assert.equal(percentDone(countStatuses([{ status: "na" }])), 100);
});

test("the file is named for the student, their ID and the day", () => {
  assert.equal(reportFileName("Ayşe Khan", "HMC-FALL26-IT-0002", TODAY), "HMC-Status-Report-Ayse_Khan-HMC-FALL26-IT-0002-2026-10-10.pdf");
  assert.equal(reportFileName("O'Brien / Test", null, TODAY), "HMC-Status-Report-OBrien_Test-2026-10-10.pdf");
  assert.equal(reportFileName("", null, TODAY), "HMC-Status-Report-Student-2026-10-10.pdf");
});
