// A password a Super Admin chooses for someone (src/lib/passwordPolicy.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { chosenPasswordError, passwordRules, PASSWORD_MAX } from "../src/lib/passwordPolicy.ts";
import { generatePassword } from "../src/lib/generatePassword.ts";

test("a good password passes", () => {
  assert.equal(chosenPasswordError("Karachi2026"), null);
  assert.equal(chosenPasswordError("pass word 9 with spaces inside"), null);
  assert.equal(chosenPasswordError("Überprüfung7"), null);
});

test("it says what is missing, in words", () => {
  assert.equal(chosenPasswordError(""), "Type a password, or generate one.");
  assert.equal(chosenPasswordError("abc1"), "The password needs at least 8 characters.");
  assert.equal(chosenPasswordError("abcdefghij"), "The password needs a number.");
  assert.equal(chosenPasswordError("1234567890"), "The password needs a letter.");
  assert.equal(chosenPasswordError("!!!"), "The password needs at least 8 characters, a letter and a number.");
});

test("no invisible spaces at the ends, and no longer than the hash reads", () => {
  assert.match(chosenPasswordError(" Karachi2026") ?? "", /space/);
  assert.match(chosenPasswordError("Karachi2026 ") ?? "", /space/);
  assert.match(chosenPasswordError(`a1${"x".repeat(PASSWORD_MAX)}`) ?? "", /72 characters/);
});

test("the rules tick off as a password is typed", () => {
  assert.deepEqual(passwordRules("abc").map((r) => r.met), [false, true, false]);
  assert.deepEqual(passwordRules("abcdefg8").map((r) => r.met), [true, true, true]);
});

test("every generated password meets the rules", () => {
  for (let i = 0; i < 200; i++) assert.equal(chosenPasswordError(generatePassword()), null);
});
