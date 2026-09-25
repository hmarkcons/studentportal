"use server";

import { createElement } from "react";
import { createClient } from "@/lib/supabase/server";
import { hasRole } from "@/lib/auth/roles";
import { requirePermission } from "@/lib/auth/permissions";
import { normalizeTheme } from "@/lib/pdf/agreementTheme";
import { wordingToBlocks, DEFAULT_OFFICE_LINE } from "@/lib/pdf/templateWording";
import { renderStudentAgreementPdf, type AgreementDestination } from "@/lib/pdf/studentAgreementPdf";
import { staffMergeVars } from "@/lib/staffAgreementFields";
import { serviceOf } from "@/lib/serviceType";

// The template builder's "Preview PDF": the template as it stands in the
// form — saved or not — rendered by the same code that generates a real
// agreement, for a sample person, and handed back to be shown in the page.
// Nothing is stored.

type PreviewResult = { pdf: string; error?: undefined } | { error: string; pdf?: undefined };

// A wording of a few hundred thousand characters is already far past any
// contract; this only stops a runaway request from rendering for minutes.
const MAX_WORDING = 600_000;

async function signature(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.storage.from("documents").download("branding/hmark-signature.png");
  return data ? `data:image/png;base64,${Buffer.from(await data.arrayBuffer()).toString("base64")}` : null;
}

const SAMPLE_STUDENT = {
  full_name: "Ayesha Khan (sample)",
  date_of_birth: "2003-04-17",
  email: "ayesha.khan@example.com",
  address: "House 12, Block 13-C, Gulshan-e-Iqbal, Karachi",
  contact_number: "0300-1234567",
  current_qualification: "BS Computer Science",
  course_of_interest: "MSc Data Science",
};
const SAMPLE_PROFILE = { emergency_contact_name: "Imran Khan", emergency_contact_relation: "Father", emergency_contact_number: "0300-7654321" };

/**
 * A student template, previewed for a sample student at the chosen
 * destination's fees, in one, two or three installments — the payment chart
 * differs with each. Super Admin only, as editing templates is.
 */
export async function previewAgreementTemplate(input: {
  wording: string;
  design: string;
  destinationId: string;
  serviceType: string;
  signatoryName: string;
  installments: number;
}): Promise<PreviewResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("staff").select("role, roles").eq("id", user?.id ?? "").maybeSingle();
  if (!hasRole(me, "super_admin")) return { error: "Only Super Admin can preview agreement templates." };
  if (!input.destinationId) return { error: "Choose the template's destination first — the preview uses its fees." };
  if ((input.wording ?? "").length > MAX_WORDING) return { error: "The wording is too long to preview." };

  const { data: destination } = await supabase
    .from("destinations")
    .select("country_code, track, display_name, admin_charge, consultancy_fee, consultancy_fee_currency, visa_service_fee")
    .eq("id", input.destinationId)
    .maybeSingle<AgreementDestination>();
  if (!destination) return { error: "That destination no longer exists." };

  const visaOnly = serviceOf(input.serviceType) === "visa_only";
  const installments = [1, 2, 3].includes(Number(input.installments)) ? Number(input.installments) : 2;
  const rendered = await renderStudentAgreementPdf({
    template: { wording: input.wording, signatory_name: input.signatoryName || "Authorised Signatory", design: input.design || null },
    destination,
    agreement: {
      admin_charge_override: null,
      consultancy_fee_override: null,
      discount_amount: null,
      installment_count: installments,
      is_backup: false,
      created_at: new Date().toISOString(),
      service_type: visaOnly ? "visa_only" : "full",
      // A country with no visa fee on file still previews, at a sample fee.
      visa_service_fee_override: visaOnly && destination.visa_service_fee == null ? 500 : null,
    },
    student: SAMPLE_STUDENT,
    profile: SAMPLE_PROFILE,
    signatureDataUri: await signature(supabase),
  });
  if ("error" in rendered) return { error: rendered.error };
  return { pdf: rendered.buffer.toString("base64") };
}

/** A staff template, previewed for a sample staff member. */
export async function previewStaffAgreementTemplate(input: { wording: string; design: string; name: string; signatoryName: string }): Promise<PreviewResult> {
  const denied = await requirePermission("staff_agreements.templates", "You don't have access to staff agreement templates.");
  if (denied) return { error: denied.error };
  if ((input.wording ?? "").length > MAX_WORDING) return { error: "The wording is too long to preview." };

  const supabase = await createClient();
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Karachi" });
  const signatoryName = input.signatoryName || "Authorised Signatory";
  const vars = staffMergeVars(
    {
      full_name: "Sana Iqbal (sample)",
      designation: "Senior Counsellor",
      cnic: "42101-1234567-8",
      date_of_birth: "1995-01-01",
      gender: "Female",
      marital_status: "Single",
      address: "Flat 4, Block 7, Gulshan-e-Iqbal, Karachi",
      mobile_official: "0300-1112223",
      mobile_personal: null,
      email_official: "sana.iqbal@hmarkconsultants.com",
      email_personal: null,
      emergency_contact_name: "Iqbal Ahmed",
      emergency_contact_relation: "Father",
      emergency_contact_number: "0300-4445556",
      work_start_time: "12:00",
      work_end_time: "21:00",
      work_days: [1, 2, 3, 4, 5, 6],
      monthly_target: 10,
      roles: ["Counselor"],
    },
    {
      monthly_salary: 120000,
      currency: "PKR",
      allowance: 10000,
      commission_rate_general: 5,
      commission_type_general: "percentage",
      commission_rate_public_universities: 5000,
      commission_type_public_universities: "flat",
      bonus_eligible: true,
      bonus_rate_percent: 10,
    },
    { agreementDate: date, signatoryName, policy: { work_start_time: "12:00", work_end_time: "21:00", work_days: [1, 2, 3, 4, 5, 6], grace_minutes: 15 } }
  );

  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { StaffAgreementDocument } = await import("@/lib/pdf/AgreementDocument");
  const element = createElement(StaffAgreementDocument, {
    data: {
      title: input.name || "Staff Agreement",
      officeLine: DEFAULT_OFFICE_LINE,
      blocks: wordingToBlocks(input.wording, vars, { feeTable: false }),
      staff: {
        fullName: vars.staff_name,
        designation: vars.designation,
        cnic: vars.cnic,
        dob: vars.date_of_birth || null,
        email: vars.email,
        mobile: vars.mobile || null,
        address: vars.address,
      },
      agreementDate: date,
      signatureDataUri: await signature(supabase),
      signatoryName,
      theme: normalizeTheme(input.design || null),
    },
  });
  const buffer = await renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);
  return { pdf: buffer.toString("base64") };
}
