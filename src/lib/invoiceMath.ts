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
  /**
   * Added items, summed — see sumLineItems. A product from the fee catalog or
   * a custom item put on the invoice after it was raised. Taxed at the
   * invoice's rate like the consultancy fee, and never discounted: the
   * discount is a concession on the fee, not on a courier charge.
   */
  extras?: number;
};

export type InvoiceMath = {
  consultancyFee: number;
  discountAmount: number;
  /** Consultancy fee after discount. */
  netConsultancyFee: number;
  /** Added items, before tax. */
  extrasAmount: number;
  /** What the tax is charged on: the net consultancy fee plus the added items. */
  taxableAmount: number;
  taxRate: number;
  taxAmount: number;
  /** The part of taxAmount that is tax on the added items. Rides with them on
   *  the first instalment (buildInstallmentPlan), so it is kept separate. */
  extrasTaxAmount: number;
  adminCharge: number;
  total: number;
};

/** Round to whole currency minor units (2dp) without float drift. */
function money(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

/**
 * The amounts of an invoice's line items, added up — the `extras` input to
 * computeInvoiceMath. Tolerates the string PostgREST returns for a numeric
 * column and ignores anything that is not a number, so a malformed row cannot
 * poison the total.
 */
export function sumLineItems(items: readonly { amount: number | string | null | undefined }[] | null | undefined): number {
  return money((items ?? []).reduce((s, li) => s + Math.max(0, num(li.amount)), 0));
}

/**
 * Discount comes off the consultancy fee first, then SRB tax is charged on the
 * reduced fee and on any added items, then the administrative charge is added.
 * The admin charge is deliberately outside the tax base — the tax is on the
 * services sold, and the administrative charge is not one.
 *
 * Added items used to be left out here entirely, so the card on the student's
 * page added them to this total by hand while the PDF, the email, the
 * instalment schedule and the student's own Payments page never saw them at
 * all: an invoice with a product on it printed and collected without it.
 */
export function computeInvoiceMath(input: InvoiceMathInput): InvoiceMath {
  const consultancyFee = money(Math.max(0, input.consultancyFee));
  const adminCharge = money(Math.max(0, input.adminCharge));
  const extrasAmount = money(Math.max(0, input.extras ?? 0));
  // Never let a discount exceed the fee: a negative net fee would produce
  // negative tax and an invoice that owes the student money.
  const discountAmount = money(Math.min(Math.max(0, input.discountAmount), consultancyFee));
  const taxRate = input.taxRate ?? SRB_TAX_RATE;

  const netConsultancyFee = money(consultancyFee - discountAmount);
  const taxableAmount = money(netConsultancyFee + extrasAmount);
  const taxAmount = money(taxableAmount * (taxRate / 100));
  const extrasTaxAmount = money(extrasAmount * (taxRate / 100));
  const total = money(netConsultancyFee + extrasAmount + taxAmount + adminCharge);

  return {
    consultancyFee,
    discountAmount,
    netConsultancyFee,
    extrasAmount,
    taxableAmount,
    taxRate,
    taxAmount,
    extrasTaxAmount,
    adminCharge,
    total,
  };
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

/**
 * What the first instalment carries on top of its equal share of the fee:
 * the administrative charge, plus any added items with their tax. The part of
 * that which is added items is also what the instalment's `extras_amount`
 * column records, so the schedule can say where the money went after the
 * fact (see invoiceSchedule.ts).
 */
export function extrasLoad(math: InvoiceMath): number {
  return money(math.extrasAmount + math.extrasTaxAmount);
}

/**
 * The payment schedule for an invoice: the consultancy fee (after discount,
 * plus its tax) divided into `count` equal installments, with the whole
 * administrative charge — and any added items, with their tax — loaded onto
 * the first one.
 *
 * That is how the fee is actually collected — the student pays the admin
 * charge together with their first installment, and an item added to the
 * invoice is paid with the next money in rather than spread thin across a
 * plan that was agreed before it existed. The parts still sum to math.total,
 * which the caller can rely on: the invoice is paid in full exactly when
 * every installment is.
 *
 * The fee breakdown on the receipt is unaffected; the administrative charge
 * and each item stay their own line there. This is about when money is due,
 * not what is owed.
 */
export function buildInstallmentPlan(math: InvoiceMath, count: number): number[] {
  const consultancySide = money(math.netConsultancyFee + math.taxAmount - math.extrasTaxAmount);
  const parts = splitIntoInstallments(consultancySide, count);
  parts[0] = money(parts[0] + math.adminCharge + extrasLoad(math));
  return parts;
}

/**
 * Why an instalment is bigger than the others, as one sentence fragment:
 * "includes the EUR 300.00 admin fee", "includes EUR 105.00 for added items",
 * or both joined with "and". Null when there is nothing to explain.
 *
 * Written once here so the staff card, the student's Payments page, the PDF
 * and the email all say the same thing. The administrative charge is
 * explained on instalment 1 because that is where buildInstallmentPlan puts
 * it; added items are explained wherever the schedule recorded them landing,
 * which is instalment 1 on a fresh plan but the first unpaid one when items
 * were added after money had already come in.
 */
export function installmentNote(
  installment: { installment_no: number; extras_amount?: number | string | null },
  math: Pick<InvoiceMath, "adminCharge">,
  fmt: (n: number) => string
): string | null {
  const parts: string[] = [];
  if (installment.installment_no === 1 && math.adminCharge > 0) parts.push(`the ${fmt(math.adminCharge)} admin fee`);
  const extras = money(num(installment.extras_amount));
  if (extras > 0) parts.push(`${fmt(extras)} for added items`);
  if (parts.length === 0) return null;
  return `includes ${parts.join(" and ")}`;
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
 *
 * The installments are the whole picture — the administrative charge rides on
 * the first one (see buildInstallmentPlan). This used to add the admin charge
 * on top of the installment total while generateInvoice was already including
 * it in the amounts, so every invoice's total and outstanding figure was
 * overstated by the admin charge.
 */
export function computePaymentProgress(installments: InstallmentLike[]): PaymentProgress {
  let paid = 0;
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

  const total = money(installments.reduce((s, i) => s + num(i.amount), 0));
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
