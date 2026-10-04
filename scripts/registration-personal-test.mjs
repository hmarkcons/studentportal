// The five personal details a student is registered with — date of birth,
// address and the emergency contact's name, relation and number — all
// required, on the form, behind "Register this lead" and in the import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { REGISTRATION_PERSONAL_FIELDS, readRegistrationPersonal } from "../src/lib/registrationPersonal.ts";

const full = {
  date_of_birth: "2003-05-14",
  address: " 12 Garden Road, Karachi ",
  emergency_contact_name: "Imran Khan",
  emergency_contact_relation: "Father",
  emergency_contact_number: "+92 300 7654321",
};
const read = (row) => readRegistrationPersonal((k) => row[k]);

test("all five given are read, trimmed", () => {
  const r = read(full);
  assert.ok("values" in r);
  assert.equal(r.values.address, "12 Garden Road, Karachi");
  assert.equal(r.values.emergency_contact_relation, "Father");
});

test("every blank one is named at once, not one per attempt", () => {
  const r = read({ ...full, address: "  ", emergency_contact_relation: "", emergency_contact_number: null });
  assert.ok("error" in r);
  assert.deepEqual(r.missing, ["address", "emergency contact relation", "emergency contact number"]);
  assert.match(r.error, /address, emergency contact relation and emergency contact number — all are required/);
});

test("nothing at all names all five", () => {
  const r = read({});
  assert.ok("error" in r);
  assert.equal(r.missing.length, REGISTRATION_PERSONAL_FIELDS.length);
});

test("a date of birth that cannot be right, or a number too short to dial, is refused", () => {
  const future = read({ ...full, date_of_birth: "2099-01-01" });
  assert.ok("error" in future && /future/.test(future.error));
  const garbled = read({ ...full, date_of_birth: "14/05/2003" });
  assert.ok("error" in garbled && /valid date/.test(garbled.error));
  const short = read({ ...full, emergency_contact_number: "12345" });
  assert.ok("error" in short && /emergency contact number/.test(short.error));
});

test("a value longer than its box holds is refused, naming the field", () => {
  const r = read({ ...full, emergency_contact_relation: "x".repeat(61) });
  assert.ok("error" in r && /^Relation is longer than 60/.test(r.error));
});
