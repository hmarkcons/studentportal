// What an invoice says about who it is from, and whether it says anything
// about a bank. Both used to be fixed in code: the company block and small
// print, and a "Bank details not yet configured" line printed to students.
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ISSUER, issuerFromSettings, bankFromSettings, hasBankDetails, hasPaymentInstructions } from "../src/lib/invoiceIssuer.ts";

test("with nothing to read, the invoice says exactly what it always did", () => {
  assert.deepEqual(issuerFromSettings(null), DEFAULT_ISSUER);
  assert.deepEqual(issuerFromSettings({}), DEFAULT_ISSUER);
});

test("the settings' own text is used, one line per line", () => {
  const i = issuerFromSettings({
    company_name: "  HMARK Consultants (Pvt.) Ltd.  ",
    company_address: "Office 4, Block 7\r\n\r\nKarachi\n",
    company_email: "accounts@hmarkconsultants.com",
    footer_note: "First line.\nSecond line.",
    tax_label: "Sales Tax",
  });
  assert.equal(i.companyName, "HMARK Consultants (Pvt.) Ltd.");
  assert.deepEqual(i.addressLines, ["Office 4, Block 7", "Karachi"]);
  assert.equal(i.email, "accounts@hmarkconsultants.com");
  assert.deepEqual(i.footerLines, ["First line.", "Second line."]);
  assert.equal(i.taxLabel, "Sales Tax");
});

test("an optional line left blank is left off; a required one left blank keeps its default", () => {
  const i = issuerFromSettings({ company_mobile: "", company_website: "   ", admin_fee_note: null, footer_note: "", company_name: "", invoice_title: "  " });
  assert.equal(i.mobile, null);
  assert.equal(i.website, null);
  assert.equal(i.adminFeeNote, null);
  assert.deepEqual(i.footerLines, []);
  assert.equal(i.companyName, DEFAULT_ISSUER.companyName);
  assert.equal(i.invoiceTitle, DEFAULT_ISSUER.invoiceTitle);
});

const bank = (over = {}) => ({ bankName: null, accountTitle: null, accountNumber: null, iban: null, branch: null, swiftCode: null, paymentNote: null, ...over });

test("no bank details means none are mentioned — a branch alone names no account", () => {
  assert.equal(hasBankDetails(null), false);
  assert.equal(hasBankDetails(bank()), false);
  assert.equal(hasBankDetails(bank({ branch: "Shahrah-e-Faisal", bankName: "  " })), false);
  assert.equal(hasBankDetails(bank({ iban: "PK36SCBL0000001123456702" })), true);
  assert.equal(hasBankDetails(bank({ accountTitle: "HMARK Consultants" })), true);
});

test("the payment block appears for bank details or a payment note, and not for nothing", () => {
  assert.equal(hasPaymentInstructions(bank()), false);
  assert.equal(hasPaymentInstructions(bank({ paymentNote: "Pay in cash at the office." })), true);
  assert.equal(hasPaymentInstructions(bank({ accountNumber: "0123456789" })), true);
});

test("a settings row reads as the same bank the PDF and the email print", () => {
  assert.equal(bankFromSettings(null), null);
  const row = { bank_name: "Meezan Bank", account_title: null, account_number: "0123", iban: "", branch: "Clifton", swift_code: null, payment_note: null };
  assert.deepEqual(bankFromSettings(row), { bankName: "Meezan Bank", accountTitle: null, accountNumber: "0123", iban: "", branch: "Clifton", swiftCode: null, paymentNote: null });
  // The row production has today: every bank field empty, so nothing prints.
  const empty = { bank_name: null, account_title: null, account_number: null, iban: null, branch: null, swift_code: null, payment_note: null };
  assert.equal(hasPaymentInstructions(bankFromSettings(empty)), false);
});
