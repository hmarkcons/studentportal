// The logins a registered student sees on their own pages (src/lib/studentLogins.ts, 0333).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loginsFromRows,
  visaAppointmentLogin,
  scholarshipLogins,
  applicationLogins,
  loginKind,
  groupLogins,
  dashboardLogins,
  loginAnchor,
  loginAccent,
  loginHeading,
} from "../src/lib/studentLogins.ts";

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
    kind: "email",
    updatedAt: null,
  });
  const [dated] = loginsFromRows([row("gmail", login("u", "p"), { updated_at: "2026-10-12T09:00:00Z" })]);
  assert.equal(dated.updatedAt, "2026-10-12T09:00:00Z");
});

test("each login is a kind of account, which is its group on the Logins page", () => {
  const kind = (credentialType, ownerType = "student") => loginKind({ credentialType, ownerType });
  assert.equal(kind("gmail"), "email");
  assert.equal(kind("outlook_mail"), "email");
  assert.equal(kind("university_portal"), "university");
  assert.equal(kind("anything", "application"), "university", "kept against an application is the university's");
  assert.equal(kind("universitaly"), "university");
  assert.equal(kind("visa_appointment_portal"), "visa");
  assert.equal(kind("vfs_login"), "visa");
  assert.equal(kind("scholarship_portal:DSU Toscana"), "scholarship");
  assert.equal(kind("scholarship_portal:Visa help desk"), "scholarship", "the prefix decides before the words");
  assert.equal(kind("zztmp_agency"), "other");
});

test("the groups come in the page's order, each in its section's colour, the empty ones left out", () => {
  const logins = loginsFromRows([
    row("zz_other", login("o", "p")),
    row("visa_appointment_portal", login("v", "p")),
    row("gmail", login("g", "p")),
    { owner_type: "application", owner_id: "a1", credential_type: "university_portal", university: "Pisa", plaintext: login("u", "p") },
  ]);
  const groups = groupLogins(logins);
  assert.deepEqual(
    groups.map((g) => [g.kind, g.logins.length, g.accent]),
    [
      ["email", 1, 1],
      ["university", 1, 2],
      ["visa", 1, 5],
      ["other", 1, 3],
    ],
  );
  assert.equal(loginAccent("scholarship"), 4);
});

test("the Dashboard shows two, Gmail first, and names the rest", () => {
  const logins = loginsFromRows([
    row("visa_appointment_portal", login("v", "p")),
    row("scholarship_portal:DSU", login("s", "p")),
    row("university_portal", login("u", "p")),
    row("gmail", login("g", "p")),
  ]);
  const { shown, more } = dashboardLogins(logins);
  assert.deepEqual(
    shown.map((l) => l.credentialType),
    ["gmail", "university_portal"],
  );
  assert.equal(more.length, 2);
  assert.deepEqual(dashboardLogins(logins.slice(0, 2)).more, []);
});

test("a card is headed by the name that tells it apart, with its kind under it", () => {
  const logins = loginsFromRows([
    { owner_type: "application", owner_id: "a1", credential_type: "university_portal", university: "University of Pisa", plaintext: login("u", "p") },
    row("scholarship_portal:DSU Toscana", login("s", "p")),
    row("gmail", login("g", "p")),
  ]);
  const [uni, scholarship, gmail] = ["university_portal", "scholarship_portal:DSU Toscana", "gmail"].map((t) => logins.find((l) => l.credentialType === t));
  assert.deepEqual(loginHeading(uni), { title: "University of Pisa", caption: "University portal" });
  assert.deepEqual(loginHeading(scholarship), { title: "DSU Toscana", caption: "Scholarship portal" });
  assert.deepEqual(loginHeading(gmail), { title: "Gmail", caption: null });
});

test("each login has an address on the Logins page of its own", () => {
  assert.equal(
    loginAnchor({ ownerId: "0d6c1f2a-1111-2222", credentialType: "scholarship_portal:DSU Toscana" }),
    "login-0d6c1f2a-scholarship-portal-dsu-toscana",
  );
  assert.notEqual(
    loginAnchor({ ownerId: "aaaaaaaa-1", credentialType: "university_portal" }),
    loginAnchor({ ownerId: "bbbbbbbb-1", credentialType: "university_portal" }),
    "two universities' portals",
  );
  assert.equal(loginAnchor({ ownerId: "aaaaaaaa", credentialType: "::" }), "login-aaaaaaaa-account");
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
