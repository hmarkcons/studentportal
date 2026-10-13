// Where signing in lands (src/lib/signInLanding.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { postSignInPath, sentLink } from "../src/lib/signInLanding.ts";

const ID = "0d6c1f2a-3b4c-4d5e-8f90-a1b2c3d4e5f6";
const ID2 = "9a8b7c6d-5e4f-4321-8abc-def012345678";

test("with nowhere asked for, the Dashboard", () => {
  for (const next of ["", null, undefined, "/"]) assert.equal(postSignInPath(next), "/");
});

test("a section's own page, a bookmark or a remembered address goes to the Dashboard", () => {
  for (const next of [
    "/reports",
    "/reports/visa-approval",
    "/leads",
    "/leads?status=new&page=2",
    "/students",
    "/finance/invoices",
    "/portal/documents",
    "/portal/logins",
    "/partner",
  ]) {
    assert.equal(postSignInPath(next), "/", next);
  }
});

test("a page about one record opens", () => {
  assert.equal(postSignInPath(`/students/${ID}`), `/students/${ID}`);
  assert.equal(postSignInPath(`/students/${ID}/applications/${ID2}?tab=documents`), `/students/${ID}/applications/${ID2}?tab=documents`);
  assert.equal(postSignInPath(`/tasks?task=${ID}`), `/tasks?task=${ID}`, "named in the query");
  assert.equal(postSignInPath(`/portal/applications/${ID}`), `/portal/applications/${ID}`);
  assert.equal(postSignInPath(`/leads/${ID.toUpperCase()}`), `/leads/${ID.toUpperCase()}`);
});

test("the office QR check-in opens, token and all", () => {
  assert.equal(postSignInPath("/attendance/checkin?token=a1b2c3"), "/attendance/checkin?token=a1b2c3");
});

test("a link the portal sent opens, whatever it points at, without its mark", () => {
  assert.equal(postSignInPath("/my-leave?via=email"), "/my-leave");
  assert.equal(postSignInPath("/portal/documents?via=email"), "/portal/documents");
  assert.equal(postSignInPath("/calendar?view=day&date=2026-10-13&via=email"), "/calendar?view=day&date=2026-10-13");
  assert.equal(postSignInPath("/reports?via=elsewhere"), "/", "only the portal's own mark");
});

test("never back to the sign-in page, an API or anywhere off the site", () => {
  for (const next of [
    "/login",
    "/login?next=/reports",
    "/api/sign-out",
    "/access-pending",
    "//evil.example/x",
    "/\\evil.example",
    "https://evil.example/students/" + ID,
    "javascript:alert(1)",
  ]) {
    assert.equal(postSignInPath(next), "/", next);
  }
});

test("an emailed link carries the mark, and signing in from it opens it", () => {
  const link = sentLink("https://portal.example.com/", "/tasks?task=1");
  assert.equal(link, "https://portal.example.com/tasks?task=1&via=email");
  assert.equal(sentLink("https://portal.example.com", "/my-leave"), "https://portal.example.com/my-leave?via=email");
  assert.equal(sentLink("https://portal.example.com", "/a#b"), "https://portal.example.com/a?via=email#b");
  // As the proxy hands it on: the path and the query, signed out.
  const asked = new URL(sentLink("https://portal.example.com", "/admin/leave"));
  assert.equal(postSignInPath(asked.pathname + asked.search), "/admin/leave");
});
