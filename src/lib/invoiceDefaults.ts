// Resolves what an invoice should be pre-filled with for a given registered
// student, so the Invoice Generator does not make staff re-type figures that
// are already recorded against the country and the signed agreement.
//
// Precedence, most specific first:
//   1. the student's agreement (a negotiated override for this student)
//   2. the destination they registered for (the country's standard fees)
// A discount recorded on the agreement likewise wins over the one captured at
// registration, since the agreement is what the student actually signed.

import { computeInvoiceMath, SRB_TAX_RATE, buildInstallmentPlan, type InvoiceMath } from "@/lib/invoiceMath";

export type StudentFeeInputs = {
  discount_amount?: number | string | null;
  discount_reason?: string | null;
  intake?: string | null;
};

export type DestinationFeeInputs = {
  display_name?: string | null;
  country?: string | null;
  admin_charge?: number | string | null;
  consultancy_fee?: number | string | null;
  consultancy_fee_currency?: string | null;
  /** "public" | "private". Public-university destinations are billed in EUR. */
  track?: string | null;
} | null;

export type AgreementFeeInputs = {
  id?: string | null;
  admin_charge_override?: number | string | null;
  consultancy_fee_override?: number | string | null;
  discount_amount?: number | string | null;
  installment_count?: number | string | null;
} | null;

export type InvoiceDefaults = {
  agreementId: string | null;
  currency: string;
  destinationLabel: string | null;
  intake: string | null;
  installmentCount: number;
  discountReason: string | null;
  math: InvoiceMath;
  installments: number[];
  /** Which source each figure came from, so the UI can say so plainly. */
  source: {
    consultancyFee: "agreement" | "country" | "none";
    adminCharge: "agreement" | "country" | "none";
    discount: "agreement" | "registration" | "none";
  };
};

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

export function resolveInvoiceDefaults(
  student: StudentFeeInputs,
  destination: DestinationFeeInputs,
  agreement: AgreementFeeInputs
): InvoiceDefaults {
  const agreementFee = num(agreement?.consultancy_fee_override);
  const countryFee = num(destination?.consultancy_fee);
  const agreementAdmin = num(agreement?.admin_charge_override);
  const countryAdmin = num(destination?.admin_charge);
  const agreementDiscount = num(agreement?.discount_amount);
  const registrationDiscount = num(student.discount_amount);

  const consultancyFee = agreementFee ?? countryFee ?? 0;
  const adminCharge = agreementAdmin ?? countryAdmin ?? 0;
  const discountAmount = agreementDiscount ?? registrationDiscount ?? 0;

  const installmentCount = Math.max(1, Math.floor(num(agreement?.installment_count) ?? 1));
  const math = computeInvoiceMath({ consultancyFee, adminCharge, discountAmount, taxRate: SRB_TAX_RATE });

  return {
    agreementId: agreement?.id ?? null,
    // Public-university destinations are billed in EUR regardless of what is
    // stored against the country, so the generator opens on the right currency
    // and staff are not choosing it by hand. generateInvoice enforces the same
    // rule server-side.
    currency: destination?.track === "public" ? "EUR" : destination?.consultancy_fee_currency || "PKR",
    destinationLabel: destination?.display_name || destination?.country || null,
    intake: student.intake ?? null,
    installmentCount,
    // Only surface a reason when there is actually a discount to explain.
    discountReason: discountAmount > 0 ? student.discount_reason ?? null : null,
    math,
    installments: buildInstallmentPlan(math, installmentCount),
    source: {
      consultancyFee: agreementFee !== null ? "agreement" : countryFee !== null ? "country" : "none",
      adminCharge: agreementAdmin !== null ? "agreement" : countryAdmin !== null ? "country" : "none",
      discount: agreementDiscount !== null ? "agreement" : registrationDiscount !== null ? "registration" : "none",
    },
  };
}
