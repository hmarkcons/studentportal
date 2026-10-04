// The personal details a student is registered with: date of birth, address,
// and who to call in an emergency — their name, how they are related, their
// number. All five are required, the office's choice, wherever a student is
// registered: the Register student form, "Register this lead", and the
// registered-students import.
//
// The date of birth and the address are on the student's own row (leads); the
// emergency contact is on student_profiles, which is where the Profile tab and
// the student's portal read it. Pure — scripts/registration-personal-test.mjs.

import { dateOfBirthError } from "./dateOfBirth.ts";
import { phoneError } from "./phoneNumber.ts";

export const REGISTRATION_PERSONAL_FIELDS = [
  { key: "date_of_birth", label: "Date of birth", maxLength: 10 },
  { key: "address", label: "Address", maxLength: 300 },
  { key: "emergency_contact_name", label: "Emergency contact name", maxLength: 120 },
  { key: "emergency_contact_relation", label: "Relation", maxLength: 60 },
  { key: "emergency_contact_number", label: "Emergency contact number", maxLength: 30 },
] as const;

export type RegistrationPersonalKey = (typeof REGISTRATION_PERSONAL_FIELDS)[number]["key"];
export type RegistrationPersonal = Record<RegistrationPersonalKey, string>;

/** Common answers for the relation box; anything else may be typed. */
export const EMERGENCY_RELATIONS = ["Father", "Mother", "Brother", "Sister", "Spouse", "Guardian", "Uncle", "Aunt", "Friend"];

/**
 * Reads the five from a form or a sheet row and checks them.
 *
 * `missing` names every blank one, so a person filling the form, or the
 * import's preview, is told all of them at once rather than one per attempt.
 */
export function readRegistrationPersonal(
  get: (key: RegistrationPersonalKey) => unknown
): { values: RegistrationPersonal } | { error: string; missing: string[] } {
  const values = {} as RegistrationPersonal;
  const missing: string[] = [];
  for (const f of REGISTRATION_PERSONAL_FIELDS) {
    const raw = get(f.key);
    const value = (typeof raw === "string" ? raw : raw == null ? "" : String(raw)).trim();
    if (!value) missing.push(f.label.toLowerCase());
    values[f.key] = value;
  }
  // "relation" alone reads badly in a list of what is missing.
  const named = missing.map((m) => (m === "relation" ? "emergency contact relation" : m));
  if (named.length) {
    return { error: `Give the student's ${listed(named)} — all are required to register.`, missing: named };
  }
  const tooLong = REGISTRATION_PERSONAL_FIELDS.find((f) => values[f.key].length > f.maxLength);
  if (tooLong) return { error: `${tooLong.label} is longer than ${tooLong.maxLength} characters.`, missing: [] };
  const dob = dateOfBirthError(values.date_of_birth);
  if (dob) return { error: dob, missing: [] };
  const phone = phoneError(values.emergency_contact_number, "emergency contact number");
  if (phone) return { error: phone, missing: [] };
  return { values };
}

function listed(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
