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
import { agreementFamily, familyFee } from "@/lib/accompanyingFamily";
import { convertFee } from "@/lib/agreementCurrency";

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
  /** The country's visa documentation and application fee (0279). */
  visa_service_fee?: number | string | null;
} | null;

export type AgreementFeeInputs = {
  id?: string | null;
  admin_charge_override?: number | string | null;
  consultancy_fee_override?: number | string | null;
  discount_amount?: number | string | null;
  installment_count?: number | string | null;
  visa_service_fee_override?: number | string | null;
  /** The accompanying family on the agreement (0350), whose fees join the consultancy fee. */
  spouse_count?: number | string | null;
  children_count?: number | string | null;
  spouse_fee?: number | string | null;
  child_fee?: number | string | null;
  /** The currency the agreement was printed in and the rate it was converted at (0351). */
  currency?: string | null;
  pkr_per_eur?: number | string | null;
} | null;

export type InvoiceDefaults = {
  agreementId: string | null;
  currency: string;
  /** The rupees per euro the agreement was converted at, to say another country's figure in the same currency (0351). */
  rate: number | null;
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
  agreement: AgreementFeeInputs,
  // A visa-only student (0279) is invoiced the visa service fee in place of
  // the consultancy fee, and no administrative charge at all.
  service: "full" | "visa_only" = "full"
): InvoiceDefaults {
  const visaOnly = service === "visa_only";
  const agreementFee = num(visaOnly ? agreement?.visa_service_fee_override : agreement?.consultancy_fee_override);
  const countryFee = num(visaOnly ? destination?.visa_service_fee : destination?.consultancy_fee);
  const agreementAdmin = visaOnly ? null : num(agreement?.admin_charge_override);
  const countryAdmin = visaOnly ? null : num(destination?.admin_charge);
  const agreementDiscount = num(agreement?.discount_amount);
  const registrationDiscount = num(student.discount_amount);

  // Public-university destinations are billed in EUR regardless of what is
  // stored against the country, so the generator opens on the right currency
  // and staff are not choosing it by hand — unless the agreement was printed
  // in the other currency (0351), when the invoice opens on that, with every
  // figure converted at the agreement's own rate, as the agreement has them.
  const countryCurrency = destination?.track === "public" ? "EUR" : destination?.consultancy_fee_currency || "PKR";
  const currency = agreement?.currency === "EUR" || agreement?.currency === "PKR" ? agreement.currency : countryCurrency;
  const rate = num(agreement?.pkr_per_eur);
  const inCurrency = (n: number) => convertFee(n, countryCurrency, currency, rate);

  // The accompanying family's fees (0350) are part of the consultancy fee, as on the agreement.
  const family = visaOnly ? null : agreementFamily(agreement);
  const consultancyFee =
    inCurrency(agreementFee ?? countryFee ?? 0) +
    familyFee(family && { ...family, spouseFee: inCurrency(family.spouseFee), childFee: inCurrency(family.childFee) });
  const adminCharge = inCurrency(agreementAdmin ?? countryAdmin ?? 0);
  const discountAmount = inCurrency(agreementDiscount ?? registrationDiscount ?? 0);

  const installmentCount = Math.max(1, Math.floor(num(agreement?.installment_count) ?? 1));
  const math = computeInvoiceMath({ consultancyFee, adminCharge, discountAmount, taxRate: SRB_TAX_RATE });

  return {
    agreementId: agreement?.id ?? null,
    currency,
    rate: currency !== countryCurrency ? rate : null,
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
