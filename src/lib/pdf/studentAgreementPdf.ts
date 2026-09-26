import { createElement } from "react";
import { CURRENCY_SYMBOLS } from "@/lib/constants";
import { formatDateOnly } from "@/lib/formatDate";
import { getAgreementContent } from "@/lib/pdf/agreementContent";
import { wordingToBlocks } from "@/lib/pdf/templateWording";
import { companyMergeVars, missingCompanyFields, officeLine, DEFAULT_AGREEMENT_COMPANY, type AgreementCompany } from "@/lib/agreementCompany";
import { formatAmount, normalizeTheme } from "@/lib/pdf/agreementTheme";
import { serviceOf } from "@/lib/serviceType";

// A student's agreement as a PDF, from its template and the student: shared
// by "Generate PDF" on a student (generateAgreementPdf) and the template
// builder's "Preview PDF", which renders the same thing for a sample student,
// so what the preview shows is what generating will print.

export type AgreementDestination = {
  country_code?: string;
  track?: string;
  display_name?: string;
  admin_charge?: number;
  consultancy_fee?: number;
  consultancy_fee_currency?: string;
  visa_service_fee?: number | null;
};

export type StudentAgreementInput = {
  template: { wording: string | null; signatory_name: string | null; design: unknown };
  destination: AgreementDestination;
  agreement: {
    admin_charge_override: number | null;
    consultancy_fee_override: number | null;
    discount_amount: number | null;
    installment_count: number | null;
    is_backup: boolean | null;
    created_at: string;
    service_type: string | null;
    visa_service_fee_override: number | null;
  };
  student: {
    full_name: string;
    date_of_birth: string | null;
    email: string | null;
    address: string | null;
    contact_number: string | null;
    current_qualification: string | null;
    course_of_interest: string | null;
  };
  profile: { emergency_contact_name: string | null; emergency_contact_relation: string | null; emergency_contact_number: string | null } | null;
  signatureDataUri: string | null;
  /**
   * The company as Setup → Agreement templates → Company details has it (0288):
   * the office line, the header, the signature caption and the {{company_…}}
   * placeholders. Absent, the agreement prints what it always did.
   */
  company?: AgreementCompany;
};

function formatAgreementDate(d: Date) {
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("en-US", { month: "long" });
  return `${day}-${month}-${d.getFullYear()}`;
}

export async function renderStudentAgreementPdf(input: StudentAgreementInput): Promise<{ buffer: Buffer } | { error: string }> {
  const { template, destination, agreement, student, profile } = input;
  const company = input.company ?? DEFAULT_AGREEMENT_COMPANY;
  if (!destination?.country_code || !destination.track) return { error: "This agreement's destination could not be resolved." };

  // The doc's rule: the agreement's signatory is always the one fixed
  // authorized person on the template, never the staff member who
  // generated it (that's tracked separately via agreements.generated_by).
  const signatoryName = template.signatory_name ?? null;
  const theme = normalizeTheme(template.design);

  // A backup-country agreement (see resolveIsBackup/PrimaryBackupDestinationSelect)
  // never carries a consultancy fee or discount — it exists purely to charge
  // this destination's administrative fee — so both are forced to zero here
  // regardless of what's stored, even though generateAgreement/updateAgreement
  // already null them out at write time (this is the belt to that suspenders,
  // for any agreement row written before that enforcement existed).
  // A visa documentation and application agreement (0279) charges the visa
  // service fee alone — no administrative charge, no consultancy fee. The fee
  // travels through the same installment and discount arithmetic below.
  const isVisaOnly = serviceOf(agreement.service_type) === "visa_only";
  const visaFee = agreement.visa_service_fee_override ?? destination.visa_service_fee ?? null;
  if (isVisaOnly && visaFee === null) {
    return {
      error: `No visa service fee is set for ${destination.display_name ?? "this country"}. Set it in Setup → Destinations, or enter one on the agreement.`,
    };
  }
  const isBackup = !isVisaOnly && (agreement.is_backup ?? false);
  const adminCharge = isVisaOnly ? 0 : (agreement.admin_charge_override ?? destination.admin_charge ?? 0);
  const consultancyFee = isVisaOnly ? Number(visaFee) : isBackup ? 0 : (agreement.consultancy_fee_override ?? destination.consultancy_fee ?? 0);
  const discountAmount = isBackup ? 0 : (agreement.discount_amount ?? 0);
  const currencySymbol = CURRENCY_SYMBOLS[destination.consultancy_fee_currency ?? "EUR"] ?? destination.consultancy_fee_currency ?? "€";
  const totalFee = adminCharge + consultancyFee - discountAmount;
  const agreementDateStr = formatAgreementDate(new Date(agreement.created_at));

  // Split the discounted consultancy fee (the discount only ever applies to
  // the consultancy fee, never the non-refundable admin charge) into equal
  // installments per the staff's choice at generation time (installment_count),
  // with any rounding remainder folded into the last installment so the parts
  // always sum to the whole. Splitting the discount across every installment
  // this way means what the client actually owes at each payment point is
  // already net of the discount, instead of only reconciling in the total row.
  const discountedConsultancyFee = consultancyFee - discountAmount;
  const installmentCount = isBackup ? 1 : (agreement.installment_count ?? 1);
  const perInstallment = Math.round((discountedConsultancyFee / installmentCount) * 100) / 100;
  const installmentAmounts = Array.from({ length: installmentCount }, (_, i) =>
    i === installmentCount - 1 ? discountedConsultancyFee - perInstallment * (installmentCount - 1) : perInstallment
  );

  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { AgreementDocument, money } = await import("@/lib/pdf/AgreementDocument");
  // Amounts in the wording read as the payment chart writes them: the
  // template's own format under a theme, Classic's otherwise.
  const amount = (n: number) => (theme ? formatAmount(currencySymbol, n, theme.fee.amount) : money(currencySymbol, n));

  const missingCompany = missingCompanyFields(template.wording, company);
  if (missingCompany.length > 0) {
    return {
      error: `The template uses the company's ${missingCompany.join(", ")}, which is blank — fill it in under Setup → Agreement templates → Company details.`,
    };
  }

  // Super-admin-authored wording (the agreement builder) takes priority over
  // the legacy hardcoded per-country content — falls back to the latter only
  // for templates that haven't had their wording filled in yet.
  const content = template.wording?.trim()
    ? {
        blocks: wordingToBlocks(template.wording, {
          ...companyMergeVars(company),
          student_name: student.full_name ?? "",
          destination: destination.display_name ?? "",
          admin_charge: amount(adminCharge),
          consultancy_fee: amount(isVisaOnly ? 0 : consultancyFee),
          visa_service_fee: isVisaOnly ? amount(consultancyFee) : "",
          discount: agreement.discount_amount ? amount(agreement.discount_amount) : "",
          total_fee: amount(totalFee),
          currency: destination.consultancy_fee_currency ?? "EUR",
          agreement_date: agreementDateStr,
          signatory_name: signatoryName ?? "",
        }),
      }
    : getAgreementContent(destination.country_code, destination.track);
  if (!content) {
    return { error: `No agreement wording is configured yet for ${destination.display_name ?? destination.country_code} — ask a developer to add it.` };
  }

  const element = createElement(AgreementDocument, {
    data: {
      destinationLabel: destination.display_name ?? "",
      // The same line for every template, built-in or built in the builder —
      // the built-in ones each carried their own copy, and Italy's had drifted.
      officeLine: officeLine(company),
      companyName: company.companyName,
      blocks: content.blocks,
      student: {
        fullName: student.full_name,
        dob: student.date_of_birth ? formatDateOnly(student.date_of_birth) : null,
        email: student.email,
        address: student.address,
        mobile: student.contact_number,
        currentEducation: student.current_qualification,
        courseOfInterest: student.course_of_interest,
        emergencyContactName: profile?.emergency_contact_name ?? null,
        emergencyContactRelation: profile?.emergency_contact_relation ?? null,
        emergencyContactNumber: profile?.emergency_contact_number ?? null,
      },
      fee: {
        currencySymbol,
        adminCharge,
        consultancyFee,
        installmentAmounts,
        discount: discountAmount,
        total: totalFee,
        isBackup,
        destinationLabel: destination.display_name ?? "",
        isVisaOnly,
      },
      agreementDate: agreementDateStr,
      signatureDataUri: input.signatureDataUri,
      signatoryName,
      theme,
    },
  });

  // AgreementDocument's root element is a <Document>, but react-pdf's
  // renderToBuffer type can't see through the wrapper component to verify
  // that structurally — safe to assert since we control the component.
  const buffer = await renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);
  return { buffer };
}
