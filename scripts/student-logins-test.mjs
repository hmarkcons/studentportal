// The logins a registered student sees on their own pages (src/lib/studentLogins.ts, 0333).
import { test } from "node:test";
import assert from "node:assert/strict";
import { loginsFromRows, visaAppointmentLogin, scholarshipLogins, applicationLogins } from "../src/lib/studentLogins.ts";

const STUDENT = "s1";
const row = (credential_type, plaintext, extra = {}) => ({ owner_type: "student", owner_id: STUDENT, credential_type, university: null, plaintext, ...extra });
const login = (username, password, link = null) => JSON.stringify({ username, password, link });

test("each login reads as its username, password and page, under the name Portal credentials gives it", () => {
  const [gmail] = loginsFromRows([row("gmail", login("ali@gmail.com", "Secret1!", "https://accounts.google.com"))]);
  assert.deepEqual(gmail, {
    ownerType: "student",
    ownerId: STUDENT,
    credentialType: "gmail",
    university: null,
    label: "Gmail",
    username: "ali@gmail.com",
    password: "Secret1!",
    link: "https://accounts.google.com",
  });
});

test("a login kept against an application is named for its university", () => {
  const [uni] = loginsFromRows([
    { owner_type: "application", owner_id: "a1", credential_type: "university_portal", university: "Roma Tre University", plaintext: login("u", "p") },
  ]);
  assert.equal(uni.label, "University portal — Roma Tre University");
  assert.equal(uni.ownerId, "a1");
  const [unnamed] = loginsFromRows([
    { owner_type: "application", owner_id: "a2", credential_type: "university_portal", university: null, plaintext: login("u", "p") },
  ]);
  assert.equal(unnamed.label, "University portal — your university");
});

test("this portal's own login, an empty one and an unknown owner are left out", () => {
  const logins = loginsFromRows([
    row("portal_login", login("me@x.com", "pw")),
    row("gmail", login("", "")),
    row("university_portal", login("", "", "https://uni.example")),
    { ...row("gmail", login("u", "p")), owner_type: "partner" },
  ]);
  assert.deepEqual(
    logins.map((l) => l.credentialType),
    ["university_portal"],
    "a login with only its page still shows",
  );
});

test("a login saved as plain text, before logins were JSON, still shows its username", () => {
  const [old] = loginsFromRows([row("visa_portal", "ali.vfs")]);
  assert.equal(old.username, "ali.vfs");
  assert.equal(old.password, "");
});

test("a link that is not a web address is not offered", () => {
  const [l] = loginsFromRows([row("gmail", login("u", "p", "javascript:alert(1)"))]);
  assert.equal(l.link, null);
});

test("they come in Portal credentials' order: Gmail, university, visa, then the rest; the student's before an application's", () => {
  const logins = loginsFromRows([
    row("zz_other", login("u", "p")),
    row("visa_appointment_portal", login("u", "p")),
    { owner_type: "application", owner_id: "a1", credential_type: "university_portal", university: "Pisa", plaintext: login("u", "p") },
    row("university_portal", login("u", "p")),
    row("gmail", login("u", "p")),
  ]);
  assert.deepEqual(
    logins.map((l) => l.label),
    ["Gmail", "University portal", "University portal — Pisa", "Visa appointment portal", "Zz other"],
  );
});

test("the visa page takes the preset, else one typed by hand before it existed", () => {
  const preset = loginsFromRows([row("vfs_login", login("old", "p")), row("visa_appointment_portal", login("new", "p"))]);
  assert.equal(visaAppointmentLogin(preset).username, "new");
  const legacy = loginsFromRows([row("gmail", login("g", "p")), row("vfs_login", login("old", "p"))]);
  assert.equal(visaAppointmentLogin(legacy).username, "old");
  assert.equal(visaAppointmentLogin(loginsFromRows([row("gmail", login("g", "p"))])), null);
});

test("the scholarship page lists its portals by their own names", () => {
  const logins = loginsFromRows([
    row("scholarship_portal:Universitaly", login("u", "p")),
    row("scholarship_portal:DSU Toscana", login("d", "p")),
    row("gmail", login("g", "p")),
  ]);
  assert.deepEqual(
    scholarshipLogins(logins).map((l) => l.label),
    ["DSU Toscana", "Universitaly"],
  );
});

test("an application page shows only the logins kept against it", () => {
  const logins = loginsFromRows([
    { owner_type: "application", owner_id: "a1", credential_type: "university_portal", university: "Pisa", plaintext: login("p1", "x") },
    { owner_type: "application", owner_id: "a2", credential_type: "university_portal", university: "Siena", plaintext: login("s1", "x") },
    row("university_portal", login("own", "x")),
  ]);
  assert.deepEqual(
    applicationLogins(logins, "a2").map((l) => l.username),
    ["s1"],
  );
});
