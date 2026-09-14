import test from "node:test";
import assert from "node:assert/strict";
import { signInErrorMessage } from "../src/lib/signInError.ts";

test("no error means nothing to say", () => {
  assert.equal(signInErrorMessage(null), null);
});

test("a wrong password stays vague, so it cannot confirm an email is registered", () => {
  const msg = signInErrorMessage({ status: 400, code: "invalid_credentials", message: "Invalid login credentials" });
  assert.equal(msg, "Incorrect email or password.");
});

test("a rate limit is not reported as a wrong password", () => {
  for (const e of [
    { status: 429, code: "over_request_rate_limit", message: "Request rate limit reached" },
    { status: 429 },
    { status: 400, message: "Email rate limit exceeded" },
    { code: "over_email_send_rate_limit", status: 400 },
  ]) {
    const msg = signInErrorMessage(e);
    assert.match(msg, /Too many sign-in attempts/, JSON.stringify(e));
    assert.doesNotMatch(msg, /Incorrect/, JSON.stringify(e));
  }
});

test("an unactivated account says so, because no password would ever work", () => {
  const msg = signInErrorMessage({ status: 400, code: "email_not_confirmed", message: "Email not confirmed" });
  assert.match(msg, /not been activated/);
});

test("a suspended account is told to contact the office", () => {
  assert.match(signInErrorMessage({ status: 403, code: "user_banned" }), /suspended/);
});

test("a request that never arrived is not the user's fault", () => {
  // AuthRetryableFetchError carries no status at all.
  assert.match(signInErrorMessage({ message: "Failed to fetch" }), /temporarily unavailable/);
  assert.match(signInErrorMessage({ status: 503 }), /temporarily unavailable/);
});

test("every message is something a student could act on", () => {
  for (const e of [
    { status: 400, code: "invalid_credentials" },
    { status: 429 },
    { status: 400, code: "email_not_confirmed" },
    { status: 403, code: "user_banned" },
    { status: 503 },
    {},
  ]) {
    const msg = signInErrorMessage(e);
    assert.ok(msg && msg.length > 10, JSON.stringify(e));
    // No internal vocabulary leaking onto the login page.
    assert.doesNotMatch(msg, /supabase|auth_?api|4\d\d|5\d\d/i, msg);
  }
});
