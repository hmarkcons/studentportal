// A login password for someone to be handed, and to keep.
//
// Staff cannot change their own password (the office chose that: only a
// Super Admin issues one), so whatever this makes is what they will type for
// as long as they work here. That decides three things:
//
//   - **Random from the OS, and unbiased.** The staff generator this replaced
//     used Math.random(), which is not a secure source; the student one mapped
//     `byte % alphabet.length`, which makes the first few characters of the
//     alphabet more likely than the rest. Here each character is drawn by
//     rejection sampling, so every one is equally likely.
//   - **No lookalikes.** 0/O, 1/l/I and the rest are left out: this gets read
//     off a screen or an email and typed on a phone, and a password that fails
//     because an l was an I is a support call.
//   - **Every class present**, so it satisfies any complexity rule the auth
//     server is configured with, without having to know which.
//
// Pure apart from the randomness, which is injectable, so it is unit-tested
// (scripts/generate-password-test.mjs).

import { randomBytes } from "node:crypto";

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGIT = "23456789";
const SYMBOL = "!@#%*?";
const ALL = UPPER + LOWER + DIGIT + SYMBOL;

export const PASSWORD_LENGTH = 16;

type RandomSource = (count: number) => Uint8Array;

/** An unbiased index below `n` (n <= 256), drawn from `random`. */
function pick(n: number, random: RandomSource): number {
  // The largest multiple of n that fits in a byte; bytes at or above it are
  // thrown away, which is what removes the modulo bias.
  const limit = 256 - (256 % n);
  for (;;) {
    const [byte] = random(1);
    if (byte < limit) return byte % n;
  }
}

export function generatePassword(length = PASSWORD_LENGTH, random: RandomSource = (n) => randomBytes(n)): string {
  if (length < 4) throw new Error("A password needs room for one of each character class.");

  const chars = [UPPER, LOWER, DIGIT, SYMBOL].map((set) => set[pick(set.length, random)]);
  while (chars.length < length) chars.push(ALL[pick(ALL.length, random)]);

  // Fisher–Yates, so the guaranteed characters are not always the first four.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = pick(i + 1, random);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/** The characters a generated password can contain, for tests and for anyone checking one. */
export const PASSWORD_ALPHABET = ALL;
