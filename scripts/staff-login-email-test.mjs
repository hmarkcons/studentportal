import { test } from "node:test";
import assert from "node:assert/strict";
import { staffLoginHtml, staffLoginSubject, staffLoginText } from "../src/lib/staffLoginEmail.ts";

const base = {
  staffName: "Ayesha Khan",
  email: "ayesha@hmarkconsultants.com",
  password: "Ab3!xYz9Pq#rT7mK",
  loginUrl: "https://portal.example.com/login",
  issuedBy: "Abdul Hadi",
  reason: "reissued",
};

test("the mail carries the email, the password and where to sign in", () => {
  const text = staffLoginText(base);
  assert.match(text, /ayesha@hmarkconsultants\.com/);
  assert.match(text, /Ab3!xYz9Pq#rT7mK/);
  assert.match(text, /https:\/\/portal\.example\.com\/login/);
  const html = staffLoginHtml(base);
  assert.ok(html.includes("Ab3!xYz9Pq#rT7mK"));
  assert.ok(html.includes('href="https://portal.example.com/login"'));
});

test("a reissue says the old password is gone and they were signed out", () => {
  assert.match(staffLoginText(base), /previous password no longer works/);
  assert.match(staffLoginText(base), /signed out/);
  assert.equal(staffLoginSubject(base), "Your new HMARK portal login");
});

test("a password a Super Admin set: said as that, for a student with their Student ID too", () => {
  const set = { ...base, reason: "password_set", audience: "student", studentCode: "HMC-SEP27-IT-0007" };
  assert.equal(staffLoginSubject(set), "Your new HMARK portal password");
  const text = staffLoginText(set);
  assert.match(text, /new password has been set for your HMARK Student Portal account by Abdul Hadi/);
  assert.match(text, /previous password no longer works/);
  assert.match(text, /HMC-SEP27-IT-0007/);
  assert.match(text, /ask your counsellor at HMARK/);
  assert.doesNotMatch(text, /Super Admin/);
  assert.ok(staffLoginHtml(set).includes("HMC-SEP27-IT-0007"));
});

test("a partner university's mail names its own portal and sends them to HMARK", () => {
  const set = { ...base, reason: "password_set", audience: "partner" };
  assert.match(staffLoginText(set), /HMARK partner portal account/);
  assert.match(staffLoginText(set), /tell HMARK straight away/);
});

test("a new account is worded as a first login", () => {
  const first = { ...base, reason: "new_account" };
  assert.match(staffLoginText(first), /account has been created for you/);
  assert.doesNotMatch(staffLoginText(first), /previous password/);
  assert.equal(staffLoginSubject(first), "Your HMARK portal login");
});

test("it never tells them to change a password they cannot change", () => {
  // Staff have no change-password setting; sending them to look for one
  // would be a support call.
  for (const reason of ["new_account", "reissued"]) {
    const text = staffLoginText({ ...base, reason });
    assert.doesNotMatch(text, /change (it|your password) after/i);
    assert.match(text, /ask your Super Admin/);
  }
});

test("names and values are escaped in the HTML", () => {
  const html = staffLoginHtml({ ...base, staffName: "<script>x</script>", password: "a<b&c" });
  assert.ok(!html.includes("<script>x</script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("a&lt;b&amp;c"));
});
