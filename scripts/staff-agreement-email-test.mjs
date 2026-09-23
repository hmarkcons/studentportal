import { test } from "node:test";
import assert from "node:assert/strict";
import { staffAgreementHtml, staffAgreementSubject, staffAgreementText } from "../src/lib/staffAgreementEmail.ts";

const url = "https://portal.example.com/my-agreement";

test("sent: tells the staff member what to do and where", () => {
  const mail = { kind: "sent", staffName: "Ayesha", title: "Employment Agreement", url, issuedBy: "Abdul Hadi" };
  assert.equal(staffAgreementSubject(mail), "Please sign: Employment Agreement");
  assert.match(staffAgreementText(mail), /upload the signed copy/);
  assert.ok(staffAgreementHtml(mail).includes(`href="${url}"`));
});

test("returned: tells the issuer to verify or send back", () => {
  const mail = { kind: "returned", recipientName: "Abdul", staffName: "Ayesha", title: "Employment Agreement", url };
  assert.match(staffAgreementSubject(mail), /Signed and returned: Employment Agreement — Ayesha/);
  assert.match(staffAgreementText(mail), /verify it, or send it back/);
});

test("sent back: carries the note, so they know what to fix", () => {
  const mail = { kind: "sentBack", staffName: "Ayesha", title: "Employment Agreement", url, note: "Page 2 is unsigned" };
  assert.match(staffAgreementText(mail), /Page 2 is unsigned/);
});

test("a note or name cannot inject markup", () => {
  const mail = { kind: "sentBack", staffName: "<b>x</b>", title: "T", url, note: "<script>alert(1)</script>" };
  const html = staffAgreementHtml(mail);
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});
