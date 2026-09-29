// "Keep me signed in", unticked (src/lib/sessionCookies.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { SESSION_ONLY_COOKIE, sessionOnlyCookieOptions, hasSessionOnlyMarker } from "../src/lib/sessionCookies.ts";

test("an auth cookie loses its lifetime, so it goes when the browser closes", () => {
  const out = sessionOnlyCookieOptions({ path: "/", sameSite: "lax", maxAge: 400 * 86400, expires: new Date(Date.now() + 86400000) });
  assert.deepEqual(out, { path: "/", sameSite: "lax" });
});

test("a deletion is left as it is, or signing out would leave the cookie behind", () => {
  const deletion = { path: "/", maxAge: 0 };
  assert.deepEqual(sessionOnlyCookieOptions(deletion), deletion);
  const expired = { path: "/", expires: new Date(0) };
  assert.deepEqual(sessionOnlyCookieOptions(expired), expired);
});

test("no options stays no options", () => {
  assert.equal(sessionOnlyCookieOptions(undefined), undefined);
});

test("the marker is found among the page's cookies", () => {
  assert.equal(hasSessionOnlyMarker(`a=1; ${SESSION_ONLY_COOKIE}=1; b=2`), true);
  assert.equal(hasSessionOnlyMarker("a=1; b=2"), false);
  assert.equal(hasSessionOnlyMarker(`x${SESSION_ONLY_COOKIE}=1`), false);
});
