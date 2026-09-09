import { test } from "node:test";
import assert from "node:assert/strict";
import { phoneError, phoneChangeError, matchesPhonePattern, PHONE_MIN_DIGITS } from "../src/lib/phoneNumber.ts";

const GOOD = [
  "03352272275",        // Pakistani mobile as staff type it
  "0300 1234567",       // ...with a space
  "0321-245-8923",      // ...with dashes
  "021 34567890",       // Karachi landline
  "+92 334 3297870",    // the office WhatsApp number
  "+92 (334) 329-7870", // brackets and dashes together
  "+39 06 69821234",    // an Italian landline, where several students are headed
  "+1 415 555 2671",
];

const BAD = [
  "121", "555", "8181", "1254", "090078601", "4515", "666q", "124536", "111111", "123",
];

test("accepts every real-world format staff and students actually type", () => {
  for (const n of GOOD) assert.equal(phoneError(n), null, n);
});

test("rejects every undialable value found on file", () => {
  for (const n of BAD) assert.notEqual(phoneError(n), null, n);
});

test("says how short the number was, so the message is actionable", () => {
  assert.match(phoneError("121") ?? "", /only 3 digits/);
  assert.match(phoneError("1") ?? "", /only 1 digit\b/);
});

test("names the field, so one of several numbers on a form can be told apart", () => {
  assert.match(phoneError("121", "emergency contact number") ?? "", /emergency contact number/);
});

test("rejects letters mixed into a number", () => {
  assert.match(phoneError("666q") ?? "", /aren't part of a phone number/);
});

test("rejects a number longer than E.164 allows", () => {
  assert.match(phoneError("1234567890123456") ?? "", /longer than any real/);
});

test("treats empty and missing as not-an-error, leaving required-ness to the form", () => {
  for (const empty of ["", "   ", null, undefined]) assert.equal(phoneError(empty), null);
});

// The browser pattern and the server check must agree in both directions: a
// pattern that rejects what the action accepts is a form that will not submit
// with no visible reason, and the reverse lets bad data through the client.
test("the browser pattern accepts exactly what the server accepts", () => {
  for (const n of GOOD) assert.equal(matchesPhonePattern(n), true, `pattern rejected good: ${n}`);
  for (const n of BAD) assert.equal(matchesPhonePattern(n), false, `pattern accepted bad: ${n}`);
});

test("the pattern survived escaping — it is not matching literal d characters", () => {
  // A \d collapsed to "d" yields a pattern that rejects every real number and
  // accepts strings of the letter d. Both directions are checked.
  assert.equal(matchesPhonePattern("0".repeat(PHONE_MIN_DIGITS)), true);
  assert.equal(matchesPhonePattern("d".repeat(PHONE_MIN_DIGITS)), false);
});

test("an untouched bad number does not block an unrelated edit", () => {
  // Saboor Khan's contact is nine digits and his emergency contact reads
  // "4515". Staff opening that record to fix the date of birth must not be
  // stopped by values they may not have the real version of yet.
  assert.equal(phoneChangeError("090078601", "090078601"), null);
  assert.equal(phoneChangeError("4515", "4515", "emergency contact number"), null);
  assert.equal(phoneChangeError("Solo, Tehsil Buleda, District Kech", "Solo, Tehsil Buleda, District Kech", "home phone"), null);
});

test("but editing that field to another bad value is refused", () => {
  assert.match(phoneChangeError("121", "090078601") ?? "", /only 3 digits/);
});

test("correcting it to a real number is accepted", () => {
  assert.equal(phoneChangeError("0335 2272275", "090078601"), null);
});

test("a new bad number on a record that had none is refused", () => {
  assert.match(phoneChangeError("555", null) ?? "", /only 3 digits/);
  assert.match(phoneChangeError("555", "") ?? "", /only 3 digits/);
});

test("whitespace alone is not treated as a change", () => {
  assert.equal(phoneChangeError("  090078601  ", "090078601"), null);
});

test("clearing an optional number is allowed", () => {
  assert.equal(phoneChangeError("", "090078601"), null);
});
