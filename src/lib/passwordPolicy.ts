// What a password a Super Admin chooses for someone has to be.
//
// Only a Super Admin sets or resets a password here — for a staff member
// (themselves included), a student or a partner university — and they may
// type one or generate one (generatePassword.ts). A person then keeps it:
// nobody can change their own password in the portal. So the rules are the
// ones that stop a password being weak or mistyped, and no more:
//
//   - at least 8 characters, with a letter and a number in it;
//   - no more than 72, because the auth server's hashing reads no further and
//     a longer one would quietly be the same as its first 72 characters;
//   - no space at either end, which is invisible on the screen it is read off
//     and in the email it arrives in, and so gets typed wrong.
//
// Pure, so it is unit-tested (scripts/password-policy-test.mjs), and shared by
// the form (to say what is missing as it is typed) and the server actions (to
// refuse it).

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

export type PasswordRule = { id: "length" | "letter" | "number"; label: string; met: boolean };

/** Each rule a password has to meet, and whether it does — for the form to tick off. */
export function passwordRules(password: string): PasswordRule[] {
  return [
    { id: "length", label: `At least ${PASSWORD_MIN} characters`, met: password.length >= PASSWORD_MIN },
    { id: "letter", label: "A letter", met: /\p{L}/u.test(password) },
    { id: "number", label: "A number", met: /\p{Nd}/u.test(password) },
  ];
}

/** Why a chosen password will not do, in a sentence; null when it will. */
export function chosenPasswordError(password: string): string | null {
  if (!password) return "Type a password, or generate one.";
  if (password !== password.trim()) return "A password can't start or end with a space — nobody would see it to type it.";
  if (password.length > PASSWORD_MAX) return `Keep it to ${PASSWORD_MAX} characters or fewer.`;
  const missing = passwordRules(password)
    .filter((r) => !r.met)
    .map((r) => (r.id === "length" ? `at least ${PASSWORD_MIN} characters` : r.id === "letter" ? "a letter" : "a number"));
  if (missing.length === 0) return null;
  const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(", ")} and ${missing.at(-1)}`;
  return `The password needs ${list}.`;
}
