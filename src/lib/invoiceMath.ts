// The one place invoice money is computed. The generator page, the stored
// invoice, the PDF and the email all read from here so they cannot drift into
// showing the student three different totals.

// Sindh Revenue Board services tax, charged on the consultancy fee.
export const SRB_TAX_RATE = 5;

export type InvoiceMathInput = {
  consultancyFee: number;
  adminCharge: number;
  discountAmount: number;
  /** Percent. Defaults to SRB_TAX_RATE; pass a stored rate when re-rendering
   *  an old invoice so history is not rewritten by a later rate change. */
  taxRate?: number;
};

export type InvoiceMath = {
  consultancyFee: number;
  discountAmount: number;
  /** Consultancy fee after discount — the base the tax is charged on. */
  netConsultancyFee: number;
  taxRate: number;
  taxAmount: number;
  adminCharge: number;
  total: number;
};

/** Round to whole currency minor units (2dp) without float drift. */
function money(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

/**
 * Discount comes off the consultancy fee first, then SRB tax is charged on the
 * reduced fee, then the administrative charge is added. The admin charge is
 * deliberately outside the tax base — the tax is on the consultancy service.
 */
export function computeInvoiceMath(input: InvoiceMathInput): InvoiceMath {
  const consultancyFee = money(Math.max(0, input.consultancyFee));
  const adminCharge = money(Math.max(0, input.adminCharge));
  // Never let a discount exceed the fee: a negative net fee would produce
  // negative tax and an invoice that owes the student money.
  const discountAmount = money(Math.min(Math.max(0, input.discountAmount), consultancyFee));
  const taxRate = input.taxRate ?? SRB_TAX_RATE;

  const netConsultancyFee = money(consultancyFee - discountAmount);
  const taxAmount = money(netConsultancyFee * (taxRate / 100));
  const total = money(netConsultancyFee + taxAmount + adminCharge);

  return { consultancyFee, discountAmount, netConsultancyFee, taxRate, taxAmount, adminCharge, total };
}

/**
 * Split a total into n installments. Rounding lands on the final installment
 * so the parts always sum exactly to the total — otherwise an invoice can end
 * up a rupee short and never reads as paid in full.
 */
export function splitIntoInstallments(total: number, count: number): number[] {
  const n = Math.max(1, Math.floor(count));
  const per = money(total / n);
  const parts = Array.from({ length: n }, () => per);
  parts[n - 1] = money(total - per * (n - 1));
  return parts;
}

export type PaymentProgress = {
  /** Installment amounts that are settled, plus the admin charge if paid. */
  paid: number;
  /** Still owed. */
  outstanding: number;
  total: number;
  installmentsPaid: number;
  installmentsTotal: number;
  /** Earliest unpaid due date, or null when nothing is outstanding. */
  nextDueDate: string | null;
  status: "paid_in_full" | "partially_paid" | "payment_pending";
};

export type InstallmentLike = {
  amount: number | string | null;
  status: string | null;
  due_date: string | null;
  amount_paid?: number | string | null;
};

function num(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : v ?? 0;
  return Number.isFinite(n) ? n : 0;
}

/**
 * What a student has actually paid against an invoice. `partial` installments
 * count only their amount_paid, so a half-settled installment is not reported
 * as fully received.
 */
export function computePaymentProgress(
  installments: InstallmentLike[],
  opts: { adminCharge: number; adminFeePaid: boolean }
): PaymentProgress {
  let paid = opts.adminFeePaid ? money(opts.adminCharge) : 0;
  let installmentsPaid = 0;
  let due: string | null = null;

  for (const i of installments) {
    const amount = num(i.amount);
    if (i.status === "paid") {
      paid += amount;
      installmentsPaid += 1;
    } else if (i.status === "partial") {
      paid += num(i.amount_paid);
      if (i.due_date && (!due || i.due_date < due)) due = i.due_date;
    } else if (i.due_date && (!due || i.due_date < due)) {
      due = i.due_date;
    }
  }

  const total = money(installments.reduce((s, i) => s + num(i.amount), 0) + money(opts.adminCharge));
  paid = money(paid);
  const outstanding = money(Math.max(0, total - paid));

  const status: PaymentProgress["status"] =
    outstanding <= 0 ? "paid_in_full" : paid > 0 ? "partially_paid" : "payment_pending";

  return {
    paid,
    outstanding,
    total,
    installmentsPaid,
    installmentsTotal: installments.length,
    nextDueDate: outstanding <= 0 ? null : due,
    status,
  };
}

export const PAYMENT_STATUS_LABELS: Record<PaymentProgress["status"] | "withdrawn", string> = {
  paid_in_full: "Paid in full",
  partially_paid: "Partially paid",
  payment_pending: "Payment pending",
  withdrawn: "Withdrawn",
};

/**
 * The conversion note shown when an invoice is denominated in one currency but
 * HMARK's account is held in another (EU destinations bill in EUR while the
 * account is PKR). Returns null when they match, so a same-currency invoice
 * never carries an irrelevant line.
 *
 * Lives here so the PDF, the email and the on-screen preview all print the
 * same sentence.
 */
export function conversionNote(invoiceCurrency: string, accountCurrency: string | null | undefined): string | null {
  const acct = (accountCurrency ?? "").trim().toUpperCase();
  const inv = (invoiceCurrency ?? "").trim().toUpperCase();
  if (!acct || !inv || acct === inv) return null;
  return `Invoiced in ${inv} but payable into a ${acct} account: the ${acct} amount depends on the exchange rate on the transfer date. Please confirm the exact figure with our accounts team before paying.`;
}
