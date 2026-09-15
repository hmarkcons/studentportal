import test from "node:test";
import assert from "node:assert/strict";
import {
  clientIp,
  normaliseIp,
  accessVerdict,
  isAccessAllowedPath,
  approvalDays,
  approvalExpiry,
  ACCESS_PENDING_PATH,
  DEFAULT_APPROVAL_DAYS,
} from "../src/lib/officeAccess.ts";

const headers = (map) => ({ get: (k) => map[k.toLowerCase()] ?? null });

// ------------------------------------------------------------ reading the IP
test("x-real-ip is believed over x-forwarded-for", () => {
  // A client can send its own x-forwarded-for; it cannot forge x-real-ip.
  const ip = clientIp(headers({ "x-real-ip": "203.0.113.5", "x-forwarded-for": "1.2.3.4" }));
  assert.equal(ip, "203.0.113.5");
});

test("the first entry of x-forwarded-for is the client, not the last", () => {
  // Taking the last would read our own edge network as the visitor.
  assert.equal(clientIp(headers({ "x-forwarded-for": "203.0.113.5, 70.41.3.18, 150.172.238.178" })), "203.0.113.5");
});

test("no header at all is null, not a guess", () => {
  assert.equal(clientIp(headers({})), null);
  assert.equal(clientIp(headers({ "x-forwarded-for": "" })), null);
  assert.equal(clientIp(headers({ "x-real-ip": "   " })), null);
});

test("a port is stripped, because Postgres will not parse one", () => {
  assert.equal(normaliseIp("203.0.113.5:54321"), "203.0.113.5");
  assert.equal(clientIp(headers({ "x-real-ip": "203.0.113.5:54321" })), "203.0.113.5");
});

test("bracketed IPv6 loses its brackets and its port", () => {
  assert.equal(normaliseIp("[2001:db8::1]:443"), "2001:db8::1");
  assert.equal(normaliseIp("[2001:db8::1]"), "2001:db8::1");
});

test("bare IPv6 is left alone — its colons are not a port", () => {
  assert.equal(normaliseIp("2001:db8::1"), "2001:db8::1");
  assert.equal(normaliseIp("2001:db8:0:0:0:0:0:1"), "2001:db8:0:0:0:0:0:1");
});

test("an IPv4 address mapped into IPv6 comes back as IPv4", () => {
  assert.equal(normaliseIp("::ffff:203.0.113.5"), "203.0.113.5");
});

// ------------------------------------------------------------- the verdict
test("a student or partner is never gated", () => {
  assert.deepEqual(accessVerdict({ is_staff: false, allowed: true }, "/portal"), { allow: true });
});

test("staff on the office network are let through", () => {
  assert.deepEqual(
    accessVerdict({ is_staff: true, allowed: true, on_office_network: true }, "/students"),
    { allow: true }
  );
});

test("a blocked staff member is sent to the waiting screen", () => {
  const v = accessVerdict({ is_staff: true, allowed: false, gate_configured: true }, "/students");
  assert.deepEqual(v, { allow: false, redirectTo: ACCESS_PENDING_PATH });
});

test("and is left alone once they are on it", () => {
  // Otherwise the redirect loops.
  assert.deepEqual(accessVerdict({ allowed: false }, ACCESS_PENDING_PATH), { allow: true });
});

test("a blocked staff member can still sign out and sign in again", () => {
  assert.deepEqual(accessVerdict({ allowed: false }, "/login"), { allow: true });
  assert.equal(isAccessAllowedPath("/api/sign-out"), true);
});

test("the waiting screen's own assets still load", () => {
  assert.equal(isAccessAllowedPath("/_next/static/chunk.js"), true);
  assert.equal(isAccessAllowedPath("/students"), false);
  assert.equal(isAccessAllowedPath("/portal"), false);
});

test("a blocked session cannot reach the search API", () => {
  // It answers with student names and universities. A session that can still
  // call it has been stopped from seeing the pages, not from reading the data.
  assert.equal(isAccessAllowedPath("/api/search"), false);
  assert.equal(isAccessAllowedPath("/api/search?q=ali"), false);
  assert.deepEqual(accessVerdict({ allowed: false }, "/api/search"), {
    allow: false,
    redirectTo: ACCESS_PENDING_PATH,
  });
});

test("no answer from the database fails open", () => {
  // A gate that locks everybody out when it cannot reach the database is a
  // worse outage than the risk it manages.
  assert.deepEqual(accessVerdict(null, "/students"), { allow: true });
});

test("an unconfigured gate lets everyone through", () => {
  assert.deepEqual(
    accessVerdict({ is_staff: true, allowed: true, gate_configured: false }, "/students"),
    { allow: true }
  );
});

// ------------------------------------------------------------- approvals
test("an approval defaults to a week", () => {
  assert.equal(approvalDays(undefined), DEFAULT_APPROVAL_DAYS);
  assert.equal(approvalDays(""), DEFAULT_APPROVAL_DAYS);
  assert.equal(approvalDays(0), DEFAULT_APPROVAL_DAYS);
  assert.equal(approvalDays(-3), DEFAULT_APPROVAL_DAYS);
  assert.equal(approvalDays("banana"), DEFAULT_APPROVAL_DAYS);
});

test("a chosen length is honoured, and a typo cannot grant a decade", () => {
  assert.equal(approvalDays(1), 1);
  assert.equal(approvalDays(14), 14);
  assert.equal(approvalDays("30"), 30);
  assert.equal(approvalDays(3650), 90);
});

test("the expiry is a whole number of days from now, by the calendar", () => {
  const now = new Date("2026-09-15T10:00:00Z");
  assert.equal(approvalExpiry(7, now).toISOString(), "2026-09-22T10:00:00.000Z");
  // Across a month end, which millisecond arithmetic gets right but is worth
  // pinning anyway.
  assert.equal(approvalExpiry(3, new Date("2026-09-30T10:00:00Z")).toISOString(), "2026-10-03T10:00:00.000Z");
});
