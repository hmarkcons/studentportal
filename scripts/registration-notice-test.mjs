import test from "node:test";
import assert from "node:assert/strict";
import { buildRegistrationNotice, noticeSubject, noticeOpening } from "../src/lib/registrationNotice.ts";

const base = {
  recipientName: "Sana",
  role: "counselor",
  studentName: "Ali Raza",
  studentCode: "HMC-SEP26-IT-0019",
  country: "Italy (Public)",
  intake: "Fall 2026",
  studentPhone: "0300-1234567",
  studentEmail: "ali@example.com",
  counselorName: "Sana",
  processingOfficerName: "Imran",
  firstActions: [
    { label: "Passport copy", due: "20 Sep 2026" },
    { label: "IBCC attestation", due: null },
  ],
  moreActions: 6,
  studentUrl: "https://portal.example.com/students/abc",
};

test("the subject carries the name and the number, so it is searchable", () => {
  assert.match(noticeSubject(base), /Ali Raza/);
  assert.match(noticeSubject(base), /HMC-SEP26-IT-0019/);
  assert.match(noticeSubject(base), /Italy \(Public\)/);
});

test("a reassignment says so in the subject", () => {
  assert.match(noticeSubject({ ...base, reassigned: true }), /^Reassigned to you/);
  assert.match(noticeSubject(base), /^New student assigned to you/);
});

test("management gets a copy, not a task", () => {
  assert.match(noticeSubject({ ...base, role: "management" }), /^Registered:/);
  assert.match(noticeOpening({ ...base, role: "management" }), /copy for your records/);
  // And the heading over the list is not phrased as their job.
  const { html } = buildRegistrationNotice({ ...base, role: "management" });
  assert.match(html, /Outstanding/);
  assert.doesNotMatch(html, /What they owe first/);
});

test("the processing officer is told processing is theirs", () => {
  assert.match(noticeOpening({ ...base, role: "processing" }), /processing is yours/);
});

test("a student with no code still gets a usable subject", () => {
  const s = noticeSubject({ ...base, studentCode: null });
  assert.match(s, /Ali Raza/);
  assert.doesNotMatch(s, /null|undefined|·\s*—/);
});

test("the mail carries the contact details and the link", () => {
  const { text, html } = buildRegistrationNotice(base);
  assert.match(text, /0300-1234567/);
  assert.match(text, /ali@example\.com/);
  assert.match(text, /https:\/\/portal\.example\.com\/students\/abc/);
  assert.match(html, /href="https:\/\/portal\.example\.com\/students\/abc"/);
});

test("each of the two names the other, and neither is told who they are", () => {
  const toCounselor = buildRegistrationNotice(base).text;
  assert.match(toCounselor, /Processing: Imran/);
  assert.doesNotMatch(toCounselor, /Counselor: Sana/, "the counselor does not need telling who the counselor is");

  const toProcessing = buildRegistrationNotice({ ...base, role: "processing", recipientName: "Imran" }).text;
  assert.match(toProcessing, /Counselor: Sana/);
  assert.doesNotMatch(toProcessing, /Processing: Imran/);
});

test("what they owe first is listed with its date", () => {
  const { text } = buildRegistrationNotice(base);
  assert.match(text, /Passport copy — by 20 Sep 2026/);
  // A requirement with no deadline is still listed, without inventing one.
  assert.match(text, /- IBCC attestation$/m);
  assert.match(text, /and 6 more on their Documents tab/);
});

test("nothing outstanding says so rather than printing an empty list", () => {
  const { text, html } = buildRegistrationNotice({ ...base, firstActions: [], moreActions: 0 });
  assert.match(text, /Nothing is outstanding/);
  assert.match(html, /Nothing is outstanding/);
  assert.doesNotMatch(text, /What they owe first/);
});

test("no fee is quoted anywhere in the mail", () => {
  // The office asked for the work, not the billing.
  const { text, html } = buildRegistrationNotice(base);
  for (const body of [text, html]) {
    assert.doesNotMatch(body, /consultancy fee|admin charge|installment|€|PKR/i);
  }
});

test("a student name with markup in it cannot break the html", () => {
  const { html } = buildRegistrationNotice({ ...base, studentName: 'Ali <img src=x onerror="alert(1)">' });
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
});

test("the mail says who it is from", () => {
  assert.match(buildRegistrationNotice(base).text, /HMARK Student Portal/);
});
