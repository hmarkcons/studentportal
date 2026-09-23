import { test } from "node:test";
import assert from "node:assert/strict";
import { formatLeaveRange, leaveHtml, leaveSubject, leaveText } from "../src/lib/leaveEmail.ts";

const url = "https://portal.example.com/my-leave";

test("date ranges read the way a person writes them", () => {
  assert.equal(formatLeaveRange("2026-10-03", "2026-10-03"), "3 Oct 2026");
  assert.equal(formatLeaveRange("2026-10-03", "2026-10-07"), "3–7 Oct 2026");
  assert.equal(formatLeaveRange("2026-09-30", "2026-10-02"), "30 Sept – 2 Oct 2026".replace("Sept", new Date("2026-09-30T00:00:00Z").toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })));
  assert.match(formatLeaveRange("2026-12-30", "2027-01-02"), /2026 – 2 Jan 2027$/);
});

test("an approval with unpaid days says why, so the payslip is no surprise", () => {
  const text = leaveText({ kind: "approved", staffName: "Ayesha", leaveLabel: "Sick leave", dates: "3–7 Oct 2026", paid: 0, unpaid: 5, unpaidReason: "certificate", remaining: 14, url });
  assert.match(text, /5 days will be unpaid, because sick and emergency leave is paid only with a medical certificate/);
  const past = leaveText({ kind: "approved", staffName: "Ayesha", leaveLabel: "Planned leave", dates: "x", paid: 2, unpaid: 3, unpaidReason: "allowance", remaining: 0, url });
  assert.match(past, /past your paid leave allowance/);
});

test("a fully paid approval does not mention deductions", () => {
  const text = leaveText({ kind: "approved", staffName: "A", leaveLabel: "Planned leave", dates: "x", paid: 3, unpaid: 0, unpaidReason: null, remaining: 11, url });
  assert.doesNotMatch(text, /unpaid|deducted/);
  assert.match(text, /11 paid days left/);
});

test("a request with short notice says so to the approver", () => {
  const mail = { kind: "requested", recipientName: "M", staffName: "A", leaveLabel: "Planned leave", dates: "x", days: 2, url, shortNotice: true };
  assert.match(leaveText(mail), /less than the month's notice/);
  assert.match(leaveSubject(mail), /^Leave request: A/);
});

test("a rejection carries the note, escaped in the HTML", () => {
  const mail = { kind: "rejected", staffName: "A", leaveLabel: "Planned leave", dates: "x", note: "<b>Busy week</b>", url };
  assert.match(leaveText(mail), /Busy week/);
  assert.ok(!leaveHtml(mail).includes("<b>Busy"));
});
