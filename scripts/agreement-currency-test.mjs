// An agreement in euro or rupees (0351), and the green banner's two lines.
//
// What these guard against is a contract with the wrong money on it: a rupee
// agreement printing euro figures because the rate went missing, a chart whose
// rows no longer add up to its total once converted, a rupee amount printed
// with a sign the PDF cannot draw, and a banner whose heading runs into its
// sentence.
import test from "node:test";
import assert from "node:assert/strict";
import {
  STANDARD_AGREEMENT_PKR_PER_EUR,
  agreementConversion,
  agreementCurrencyOf,
  agreementNetFee,
  agreementSymbol,
  convertFee,
  parseAgreementCurrency,
} from "../src/lib/agreementCurrency.ts";
import { REFERENCE_THEME, formatAmount, themedFeeRows } from "../src/lib/pdf/agreementTheme.ts";
import { wordingToBlocks } from "../src/lib/pdf/templateWording.ts";

const form = (fields) => {
  const m = new Map(Object.entries(fields));
  return { has: (k) => m.has(k), get: (k) => (m.has(k) ? m.get(k) : null) };
};

// ------------------------------------------------------------------ which currency

test("the standard rate is 335 rupees to the euro", () => {
  assert.equal(STANDARD_AGREEMENT_PKR_PER_EUR, 335);
});

test("an agreement is in its own choice, else its country's fee currency", () => {
  assert.equal(agreementCurrencyOf("PKR", "EUR"), "PKR");
  assert.equal(agreementCurrencyOf(null, "EUR"), "EUR");
  assert.equal(agreementCurrencyOf(null, "PKR"), "PKR");
  assert.equal(agreementCurrencyOf("USD", "PKR"), "PKR", "only euro or rupees are a choice");
  assert.equal(agreementCurrencyOf(null, null), "EUR");
});

// ------------------------------------------------------------------ the form

test("form: no currency posted leaves the agreement in its country's currency", () => {
  assert.equal(parseAgreementCurrency(form({ template_id: "x" }), "EUR"), null);
});

test("form: the country's own currency needs no rate and keeps none", () => {
  assert.deepEqual(parseAgreementCurrency(form({ currency: "EUR", pkr_per_eur: "335" }), "EUR"), { currency: "EUR", pkr_per_eur: null });
  assert.deepEqual(parseAgreementCurrency(form({ currency: "pkr" }), "PKR"), { currency: "PKR", pkr_per_eur: null });
});

test("form: the other currency keeps the rate given", () => {
  assert.deepEqual(parseAgreementCurrency(form({ currency: "PKR", pkr_per_eur: "335" }), "EUR"), { currency: "PKR", pkr_per_eur: 335 });
  assert.deepEqual(parseAgreementCurrency(form({ currency: "EUR", pkr_per_eur: "340.5" }), "PKR"), { currency: "EUR", pkr_per_eur: 340.5 });
});

test("form: the other currency without a usable rate, or a currency that is not offered, is refused", () => {
  for (const bad of [
    { currency: "PKR" },
    { currency: "PKR", pkr_per_eur: "" },
    { currency: "PKR", pkr_per_eur: "0" },
    { currency: "PKR", pkr_per_eur: "-335" },
    { currency: "PKR", pkr_per_eur: "three hundred" },
    { currency: "USD", pkr_per_eur: "335" },
  ]) {
    assert.ok("error" in parseAgreementCurrency(form(bad), "EUR"), JSON.stringify(bad));
  }
});

// ------------------------------------------------------------------ converting

test("euro to rupees is to the rupee, rupees to euro to the cent", () => {
  assert.equal(convertFee(1800, "EUR", "PKR", 335), 603000);
  assert.equal(convertFee(250.5, "EUR", "PKR", 335), 83918);
  assert.equal(convertFee(150000, "PKR", "EUR", 335), 447.76);
  assert.equal(convertFee(150000, "PKR", "PKR", 335), 150000);
  assert.equal(convertFee(150000, "PKR", "EUR", null), 150000, "no rate, no conversion");
});

test("an agreement in its country's currency is not converted, whatever rate it carries", () => {
  const c = agreementConversion("EUR", { currency: "EUR", pkr_per_eur: 335 });
  assert.equal(c.currency, "EUR");
  assert.equal(c.rate, null);
  assert.equal(c.convert(1800), 1800);
  const legacy = agreementConversion("PKR", { currency: null, pkr_per_eur: null });
  assert.equal(legacy.currency, "PKR", "an agreement made before 0351 prints as it did");
  assert.equal(legacy.convert(150000), 150000);
});

test("an agreement in the other currency is converted at its own rate", () => {
  const c = agreementConversion("EUR", { currency: "PKR", pkr_per_eur: "335.00" });
  assert.equal(c.currency, "PKR");
  assert.equal(c.rate, 335);
  assert.equal(c.convert(300), 100500);
});

test("an agreement in the other currency with no rate is refused, never printed unconverted", () => {
  assert.ok("error" in agreementConversion("EUR", { currency: "PKR", pkr_per_eur: null }));
  assert.ok("error" in agreementConversion("EUR", { currency: "PKR" }));
});

test("rupees are written PKR — the ₨ sign is not in the PDF's fonts — and set apart from the figure", () => {
  assert.equal(agreementSymbol("PKR"), "PKR");
  assert.equal(agreementSymbol("EUR"), "€");
  assert.equal(formatAmount(agreementSymbol("PKR"), 603000, { symbol: "before", decimals: "when-needed" }), "PKR 603,000");
  assert.equal(formatAmount(agreementSymbol("PKR"), 603000, { symbol: "after", decimals: "when-needed" }), "603,000 PKR");
  assert.equal(formatAmount("€", 1800, { symbol: "before", decimals: "when-needed" }), "€1,800", "a sign stays against the figure");
});

test("a converted chart still adds up: Sweden in rupees with a spouse and two children, two instalments", () => {
  const c = agreementConversion("EUR", { currency: "PKR", pkr_per_eur: 335 });
  const admin = c.convert(300);
  const fee = c.convert(1800);
  const family = { spouses: 1, children: 2, spouseFee: c.convert(500), childFee: c.convert(250) };
  const owed = fee + family.spouses * family.spouseFee + family.children * family.childFee;
  const rows = themedFeeRows(
    {
      currencySymbol: agreementSymbol(c.currency),
      adminCharge: admin,
      consultancyFee: fee,
      installmentAmounts: [owed / 2, owed / 2],
      discount: 0,
      total: admin + owed,
      isBackup: false,
      destinationLabel: "Sweden (Public)",
      family,
    },
    REFERENCE_THEME.fee
  );
  const values = rows.filter((r) => !r.total).map((r) => r.value);
  assert.deepEqual(values, [100500, 469000, 469000]);
  assert.equal(rows.at(-1).value, 1038500, "€3,100 at 335");
  assert.equal(values.reduce((a, b) => a + b, 0), rows.at(-1).value);
  assert.match(rows.at(-1).note, /1 × 167,500 PKR.*2 × 83,750 PKR/);
});

// ------------------------------------------------------------------ the agreement's own figures (0352)

const SWEDEN = { consultancy_fee: 1800, consultancy_fee_currency: "EUR" };

test("a rupee agreement's own figures are rupees; only the country's fee is converted", () => {
  // Typed in rupees on a rupee agreement: taken as they are.
  assert.deepEqual(agreementNetFee({ consultancy_fee_override: 600000, discount_amount: 20000, currency: "PKR", pkr_per_eur: 335 }, SWEDEN), {
    consultancyFee: 580000,
    currency: "PKR",
  });
  // Nothing typed: the country's 1,800 euro at 335, less the agreement's own rupee discount.
  assert.deepEqual(agreementNetFee({ discount_amount: 3000, currency: "PKR", pkr_per_eur: 335 }, SWEDEN), { consultancyFee: 600000, currency: "PKR" });
});

test("an agreement in its country's currency, or from before 0351, is as it always was", () => {
  assert.deepEqual(agreementNetFee({ consultancy_fee_override: 1500, discount_amount: 100 }, SWEDEN), { consultancyFee: 1400, currency: "EUR" });
  assert.deepEqual(agreementNetFee({}, { consultancy_fee: 150000, consultancy_fee_currency: "PKR" }), { consultancyFee: 150000, currency: "PKR" });
  assert.deepEqual(agreementNetFee({}, { consultancy_fee: 150000 }), { consultancyFee: 150000, currency: null }, "a country naming no currency stays unnamed");
});

// ------------------------------------------------------------------ the banner

const BANNER =
  '<table data-border="#52be96"><tbody><tr><td colspan="1" rowspan="1" data-fill="#52be96">' +
  '<p style="text-align: center;"><span style="color: rgb(255, 255, 255); font-size: 11pt;"><strong>NO VISA GUARANTEE | NO JOB GUARANTEE</strong></span></p>' +
  "%GAP%" +
  '<p style="text-align: center;"><span style="color: rgb(255, 255, 255); font-size: 9.5pt;">HMARK Consultants does not guarantee any visa or job.</span></p>' +
  "</td></tr></tbody></table>";

const bannerCell = (html) => wordingToBlocks(html, {}).find((b) => b.kind === "richTable").rows[0].cells[0];

test("banner: the heading and the sentence under it are two lines, not one run-on line", () => {
  const cell = bannerCell(BANNER.replace("%GAP%", ""));
  const text = cell.runs.map((r) => r.text).join("");
  assert.equal(text, "NO VISA GUARANTEE | NO JOB GUARANTEE\nHMARK Consultants does not guarantee any visa or job.");
  assert.equal(cell.align, "center");
  assert.ok(cell.runs.find((r) => r.text.startsWith("NO VISA")).bold, "the heading stays bold");
  assert.equal(cell.runs.find((r) => r.text.startsWith("HMARK")).size, 9.5, "each line keeps its own size");
});

test("banner: an empty paragraph between the two is left out, so every banner reads the same", () => {
  for (const gap of ['<p style="text-align: center;"></p>', "<p><br></p>"]) {
    const text = bannerCell(BANNER.replace("%GAP%", gap)).runs.map((r) => r.text).join("");
    assert.equal(text, "NO VISA GUARANTEE | NO JOB GUARANTEE\nHMARK Consultants does not guarantee any visa or job.", gap);
  }
});

test("a cell of one paragraph reads as it always did", () => {
  const html = "<table><tbody><tr><td><p>Total Professional Fee</p></td><td><p>€3,100</p></td></tr></tbody></table>";
  const block = wordingToBlocks(html, {}).find((b) => b.kind === "richTable" || b.kind === "feeTable");
  // A table naming the professional fee is taken as the payment chart's place (see looksLikeFeeTable).
  assert.equal(block.kind, "feeTable");
  const plain = wordingToBlocks("<table><tbody><tr><td><p>One</p></td><td><p>Two</p></td></tr></tbody></table>", {}).find((b) => b.kind === "richTable");
  assert.deepEqual(
    plain.rows[0].cells.map((c) => c.runs.map((r) => r.text).join("")),
    ["One", "Two"]
  );
});
