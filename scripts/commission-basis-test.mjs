import test from "node:test";
import assert from "node:assert/strict";
import { commissionFor, monthStartOf } from "../src/lib/staffCommissionBasis.ts";

const staff = {
  currency: "PKR",
  commission_rate_general: 10,
  commission_rate_public_universities: 5,
  commission_type_general: "percentage",
  commission_type_public_universities: "percentage",
};

const privateBasis = { track: "private", consultancyFee: 200000, currency: "PKR" };

test("a percentage of the fee, on the general rate", () => {
  const r = commissionFor(staff, privateBasis);
  assert.equal(r.ok, true);
  assert.equal(r.amount, 20000);
  assert.equal(r.rate, 10);
});

test("a public-track destination uses the public rate, not the general one", () => {
  const r = commissionFor(staff, { track: "public", consultancyFee: 200000, currency: "PKR" });
  assert.equal(r.ok, true);
  assert.equal(r.amount, 10000);
});

test("a flat rate is the amount itself, whatever the fee is", () => {
  const flat = { ...staff, commission_type_general: "flat", commission_rate_general: 5000 };
  assert.equal(commissionFor(flat, privateBasis).amount, 5000);
  assert.equal(commissionFor(flat, { ...privateBasis, consultancyFee: 5 }).amount, 5000);
});

test("a flat rate does not need a fee at all — it is payable before one is known", () => {
  const flat = { ...staff, commission_type_general: "flat", commission_rate_general: 5000 };
  const r = commissionFor(flat, { track: "private", consultancyFee: null, currency: null });
  assert.equal(r.ok, true);
  assert.equal(r.amount, 5000);
});

test("rounds to the cent rather than carrying fractions into the ledger", () => {
  const r = commissionFor({ ...staff, commission_rate_general: 7.5 }, { track: "private", consultancyFee: 12345, currency: "PKR" });
  assert.equal(r.amount, 925.88);
});

test("no counselor assigned is a reason, not an amount", () => {
  const r = commissionFor(null, privateBasis);
  assert.equal(r.ok, false);
  assert.match(r.reason, /counselor/i);
});

test("no signed agreement is a reason — the track decides which rate applies", () => {
  assert.equal(commissionFor(staff, null).ok, false);
  assert.match(commissionFor(staff, { track: null, consultancyFee: 1, currency: null }).reason, /signed agreement/i);
});

test("a missing rate names which of the two rates is missing", () => {
  const noPublic = { ...staff, commission_rate_public_universities: null };
  assert.match(commissionFor(noPublic, { track: "public", consultancyFee: 1, currency: "PKR" }).reason, /public-university/);
  const noGeneral = { ...staff, commission_rate_general: null };
  assert.match(commissionFor(noGeneral, privateBasis).reason, /private-university/);
});

test("a fee discounted down to nothing earns nothing, and says so", () => {
  const r = commissionFor(staff, { track: "private", consultancyFee: 0, currency: "PKR" });
  assert.equal(r.ok, false);
  assert.match(r.reason, /zero after discount/i);
  // Negative too — a discount larger than the fee is still nothing owed.
  assert.equal(commissionFor(staff, { track: "private", consultancyFee: -500, currency: "PKR" }).ok, false);
});

test("a zero rate is a real rate — zero owed, not a missing rate", () => {
  const r = commissionFor({ ...staff, commission_rate_general: 0 }, privateBasis);
  assert.equal(r.ok, true);
  assert.equal(r.amount, 0);
});

test("the fee's own currency wins for a percentage; the staff's for a flat amount", () => {
  assert.equal(commissionFor(staff, { track: "private", consultancyFee: 1000, currency: "EUR" }).currency, "EUR");
  const flat = { ...staff, commission_type_general: "flat", commission_rate_general: 5000 };
  assert.equal(commissionFor(flat, { track: "private", consultancyFee: 1000, currency: "EUR" }).currency, "PKR");
});

test("monthStartOf keys a date to the month the payroll stores", () => {
  assert.equal(monthStartOf("2026-09-11"), "2026-09-01");
  assert.equal(monthStartOf("2026-01-01"), "2026-01-01");
});
