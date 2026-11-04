// SRB tax on a student's agreement (0353), and the rate as typed on an
// agreement or invoice form.
//
// What these guard against: a payment chart whose rows no longer add up to
// its total once the tax is in it; an agreement made before the tax quietly
// growing a tax row when it is regenerated; and a rate box that takes a
// negative figure or 500%.
import test from "node:test";
import assert from "node:assert/strict";
import { SRB_TAX_RATE, computeInvoiceMath, parseTaxRate, taxRateText } from "../src/lib/invoiceMath.ts";
import { REFERENCE_THEME, taxFeeRow, themedFeeRows } from "../src/lib/pdf/agreementTheme.ts";

test("the standard SRB tax is 5%", () => {
  assert.equal(SRB_TAX_RATE, 5);
});

test("a tax rate is any figure from 0 to 100, to two decimals", () => {
  assert.equal(parseTaxRate("5"), 5);
  assert.equal(parseTaxRate(" 7.5 "), 7.5);
  assert.equal(parseTaxRate("16%"), 16);
  assert.equal(parseTaxRate("0"), 0, "no tax is a rate");
  assert.equal(parseTaxRate("100"), 100);
  assert.equal(parseTaxRate("2.345"), 2.35);
  for (const bad of ["", "  ", "-1", "100.01", "five", null, undefined]) assert.equal(parseTaxRate(bad), null, String(bad));
  assert.equal(taxRateText(5), "5");
  assert.equal(taxRateText(7.5), "7.5");
});

const fee = (over) => ({
  currencySymbol: "€",
  adminCharge: 300,
  consultancyFee: 1800,
  installmentAmounts: [1700],
  discount: 100,
  total: 2000,
  isBackup: false,
  destinationLabel: "Italy (Public)",
  ...over,
});

test("chart: the tax is a row after the payments and before a total that includes it", () => {
  // 300 + 1800 - 100 = 2000 after discount; 5% is 100.
  const rows = themedFeeRows(fee({ total: 2100, tax: { rate: 5, amount: 100, base: 2000 } }), REFERENCE_THEME.fee);
  const tax = rows.at(-2);
  assert.match(tax.label, /^SRB Tax \(5%\)$/);
  assert.match(tax.note, /On (€2,000|2,000 €), the total after discount/);
  assert.equal(tax.value, 100);
  const values = rows.filter((r) => !r.total).map((r) => r.value);
  assert.equal(values.reduce((a, b) => a + b, 0), rows.at(-1).value, "the rows add up to the total");
  assert.equal(rows.at(-1).value, 2100);
});

test("chart: instalments and the tax add up too", () => {
  const rows = themedFeeRows(fee({ installmentAmounts: [850, 850], total: 2150, tax: { rate: 7.5, amount: 150, base: 2000 } }), REFERENCE_THEME.fee);
  const values = rows.filter((r) => !r.total).map((r) => r.value);
  assert.deepEqual(values, [300, 850, 850, 150]);
  assert.equal(values.reduce((a, b) => a + b, 0), rows.at(-1).value);
  assert.match(rows.at(-2).label, /7\.5%/);
});

test("chart: an agreement with no tax — made before 0353, or at 0% — has no tax row", () => {
  for (const tax of [undefined, null, { rate: 0, amount: 0, base: 2000 }]) {
    const rows = themedFeeRows(fee({ tax }), REFERENCE_THEME.fee);
    assert.ok(!rows.some((r) => /SRB/.test(r.label)), JSON.stringify(tax));
    assert.equal(taxFeeRow({ tax }, String), null);
  }
});

test("chart: a visa-only and a backup country's agreement carry the tax the same way", () => {
  const visa = themedFeeRows(fee({ isVisaOnly: true, adminCharge: 0, consultancyFee: 500, installmentAmounts: [500], discount: 0, total: 525, tax: { rate: 5, amount: 25, base: 500 } }), REFERENCE_THEME.fee);
  assert.deepEqual(visa.filter((r) => !r.total).map((r) => r.value), [500, 25]);
  const backup = themedFeeRows(fee({ isBackup: true, consultancyFee: 0, installmentAmounts: [0], discount: 0, total: 315, tax: { rate: 5, amount: 15, base: 300 } }), REFERENCE_THEME.fee);
  assert.deepEqual(backup.filter((r) => !r.total).map((r) => r.value), [300, 15]);
});

test("the agreement's tax is the invoice's: the same base and rate give the same total", () => {
  // An invoice taxes the whole of it after the discount (tax base "total", 0258).
  const math = computeInvoiceMath({ consultancyFee: 1800, adminCharge: 300, discountAmount: 100, taxRate: 5 });
  assert.equal(math.taxableAmount, 2000);
  assert.equal(math.taxAmount, 100);
  assert.equal(math.total, 2100);
});
