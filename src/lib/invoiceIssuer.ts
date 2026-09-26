// Who an invoice is from, and the wording around its figures — everything
// written on an invoice that is not the student's own numbers. Kept in
// Invoice Settings (0286), editable by the Super Admin and Finance, and read
// by the PDF and the email alike so the two cannot disagree.
//
// Pure, so it is unit-tested (scripts/invoice-issuer-test.mjs).

export type InvoiceIssuer = {
  companyName: string;
  addressLines: string[];
  phone: string | null;
  mobile: string | null;
  email: string | null;
  website: string | null;
  invoiceTitle: string;
  receiptTitle: string;
  billToLabel: string;
  /** Printed under each administrative-fee row; null prints nothing. */
  adminFeeNote: string | null;
  taxLabel: string;
  paymentHeading: string;
  scheduleHeading: string;
  footerLines: string[];
};

/**
 * What every invoice printed before any of this was editable, word for word.
 * The columns start at these values (0286), and a setting that cannot be read
 * falls back to them rather than leaving a hole in a financial document.
 */
export const DEFAULT_ISSUER: InvoiceIssuer = {
  companyName: "HMARK Consultants",
  addressLines: ["Suite 101, Dashityar Chambers, University Road, Gulshan-e-Iqbal, Block 13-C", "Karachi, Sindh", "Pakistan"],
  phone: "+92 213 4999777",
  mobile: "+92 334 3297870",
  email: null,
  website: "www.hmarkconsultants.com",
  invoiceTitle: "INVOICE",
  receiptTitle: "RECEIPT",
  billToLabel: "BILL TO",
  adminFeeNote: "The administrative fee is non-refundable in any case.",
  taxLabel: "SRB Tax",
  paymentHeading: "PAYMENT INSTRUCTIONS",
  scheduleHeading: "PAYMENT SCHEDULE",
  footerLines: [
    "Instalments unpaid past their due date may delay document submission on the student's application. For queries, contact accounts@hmarkconsultants.com.",
    "HMARK Consultants reserves the rights, in its sole discretion, to cancel the scholarship or admission.",
  ],
};

/** The invoice_settings columns this reads, for a select. */
export const ISSUER_COLUMNS =
  "company_name, company_address, company_phone, company_mobile, company_email, company_website, invoice_title, receipt_title, bill_to_label, admin_fee_note, tax_label, payment_heading, schedule_heading, footer_note";

export type IssuerRow = Partial<{
  company_name: string | null;
  company_address: string | null;
  company_phone: string | null;
  company_mobile: string | null;
  company_email: string | null;
  company_website: string | null;
  invoice_title: string | null;
  receipt_title: string | null;
  bill_to_label: string | null;
  admin_fee_note: string | null;
  tax_label: string | null;
  payment_heading: string | null;
  schedule_heading: string | null;
  footer_note: string | null;
}>;

const clean = (v: string | null | undefined) => (typeof v === "string" ? v.trim() : v);
const lines = (v: string | null | undefined) =>
  (v ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

/**
 * The issuer from a settings row. A required text left blank takes its
 * default; an optional one left blank is left off the invoice. A column the
 * row does not carry at all (undefined) takes its default too, so a read that
 * missed a column prints what it always did rather than nothing.
 */
export function issuerFromSettings(row: IssuerRow | null | undefined): InvoiceIssuer {
  const r = row ?? {};
  const required = (v: string | null | undefined, fallback: string) => clean(v) || fallback;
  const optional = (v: string | null | undefined, fallback: string | null) => (v === undefined ? fallback : clean(v) || null);
  return {
    companyName: required(r.company_name, DEFAULT_ISSUER.companyName),
    addressLines: r.company_address === undefined ? DEFAULT_ISSUER.addressLines : lines(r.company_address),
    phone: optional(r.company_phone, DEFAULT_ISSUER.phone),
    mobile: optional(r.company_mobile, DEFAULT_ISSUER.mobile),
    email: optional(r.company_email, DEFAULT_ISSUER.email),
    website: optional(r.company_website, DEFAULT_ISSUER.website),
    invoiceTitle: required(r.invoice_title, DEFAULT_ISSUER.invoiceTitle),
    receiptTitle: required(r.receipt_title, DEFAULT_ISSUER.receiptTitle),
    billToLabel: required(r.bill_to_label, DEFAULT_ISSUER.billToLabel),
    adminFeeNote: optional(r.admin_fee_note, DEFAULT_ISSUER.adminFeeNote),
    taxLabel: required(r.tax_label, DEFAULT_ISSUER.taxLabel),
    paymentHeading: required(r.payment_heading, DEFAULT_ISSUER.paymentHeading),
    scheduleHeading: required(r.schedule_heading, DEFAULT_ISSUER.scheduleHeading),
    footerLines: r.footer_note === undefined ? DEFAULT_ISSUER.footerLines : lines(r.footer_note),
  };
}

export type InvoiceBank = {
  bankName: string | null;
  accountTitle: string | null;
  accountNumber: string | null;
  iban: string | null;
  branch: string | null;
  swiftCode: string | null;
  paymentNote: string | null;
};

export type BankRow = {
  bank_name: string | null;
  account_title: string | null;
  account_number: string | null;
  iban: string | null;
  branch: string | null;
  swift_code: string | null;
  payment_note: string | null;
};

/** The bank block from a settings row, as the PDF, the email and the pages read it. */
export function bankFromSettings(row: BankRow | null | undefined): InvoiceBank | null {
  if (!row) return null;
  return {
    bankName: row.bank_name,
    accountTitle: row.account_title,
    accountNumber: row.account_number,
    iban: row.iban,
    branch: row.branch,
    swiftCode: row.swift_code,
    paymentNote: row.payment_note,
  };
}

/**
 * Whether there is an account to pay into at all. A branch on its own names no
 * account, so it does not count. With none of these, an invoice says nothing
 * about bank details — it used to print "Bank details not yet configured" to
 * the student, which was a note to the office.
 */
export function hasBankDetails(bank: InvoiceBank | null | undefined): boolean {
  if (!bank) return false;
  return [bank.accountTitle, bank.bankName, bank.accountNumber, bank.iban, bank.swiftCode].some((v) => Boolean(v?.trim()));
}

/**
 * Whether the invoice has a payment-instructions block: bank details, or a
 * payment note on its own (say, "Pay in cash at the office"). With neither,
 * the block — heading, reference and all — is left off.
 */
export function hasPaymentInstructions(bank: InvoiceBank | null | undefined): boolean {
  return hasBankDetails(bank) || Boolean(bank?.paymentNote?.trim());
}
