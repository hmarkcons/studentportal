// The country an agreement is for (src/lib/agreementCountry.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { agreementDestination } from "../src/lib/agreementCountry.ts";

const ITALY = { track: "public", display_name: "Italy (Public)" };
const UK = { track: "private", display_name: "United Kingdom (Private)" };

test("the agreement's own country comes first", () => {
  assert.deepEqual(agreementDestination({ destination: ITALY, template: { destination: UK } }), ITALY);
  assert.deepEqual(agreementDestination({ destination: [ITALY], template: [{ destination: [UK] }] }), ITALY);
});

test("a general template's agreement has only its own", () => {
  assert.deepEqual(agreementDestination({ destination: UK, template: { destination: null } }), UK);
});

test("an older query that embeds only the template still finds the country", () => {
  assert.deepEqual(agreementDestination({ template: { destination: ITALY } }), ITALY);
  assert.deepEqual(agreementDestination({ destination: null, template: [{ destination: [ITALY] }] }), ITALY);
});

test("nothing anywhere is nothing", () => {
  assert.equal(agreementDestination(null), null);
  assert.equal(agreementDestination({}), null);
  assert.equal(agreementDestination({ destination: [], template: null }), null);
});
