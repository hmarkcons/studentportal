import test from "node:test";
import assert from "node:assert/strict";
import { orderOffices, whereToApply, kindLabel, needsChecking } from "../src/lib/visaOffices.ts";

const o = (p) => ({
  id: Math.random().toString(36).slice(2),
  kind: "embassy", name: "X", city: null, operator: null, address: null, phone: null, email: null,
  website: null, appointmentUrl: null, officeHours: null, jurisdiction: null,
  submitsApplications: false, notes: null, sourceUrl: null, verifiedAt: null, ...p,
});

test("the place applications are lodged comes first", () => {
  const out = orderOffices([
    o({ kind: "embassy", name: "Embassy of Italy", city: "Islamabad" }),
    o({ kind: "visa_centre", name: "BLS Karachi", city: "Karachi", operator: "BLS", submitsApplications: true }),
  ]);
  assert.equal(out[0].name, "BLS Karachi");
});

test("then the mission, then the consulate, then the rest", () => {
  const out = orderOffices([
    o({ kind: "visa_centre", name: "Centre", city: "Lahore" }),
    o({ kind: "consulate", name: "Consulate", city: "Karachi" }),
    o({ kind: "embassy", name: "Embassy", city: "Islamabad" }),
  ]);
  assert.deepEqual(out.map((x) => x.name), ["Embassy", "Consulate", "Centre"]);
});

test("within a group, by city", () => {
  const out = orderOffices([
    o({ kind: "visa_centre", name: "C", city: "Lahore", submitsApplications: true }),
    o({ kind: "visa_centre", name: "A", city: "Islamabad", submitsApplications: true }),
    o({ kind: "visa_centre", name: "B", city: "Karachi", submitsApplications: true }),
  ]);
  assert.deepEqual(out.map((x) => x.city), ["Islamabad", "Karachi", "Lahore"]);
});

// --------------------------------------------------------- where to apply
test("a country with a centre says the embassy is not the place", () => {
  const line = whereToApply([
    o({ kind: "embassy", name: "Embassy of Italy", city: "Islamabad" }),
    o({ kind: "visa_centre", name: "BLS Islamabad", city: "Islamabad", operator: "BLS International", submitsApplications: true }),
    o({ kind: "visa_centre", name: "BLS Karachi", city: "Karachi", operator: "BLS International", submitsApplications: true }),
  ]);
  assert.match(line, /BLS International/);
  assert.match(line, /Islamabad, Karachi/);
  assert.match(line, /not at the embassy/);
});

test("a country with no centre says so outright", () => {
  // The case the office named: a student who has only heard of VFS goes
  // looking for a centre that does not exist.
  const line = whereToApply([
    o({ kind: "embassy", name: "Embassy of Ukraine", city: "Islamabad", submitsApplications: true }),
  ]);
  assert.match(line, /no visa application centre for this country/);
  assert.match(line, /Islamabad/);
});

test("a consulate that takes applications is called a consulate", () => {
  const line = whereToApply([o({ kind: "consulate", name: "Consulate", city: "Karachi", submitsApplications: true })]);
  assert.match(line, /at the consulate in Karachi/);
});

test("nothing marked as taking applications says nothing rather than guessing", () => {
  assert.equal(whereToApply([o({ kind: "embassy", name: "Embassy", city: "Islamabad" })]), null);
  assert.equal(whereToApply([]), null);
});

test("a centre with no operator recorded still reads as a sentence", () => {
  const line = whereToApply([o({ kind: "visa_centre", name: "Centre", city: "Lahore", submitsApplications: true })]);
  assert.match(line, /the visa application centre in Lahore/);
  assert.doesNotMatch(line, /null|undefined/);
});

test("both a mission and a centre taking applications names them both", () => {
  const line = whereToApply([
    o({ kind: "embassy", name: "Embassy of Turkey", city: "Islamabad", submitsApplications: true }),
    o({ kind: "visa_centre", name: "Gerry's Lahore", city: "Lahore", submitsApplications: true }),
  ]);
  assert.match(line, /Embassy of Turkey/);
  assert.match(line, /Gerry's Lahore/);
});

test("kinds read as English, not as column values", () => {
  assert.equal(kindLabel("visa_centre"), "Visa application centre");
  assert.equal(kindLabel("high_commission"), "High Commission");
  assert.equal(kindLabel("embassy"), "Embassy");
  // An unknown value is shown as-is rather than blanked.
  assert.equal(kindLabel("something_else"), "something_else");
});

test("an unconfirmed entry is flagged", () => {
  assert.equal(needsChecking(o({ verifiedAt: null })), true);
  assert.equal(needsChecking(o({ verifiedAt: "2026-09-15T00:00:00Z" })), false);
});
