// The student's portal emails (portalWelcomeEmail): the welcome, the login on
// its own, and the new password — each carrying the login as a boarding pass.
import { test } from "node:test";
import assert from "node:assert/strict";
import { initials, levelLabel, portalEmail, portalEmailSubject } from "../src/lib/portalWelcomeEmail.ts";
import { DEFAULT_OFFICE } from "../src/lib/studentEmail.ts";

const BASE = {
  studentName: "AYESHA KHAN",
  studentCode: "HMC-FALL26-IT-0342",
  loginEmail: "ayesha.khan@gmail.com",
  password: "Pisa#2026",
  siteUrl: "https://portal.example/",
  destination: { name: "Italy", code: "IT" },
  intake: "Fall 2026",
  level: "masters",
  team: {
    counsellor: { name: "Sana Ahmed", designation: "Senior Counselor", phone: "0300-1234567", email: "sana@example.com" },
    officer: { name: "Bilal Raza", designation: "Processing Officer", phone: "0321-7654321", email: "bilal@example.com" },
  },
  office: { ...DEFAULT_OFFICE, email: "info@example.com" },
};
const mail = (over = {}) => portalEmail({ ...BASE, kind: "welcome", ...over });

test("the welcome greets them by their first name, written as a person writes it", () => {
  const m = mail();
  assert.equal(m.subject, "Welcome aboard, Ayesha! Your HMARK Student Portal is ready");
  assert.match(m.html, /Welcome aboard, Ayesha!/);
  assert.match(m.preheader, /to Italy starts here/);
  assert.equal(portalEmailSubject({ kind: "login", studentName: "x" }), "Your HMARK Student Portal login");
  assert.equal(portalEmailSubject({ kind: "new_password", studentName: "x" }), "Your new HMARK Student Portal password");
});

test("the boarding pass carries the login: Student ID, email, password, from Pakistan to their country", () => {
  const { html, text } = mail();
  for (const v of ["HMC-FALL26-IT-0342", "ayesha.khan@gmail.com", "Pisa#2026", "Fall 2026", "Master&#39;s", "Ayesha Khan", ">PK<", ">IT<", "Italy"]) {
    assert.ok(html.includes(v), `html: ${v}`);
  }
  assert.match(html, /href="https:\/\/portal\.example\/login"/, "the sign-in button goes to the sign-in page");
  assert.match(html, /src="https:\/\/portal\.example\/email\/portal-qr\.png"/, "the QR code is hosted with the portal");
  for (const v of ["Student ID: HMC-FALL26-IT-0342", "Or your email: ayesha.khan@gmail.com", "Password: Pisa#2026", "Sign in at: https://portal.example/login", "From Pakistan to Italy · departs Fall 2026"]) {
    assert.ok(text.includes(v), `text: ${v}`);
  }
});

test("only the welcome has the Pakistan hero, what happens next and their team", () => {
  const welcome = mail();
  assert.match(welcome.html, /email\/welcome-hero\.jpg/);
  assert.match(welcome.html, /What happens next/);
  assert.match(welcome.html, /Your HMARK team/);
  assert.match(welcome.html, /Sana Ahmed/);
  assert.match(welcome.html, /Senior Counselor/);
  assert.match(welcome.html, /href="tel:03001234567"/);
  assert.match(welcome.html, /href="https:\/\/wa\.me\/923001234567/, "WhatsApp on the counsellor's number");
  assert.match(welcome.html, /mailto:bilal@example\.com/);
  for (const kind of ["login", "new_password"]) {
    const m = mail({ kind });
    assert.match(m.html, /email\/banner-logins\.jpg/, kind);
    assert.ok(!/What happens next|Your HMARK team|welcome-hero/.test(m.html), kind);
    assert.ok(m.html.includes("Pisa#2026"), `${kind} still carries the login`);
  }
  assert.match(mail({ kind: "new_password" }).html, /signed out everywhere/);
});

test("a team member not yet named is said to be coming, not left blank", () => {
  const m = mail({ team: { counsellor: null, officer: null } });
  assert.match(m.html, /Your counsellor will be introduced to you shortly/);
  assert.match(m.html, /handled by the HMARK processing team/);
  assert.match(m.text, /Your counsellor: to be introduced shortly\./);
});

test("without a destination, intake or level the pass still reads", () => {
  const m = mail({ destination: null, intake: null, level: null, studentCode: null });
  assert.match(m.html, /Your destination/);
  assert.ok(!/Class/.test(m.html), "no class row without a level");
  assert.match(m.text, /^Email: ayesha\.khan@gmail\.com$/m, "the email is the login when there is no Student ID");
});

test("every email ends asking them to keep the login to themselves, and with the office's details", () => {
  for (const kind of ["welcome", "login", "new_password"]) {
    const m = mail({ kind });
    assert.match(m.html, /Keep this login to yourself/, kind);
    assert.match(m.html, /Dashityar Chambers/, kind);
    assert.match(m.html, /mailto:info@example\.com/, kind);
    assert.match(m.text, /HMARK Consultants/, kind);
  }
});

test("whatever a record holds is escaped, never run as markup", () => {
  const m = mail({ studentName: "<script>alert(1)</script>", password: 'a"b<c', team: { counsellor: { name: "<b>x</b>", designation: null, phone: null, email: null }, officer: null } });
  assert.ok(!m.html.includes("<script>alert(1)</script>"));
  assert.ok(m.html.includes("a&quot;b&lt;c"));
  assert.ok(!m.html.includes("<b>x</b>"));
});

test("levels and initials are written as people say them", () => {
  assert.equal(levelLabel("masters"), "Master's");
  assert.equal(levelLabel("phd"), "PhD");
  assert.equal(levelLabel("Foundation year"), "Foundation year");
  assert.equal(levelLabel(""), null);
  assert.equal(initials("sana ahmed khan"), "SA");
});
