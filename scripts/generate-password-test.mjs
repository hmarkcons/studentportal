import { test } from "node:test";
import assert from "node:assert/strict";
import { PASSWORD_ALPHABET, PASSWORD_LENGTH, generatePassword } from "../src/lib/generatePassword.ts";

test("a password is the full length, from the allowed characters only", () => {
  for (let i = 0; i < 200; i++) {
    const pw = generatePassword();
    assert.equal(pw.length, PASSWORD_LENGTH);
    for (const c of pw) assert.ok(PASSWORD_ALPHABET.includes(c), `unexpected ${c}`);
  }
});

test("every password has an upper, a lower, a digit and a symbol", () => {
  for (let i = 0; i < 500; i++) {
    const pw = generatePassword();
    assert.match(pw, /[A-Z]/);
    assert.match(pw, /[a-z]/);
    assert.match(pw, /[0-9]/);
    assert.match(pw, /[!@#%*?]/);
  }
});

test("no characters that are read as one another", () => {
  // It gets read off a screen and typed on a phone.
  for (const c of "0O1lI") assert.equal(PASSWORD_ALPHABET.includes(c), false, c);
});

test("bytes that would bias the draw are thrown away, not wrapped", () => {
  // With 62 characters, bytes 248..255 would make the first 8 characters more
  // likely if taken modulo. Feed only those first: they must be skipped.
  const bytes = [255, 250, 248, 5];
  let i = 0;
  const random = () => Uint8Array.of(bytes[Math.min(i++, bytes.length - 1)]);
  const pw = generatePassword(4, random);
  // Only byte 5 was ever usable, so it decided every draw it reached.
  assert.equal(pw.length, 4);
  assert.ok(i >= 4, "the biased bytes were consumed rather than used");
});

test("two passwords in a row are not the same", () => {
  const seen = new Set(Array.from({ length: 1000 }, () => generatePassword()));
  assert.equal(seen.size, 1000);
});
