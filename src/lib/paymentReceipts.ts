// Payment receipts (0308): proof of a payment, attached to the payment itself.
//
// Five kinds of payment, each a row of its own table, each able to carry
// several receipts. Who may upload, open and remove them is whoever may mark
// that payment paid — the permission here is the one the database checks too
// (payment_receipt_permission). A receipt never changes a payment's status.
//
// Pure, relative imports only, so scripts/payment-receipts-test.mjs reads it
// under plain Node.

export const RECEIPT_KINDS = ["installment", "staff_commission", "payroll", "refund", "referral"] as const;
export type ReceiptKind = (typeof RECEIPT_KINDS)[number];

/** The permission that lets someone mark this kind of payment paid, and so handle its receipts. */
export const RECEIPT_PERMISSION = {
  installment: "finance.invoices.manage",
  staff_commission: "finance.commissions.manage",
  payroll: "finance.commissions.manage",
  refund: "finance.refunds.review",
  referral: "marketing.referral_incentives",
} as const satisfies Record<ReceiptKind, string>;

/** The table each kind of payment is a row of. */
export const RECEIPT_TABLE = {
  installment: "invoice_installments",
  staff_commission: "staff_commissions",
  payroll: "staff_payroll",
  refund: "refund_requests",
  referral: "referrals",
} as const satisfies Record<ReceiptKind, string>;

/** The payment_receipts column that points at that row. */
export const RECEIPT_COLUMN = {
  installment: "installment_id",
  staff_commission: "staff_commission_id",
  payroll: "payroll_id",
  refund: "refund_id",
  referral: "referral_id",
} as const satisfies Record<ReceiptKind, string>;

/** Who may handle them, in words, for a refusal. */
export const RECEIPT_WHO = {
  installment: "Finance and Super Admin",
  staff_commission: "Finance and Super Admin",
  payroll: "Finance and Super Admin",
  refund: "Finance, Management and Super Admin",
  referral: "Finance and Super Admin",
} as const satisfies Record<ReceiptKind, string>;

/** Enough for a bank slip, a screenshot and a correction many times over; a cap, not a quota. */
export const RECEIPTS_PER_PAYMENT = 20;

export function isReceiptKind(value: unknown): value is ReceiptKind {
  return typeof value === "string" && (RECEIPT_KINDS as readonly string[]).includes(value);
}

/**
 * A file name safe as the last part of a storage key, keeping its extension:
 * "Bank slip (Oct).PDF" is "Bank-slip-Oct.PDF". Letters, digits, dot, dash and
 * underscore; anything else becomes a dash, and a name with nothing left is
 * "receipt".
 */
export function receiptFileName(name: string): string {
  const cleaned = name.normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-");
  // An extension is a short run of letters or digits after the last dot.
  const ext = cleaned.match(/\.(\w{1,10})$/);
  const stem = (ext ? cleaned.slice(0, -ext[0].length) : cleaned)
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80)
    .replace(/[-.]+$/, "");
  return `${stem || "receipt"}${ext ? `.${ext[1]}` : ""}`;
}

/**
 * Where a receipt is stored: payment-receipts/<kind>/<payment id>/<unique>-<name>.
 * The folder is what the storage policy and the table's check both read, so a
 * receipt can only ever sit in its own payment's folder.
 */
export function receiptPath(kind: ReceiptKind, paymentId: string, fileName: string, unique: string): string {
  return `payment-receipts/${kind}/${paymentId}/${unique}-${receiptFileName(fileName)}`;
}

/**
 * The count PostgREST embeds for `receipts:payment_receipts(count)` —
 * `[{ count: 2 }]`, or an empty list or nothing when RLS let none through.
 */
export function receiptCount(embedded: unknown): number {
  const first = Array.isArray(embedded) ? embedded[0] : embedded;
  const n = first && typeof first === "object" ? Number((first as { count?: unknown }).count) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** "Receipts (2)" on the button, or the invitation to add the first. */
export function receiptButtonLabel(count: number): string {
  return count > 0 ? `Receipts (${count})` : "+ Receipt";
}
