import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_APP_FILTERS,
  applicationsFileName,
  applicationsQuery,
  buildApplicationsReport,
  describeApplicationsFilters,
  loginsByApplication,
  narrowsApplications,
  parseApplicationsFilters,
} from "../src/lib/applicationsReport.ts";
import { applicationsWorkbookSheets } from "../src/lib/applicationsWorkbook.ts";
import { REPORT_CATALOGUE, visibleReports } from "../src/lib/reportsCatalogue.ts";

const OFFICER = "11111111-1111-4111-8111-111111111111";
const ITALY = "33333333-3333-4333-8333-333333333333";
const GERMANY = "44444444-4444-4444-8444-444444444444";
const PIPELINE = ["documents_pending", "application_submitted", "under_review", "acceptance_letter", "pre_enrolled"];

function student(id, name, extra = {}) {
  return { id, name, code: `HMC-${id}`, intake: "Fall 2027", officerId: OFFICER, countries: [{ id: ITALY, name: "Italy (Public)" }], ...extra };
}

let n = 0;
function app(studentId, stage, extra = {}) {
  n++;
  return {
    id: `a${n}`,
    studentId,
    number: n,
    universityName: `University ${n}`,
    city: "Pisa",
    country: "Italy (Public)",
    destinationId: ITALY,
    programName: "Computer Engineering",
    level: "masters",
    intake: "Fall 2027",
    roundLabel: null,
    deadline: null,
    stage,
    pipeline: PIPELINE,
    finalized: false,
    finalizedBadge: null,
    portalLink: null,
    ...extra,
  };
}

const login = (applicationId, value, type = "university_portal") => ({ application_id: applicationId, credential_type: type, plaintext: JSON.stringify(value), updated_at: "2026-10-28T09:00:00Z" });

function build(students, apps, loginRows = [], filters = DEFAULT_APP_FILTERS, today = "2026-11-03") {
  return buildApplicationsReport({
    students,
    applications: apps,
    logins: loginsByApplication(loginRows),
    officerNames: new Map([[OFFICER, "Imran Ali"]]),
    filters,
    today,
  });
}

// ------------------------------------------------------------------ logins

test("logins: read from what is stored, named, and empty ones left out", () => {
  const map = loginsByApplication([
    login("a", { username: "ali@x.it", password: "p@ss", link: "uni.it/apply" }),
    { application_id: "b", credential_type: "university_portal", plaintext: "legacy-user", updated_at: null },
    login("c", { username: " ", password: "", link: null }),
    login("a", { username: "u2", password: "p2" }, "universitaly"),
  ]);
  assert.deepEqual(
    map.get("a").map((l) => [l.label, l.username, l.password, l.link]),
    [
      ["University portal", "ali@x.it", "p@ss", "https://uni.it/apply"],
      ["Universitaly", "u2", "p2", null],
    ]
  );
  assert.equal(map.get("b")[0].username, "legacy-user", "a login saved as plain text before logins were JSON");
  assert.ok(!map.has("c"), "an empty login is not a login");
});

// ------------------------------------------------------------------ building

test("each application gets the Applications table's status, its stage and its login", () => {
  const apps = [
    app("s", "documents_pending"),
    app("s", "acceptance_letter"),
    app("s", "declined"),
    app("s", "rejected"),
    app("s", "pre_enrolled", { finalized: true, finalizedBadge: "Pre-Enrolled" }),
  ];
  const r = build([student("s", "Sara")], apps, [login(apps[0].id, { username: "sara", password: "pw" })]);
  const got = r.students[0].applications;
  assert.deepEqual(
    got.map((a) => a.group),
    ["progress", "accepted", "closed", "rejected", "accepted"]
  );
  assert.equal(got[0].stageLabel.length > 0, true);
  assert.deepEqual(got[0].step, { step: 1, of: 5 });
  assert.equal(got[0].logins[0].password, "pw");
  assert.equal(got[4].finalizedBadge, "Pre-Enrolled");
  assert.equal(got[0].level, "Master's", "the level as people write it");
  assert.deepEqual(r.students[0].counts, { total: 5, accepted: 2, progress: 1, closed: 1, rejected: 1, withLogin: 1 });
});

test("a deadline gone by is flagged only while the application is still in progress", () => {
  const r = build(
    [student("s", "Sara")],
    [app("s", "documents_pending", { deadline: "2026-11-01" }), app("s", "acceptance_letter", { deadline: "2026-11-01" }), app("s", "documents_pending", { deadline: "2026-11-03" })]
  );
  assert.deepEqual(
    r.students[0].applications.map((a) => a.deadlinePassed),
    [true, false, false]
  );
});

test("a programme's apply link is passed on only when it is a real address", () => {
  const r = build(
    [student("s", "Sara")],
    [app("s", "documents_pending", { portalLink: "javascript:alert(1)" }), app("s", "documents_pending", { portalLink: "Apply via email" }), app("s", "documents_pending", { portalLink: "www.unipi.it/apply" })]
  );
  assert.deepEqual(
    r.students[0].applications.map((a) => a.portalLink),
    [null, null, "https://www.unipi.it/apply"]
  );
});

test("students are listed by name; one with no application is listed and counted as such", () => {
  const r = build([student("b", "bilal"), student("a", "Ahmed")], [app("a", "documents_pending")]);
  assert.deepEqual(
    r.students.map((s) => s.name),
    ["Ahmed", "bilal"]
  );
  assert.equal(r.students[1].allApplications, 0);
  assert.equal(r.totals.students, 2);
  assert.equal(r.totals.withApplications, 1);
});

// ------------------------------------------------------------------ filters

test("filters: chosen students, officer, and no officer", () => {
  const students = [student("a", "Ahmed"), student("b", "Bano", { officerId: null })];
  const apps = [app("a", "documents_pending"), app("b", "documents_pending")];
  const names = (f) => build(students, apps, [], { ...DEFAULT_APP_FILTERS, ...f }).students.map((s) => s.name);
  assert.deepEqual(names({ students: ["b"] }), ["Bano"]);
  assert.deepEqual(names({ officer: OFFICER }), ["Ahmed"]);
  assert.deepEqual(names({ officer: "none" }), ["Bano"]);
});

test("filters on the applications narrow each student's list and leave out a student with none left", () => {
  const students = [student("a", "Ahmed"), student("b", "Bano"), student("c", "Chand")];
  const apps = [
    app("a", "documents_pending"),
    app("a", "acceptance_letter", { destinationId: GERMANY, country: "Germany (Public)" }),
    app("b", "rejected"),
    app("b", "declined"),
  ];
  const loginRows = [login(apps[0].id, { username: "u", password: "p" })];
  const r = (f) => build(students, apps, loginRows, { ...DEFAULT_APP_FILTERS, ...f });

  const germany = r({ country: GERMANY });
  assert.deepEqual(germany.students.map((s) => s.name), ["Ahmed"]);
  assert.equal(germany.students[0].applications.length, 1);
  assert.equal(germany.students[0].allApplications, 2, "the student's full count is kept, for 'showing 1 of 2'");

  assert.deepEqual(r({ status: "accepted" }).students.map((s) => s.name), ["Ahmed"]);
  assert.deepEqual(r({ status: "ended" }).students.map((s) => [s.name, s.counts.total]), [["Bano", 2]]);
  assert.deepEqual(r({ status: "rejected" }).students.map((s) => [s.name, s.counts.total]), [["Bano", 1]]);
  assert.deepEqual(r({ login: "saved" }).students.map((s) => [s.name, s.counts.total]), [["Ahmed", 1]]);
  assert.deepEqual(r({ login: "missing" }).students.map((s) => [s.name, s.counts.total]), [["Ahmed", 1], ["Bano", 2]]);
  assert.deepEqual(r({}).students.map((s) => s.name), ["Ahmed", "Bano", "Chand"], "with no filter on applications, Chand (none) is listed");
});

test("show: with applications, and without — where the destination picks those pursuing it", () => {
  const students = [student("a", "Ahmed"), student("c", "Chand"), student("d", "Dua", { countries: [{ id: GERMANY, name: "Germany (Public)" }] })];
  const apps = [app("a", "documents_pending")];
  const r = (f) => build(students, apps, [], { ...DEFAULT_APP_FILTERS, ...f }).students.map((s) => s.name);
  assert.deepEqual(r({ show: "with" }), ["Ahmed"]);
  assert.deepEqual(r({ show: "without" }), ["Chand", "Dua"]);
  assert.deepEqual(r({ show: "without", country: GERMANY }), ["Dua"]);
});

test("filters from the address: unknown values fall back, and the query survives a round trip", () => {
  assert.deepEqual(parseApplicationsFilters(new URLSearchParams("status=bogus&show=x&login=y&officer=z&country=Italy")), DEFAULT_APP_FILTERS);
  const f = { students: [OFFICER], officer: "none", country: ITALY, status: "ended", show: "with", login: "missing" };
  assert.deepEqual(parseApplicationsFilters(new URLSearchParams(applicationsQuery(f).slice(1))), f);
  assert.equal(applicationsQuery(DEFAULT_APP_FILTERS), "");
  assert.equal(narrowsApplications(DEFAULT_APP_FILTERS), false);
  assert.equal(narrowsApplications({ ...DEFAULT_APP_FILTERS, login: "saved" }), true);
});

test("the filters described in words, and a file named for one student", () => {
  assert.equal(describeApplicationsFilters(DEFAULT_APP_FILTERS, () => null, () => null), "All registered students");
  assert.equal(
    describeApplicationsFilters({ ...DEFAULT_APP_FILTERS, students: [ITALY], status: "progress", login: "missing" }, () => null, () => null, () => "Ali Raza"),
    "Student: Ali Raza · In progress · No login saved"
  );
  assert.equal(applicationsFileName("2026-11-03", "pdf"), "HMC-Applications-Logins-2026-11-03.pdf");
  assert.equal(applicationsFileName("2026-11-03", "xlsx", { name: "Ali Raza", code: "HMC-FALL27-IT-0003" }), "HMC-Applications-Logins-Ali-Raza-HMC-FALL27-IT-0003-2026-11-03.xlsx");
});

// ------------------------------------------------------------------ the workbook

test("workbook: a summary, every application with its login, and the logins alone — each marked confidential", () => {
  const apps = [app("a", "documents_pending"), app("a", "acceptance_letter"), app("b", "rejected")];
  const r = build([student("a", "Ahmed"), student("b", "Bano"), student("c", "Chand")], apps, [login(apps[1].id, { username: "ahmed@uni.it", password: "S3cret!", link: null })]);
  const meta = { preparedOn: "3 Nov 2026", preparedBy: "Tester", filters: "All registered students", loginsError: null };
  const [summary, applications, logins] = applicationsWorkbookSheets(r, meta);
  assert.deepEqual(
    [summary.sheet, applications.sheet, logins.sheet],
    ["Summary", "Applications", "Portal logins"]
  );
  for (const sheet of [summary, applications, logins]) {
    assert.ok(
      sheet.data.slice(0, 3).some((row) => /CONFIDENTIAL — contains passwords/.test(row[0]?.value ?? "")),
      `${sheet.sheet} says it holds passwords`
    );
  }

  const header = applications.data[1].map((c) => c?.value);
  assert.equal(applications.stickyRowsCount, 2);
  assert.equal(applications.data.length, 2 + 3, "a row per application");
  const pw = header.indexOf("Password");
  const withLogin = applications.data.find((row) => row[pw]?.value === "S3cret!");
  assert.ok(withLogin, "the password is in full");
  assert.equal(withLogin[header.indexOf("Status")].value, "Offer or later");
  assert.equal(applications.data.filter((row) => row[header.indexOf("Login")]?.value === "No login saved").length, 2);

  assert.equal(logins.data.length, 2 + 1, "one row per login, nothing for the applications without one");
  const totalRow = summary.data.at(-1);
  assert.equal(totalRow[1].value, "Total");
  assert.equal(totalRow[6].value, 3);
  const chand = summary.data.find((row) => row[1]?.value === "Chand");
  assert.equal(chand[6].value, "No application yet");
});

test("workbook: when the logins could not be read it says so, rather than claiming there are none", () => {
  const r = build([student("a", "Ahmed")], [app("a", "documents_pending")]);
  const meta = { preparedOn: "x", preparedBy: null, filters: "y", loginsError: "function missing" };
  const [summary, , logins] = applicationsWorkbookSheets(r, meta);
  assert.ok(summary.data.some((row) => /could not be read: function missing/.test(row[0]?.value ?? "")));
  assert.match(logins.data.at(-1)[0].value, /could not be read/);
});

test("the report is for Processing and Super Admin only", () => {
  const entry = REPORT_CATALOGUE.find((r) => r.href === "/reports/applications-logins");
  assert.ok(entry);
  const sees = (role) => visibleReports(role).some((r) => r.href === entry.href);
  assert.ok(sees("super_admin") && sees("processing"));
  for (const role of ["management", "counselor", "finance", "marketing", "digital_marketing"]) assert.ok(!sees(role), `${role} should not see it`);
});
