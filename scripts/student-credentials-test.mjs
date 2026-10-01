// A student's logins, sent by email or copied as a WhatsApp message: what
// each is called, the order, and that the email and the message say the same.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  credentialLabel,
  credentialsEmailHtml,
  credentialsEmailText,
  credentialsNote,
  credentialsWhatsapp,
  loginLabels,
  orderLogins,
} from "../src/lib/studentCredentials.ts";

const login = (credentialType, username, password, university = null) => ({ credentialType, username, password, university });

const INPUT = {
  studentName: "Ali Raza",
  signInUrl: "https://portal.example/login",
  studentCode: "HMC-F26-IT-012",
  logins: [
    login("gmail", "ali.raza@gmail.com", "G-pass-1"),
    login("university_portal", "AR2026", "Uni-pass-2", "Università di Pavia"),
    login("portal_login", "ali@example.com", "Hmark-pass-3"),
    login("visa_appointment_portal", "", ""),
    login("scholarship_portal:EDiSU Piemonte", "edisu-ali", "Sch-pass-4"),
  ],
};

test("each login is called what the student knows it as", () => {
  assert.equal(credentialLabel("portal_login"), "HMARK Student Portal");
  assert.equal(credentialLabel("gmail"), "Gmail");
  assert.equal(credentialLabel("university_portal", "Università di Pavia"), "University portal — Università di Pavia");
  assert.equal(credentialLabel("scholarship_portal:EDiSU Piemonte"), "EDiSU Piemonte (scholarship portal)");
  assert.equal(credentialLabel("dsu_portal"), "Dsu portal");
});

test("this portal's own login comes first, an empty login is left out", () => {
  assert.deepEqual(loginLabels(INPUT.logins), [
    "HMARK Student Portal",
    "Gmail",
    "University portal — Università di Pavia",
    "EDiSU Piemonte (scholarship portal)",
  ]);
  // A student-level login before the same kind kept against one application.
  const ordered = orderLogins([login("university_portal", "a", "b", "Pavia"), login("university_portal", "c", "d")]);
  assert.equal(ordered[0].university, null);
});

test("the WhatsApp message carries every login, each under its name in bold", () => {
  const text = credentialsWhatsapp(INPUT);
  assert.match(text, /^Dear Ali,/);
  assert.match(text, /\*HMARK Student Portal\*\nSign in at: https:\/\/portal\.example\/login\nStudent ID: HMC-F26-IT-012\nor email: ali@example\.com\nPassword: Hmark-pass-3/);
  assert.match(text, /\*Gmail\*\nUsername: ali\.raza@gmail\.com\nPassword: G-pass-1/);
  assert.match(text, /\*University portal — Università di Pavia\*\nUsername: AR2026\nPassword: Uni-pass-2/);
  assert.ok(!/Visa appointment portal/.test(text), "a login with nothing saved is not sent");
  assert.ok(text.indexOf("HMARK Student Portal") < text.indexOf("Gmail"));
});

test("the email says what the message says", () => {
  const text = credentialsEmailText(INPUT);
  const html = credentialsEmailHtml(INPUT);
  for (const value of ["Hmark-pass-3", "G-pass-1", "Uni-pass-2", "Sch-pass-4", "HMC-F26-IT-012", "https://portal.example/login"]) {
    assert.ok(text.includes(value), `text: ${value}`);
    assert.ok(html.includes(value), `html: ${value}`);
  }
  assert.ok(!text.includes("*"), "no WhatsApp asterisks in an email");
});

test("what a login says is escaped in the email, not run as markup", () => {
  const html = credentialsEmailHtml({ ...INPUT, logins: [login("gmail", "<script>alert(1)</script>", "a&b")] });
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.ok(html.includes("&lt;script&gt;") && html.includes("a&amp;b"));
});

test("the note on the timeline names what went — never a password", () => {
  const labels = loginLabels(INPUT.logins);
  const emailed = credentialsNote("email", labels, "ali@example.com");
  assert.equal(emailed, "Emailed the student their login details at ali@example.com: HMARK Student Portal, Gmail, University portal — Università di Pavia, EDiSU Piemonte (scholarship portal).");
  const copied = credentialsNote("copy", labels);
  assert.match(copied, /^Copied the student's login details as a message: HMARK Student Portal/);
  for (const secret of ["Hmark-pass-3", "G-pass-1", "Uni-pass-2", "Sch-pass-4"]) {
    assert.ok(!emailed.includes(secret) && !copied.includes(secret));
  }
});
