// Which application fee a programme charges, how it is written, and how a
// sheet's currency and email cells are read (0287).
import test from "node:test";
import assert from "node:assert/strict";
import { effectiveFee, firstAmount, formatFee, parseFeeCurrency, parseEmail, parseFeeText, parseTuitionText, plainAmount, tuitionPhrase } from "../src/lib/applicationFee.ts";

const uni = (fee, currency = "EUR") => ({ application_fee: fee, application_fee_currency: currency });

test("a programme's own fee wins over the university's", () => {
  assert.deepEqual(effectiveFee(uni(50, "GBP"), uni(30)), { amount: "50", currency: "GBP", from: "programme" });
});

test("a programme with no fee charges the university's", () => {
  assert.deepEqual(effectiveFee(uni(null, null), uni(30)), { amount: "30", currency: "EUR", from: "university" });
  assert.deepEqual(effectiveFee(null, uni("30.00")), { amount: "30", currency: "EUR", from: "university" });
});

test("a free application is a fee of zero, not no fee", () => {
  // Zero is an answer — "it costs nothing" — and must not fall through to the
  // university's fee the way a blank does.
  assert.deepEqual(effectiveFee(uni(0), uni(30)), { amount: "0", currency: "EUR", from: "programme" });
});

test("a fee in words is a fee, and is shown exactly as written (0303)", () => {
  assert.deepEqual(effectiveFee(uni("Free for EU students"), uni(30)), { amount: "Free for EU students", currency: "EUR", from: "programme" });
  assert.equal(formatFee("Free for EU students", "EUR"), "Free for EU students");
  assert.equal(formatFee("€30 (EU) / €50 (non-EU)", "GBP"), "€30 (EU) / €50 (non-EU)");
  // A bare amount is still an amount in its currency.
  assert.equal(formatFee("30", "EUR"), "€30");
  assert.equal(formatFee("45.50", "GBP"), "£45.50");
});

test("a typed fee is stored one way: an amount as the number, words as written", () => {
  assert.deepEqual(parseFeeText("30"), { text: "30", symbolCurrency: null });
  assert.deepEqual(parseFeeText("30.00"), { text: "30", symbolCurrency: null });
  assert.deepEqual(parseFeeText("€3,000"), { text: "3000", symbolCurrency: "EUR" });
  assert.deepEqual(parseFeeText("£45.5"), { text: "45.50", symbolCurrency: "GBP" });
  assert.deepEqual(parseFeeText("  Free   for EU  "), { text: "Free for EU", symbolCurrency: null });
  assert.deepEqual(parseFeeText("   "), { text: null, symbolCurrency: null });
  assert.deepEqual(parseFeeText(45.5), { text: "45.50", symbolCurrency: null });
});

test("tuition keeps its symbol, having no currency of its own", () => {
  assert.equal(parseTuitionText("3,000"), "3000");
  assert.equal(parseTuitionText("€3,000"), "€3,000");
  assert.equal(parseTuitionText("€3,000 per year"), "€3,000 per year");
  assert.equal(parseTuitionText(""), null);
});

test("an amount is read out of a fee only where one is written", () => {
  assert.equal(plainAmount("3000"), 3000);
  assert.equal(plainAmount("Free"), null);
  assert.equal(firstAmount("€3,000 per year"), 3000);
  assert.equal(firstAmount("3 000.50 a semester"), 3000.5);
  assert.equal(firstAmount("3000–4500"), 3000);
  assert.equal(firstAmount("On request"), null);
});

test("a commission suggested from tuition in words says which words", () => {
  assert.equal(tuitionPhrase(10, "EUR", "3000"), "10% of EUR 3000.00 tuition");
  assert.equal(tuitionPhrase(10, "EUR", 3000), "10% of EUR 3000.00 tuition");
  assert.equal(tuitionPhrase(10, "EUR", "€3,000 per year"), "10% of EUR 3000.00 tuition (from “€3,000 per year”)");
});

test("no fee anywhere is null", () => {
  assert.equal(effectiveFee(uni(null, null), uni(null, null)), null);
  assert.equal(effectiveFee(null, null), null);
});

test("a fee read with no currency takes the university's, then the fallback", () => {
  assert.equal(effectiveFee(uni(40, null), uni(30, "GBP")).currency, "GBP");
  assert.equal(effectiveFee(uni(40, null), uni(null, null), "HUF").currency, "HUF");
});

test("fees are written the way they are quoted", () => {
  assert.equal(formatFee(50, "EUR"), "€50");
  assert.equal(formatFee("75.50", "GBP"), "£75.50");
  assert.equal(formatFee(120, "USD"), "US$120");
  assert.match(formatFee(12000, "HUF"), /^HUF\s12,000$/);
  assert.equal(formatFee(0, "EUR"), "€0");
});

test("a currency cell takes a code in any case, or a symbol", () => {
  const problems = [];
  assert.equal(parseFeeCurrency("gbp", "75", problems, "c"), "GBP");
  assert.equal(parseFeeCurrency("€", "50", problems, "c"), "EUR");
  assert.deepEqual(problems, []);
});

test("a blank currency cell is taken from the fee cell's symbol, else says nothing", () => {
  assert.equal(parseFeeCurrency("", "€50", [], "c"), "EUR");
  assert.equal(parseFeeCurrency("", "£ 75", [], "c"), "GBP");
  assert.equal(parseFeeCurrency("", "50", [], "c"), null);
  assert.equal(parseFeeCurrency(undefined, undefined, [], "c"), null);
});

test("an unknown currency is reported and left unchanged", () => {
  const problems = [];
  assert.equal(parseFeeCurrency("Euros", "50", problems, "program_application_fee_currency"), null);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /program_application_fee_currency "Euros" is not a currency/);
});

test("an email needs an @ in the middle; anything else is reported, blank says nothing", () => {
  const problems = [];
  assert.equal(parseEmail("  coordinator@unipv.it ", problems, "coordinator_email"), "coordinator@unipv.it");
  assert.equal(parseEmail("", problems, "coordinator_email"), null);
  assert.deepEqual(problems, []);
  assert.equal(parseEmail("Prof. Rossi", problems, "coordinator_email"), null);
  assert.equal(parseEmail("a@b@c", problems, "coordinator_email"), null);
  assert.equal(problems.length, 2);
});
