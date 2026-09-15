import test from "node:test";
import assert from "node:assert/strict";
import { visaCountries } from "../src/lib/visaCountries.ts";

const app = (o) => ({ id: "a", isFinalized: false, countryCode: null, countryName: null, universityName: null, ...o });

test("a country with nothing finalised has no visa process yet", () => {
  const out = visaCountries([
    app({ id: "1", countryCode: "IT", countryName: "Italy (Public)", universityName: "Pisa" }),
    app({ id: "2", countryCode: "IT", countryName: "Italy (Public)", universityName: "Siena" }),
  ]);
  assert.deepEqual(out, []);
});

test("once a country is finalised, only the finalised application counts", () => {
  const out = visaCountries([
    app({ id: "1", countryCode: "IT", countryName: "Italy (Public)", universityName: "Pisa" }),
    app({ id: "2", countryCode: "IT", countryName: "Italy (Public)", universityName: "Siena", isFinalized: true }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].appId, "2");
  assert.deepEqual(out[0].universities, ["Siena"], "the application they are not going on is not listed");
});

test("the test is per country, not across the student", () => {
  // Italy is settled; Germany is still open and must not appear.
  const out = visaCountries([
    app({ id: "1", countryCode: "IT", countryName: "Italy (Public)", universityName: "Pisa", isFinalized: true }),
    app({ id: "2", countryCode: "DE", countryName: "Germany (Public)", universityName: "TUM" }),
  ]);
  assert.deepEqual(out.map((c) => c.code), ["IT"]);
});

test("two finalised countries both appear", () => {
  const out = visaCountries([
    app({ id: "1", countryCode: "IT", countryName: "Italy (Public)", universityName: "Pisa", isFinalized: true }),
    app({ id: "2", countryCode: "DE", countryName: "Germany (Public)", universityName: "TUM", isFinalized: true }),
  ]);
  assert.deepEqual(out.map((c) => c.code), ["DE", "IT"], "named order, so two staff read the same list");
});

test("an application with no country is ignored rather than crashing", () => {
  const out = visaCountries([app({ id: "1", isFinalized: true }), app({ id: "2", countryCode: "IT", countryName: "Italy", isFinalized: true })]);
  assert.deepEqual(out.map((c) => c.code), ["IT"]);
});

test("a country with no display name falls back to its code", () => {
  const out = visaCountries([app({ id: "1", countryCode: "NC", countryName: null, isFinalized: true })]);
  assert.equal(out[0].name, "NC");
});

test("two finalised applications in one country list both universities", () => {
  // Should not happen — applications_one_finalized_per_cycle forbids it — but
  // the list must not silently drop one if it ever does.
  const out = visaCountries([
    app({ id: "1", countryCode: "IT", countryName: "Italy", universityName: "Pisa", isFinalized: true }),
    app({ id: "2", countryCode: "IT", countryName: "Italy", universityName: "Siena", isFinalized: true }),
  ]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].universities, ["Pisa", "Siena"]);
});

test("no applications at all is an empty list, not an error", () => {
  assert.deepEqual(visaCountries([]), []);
});
