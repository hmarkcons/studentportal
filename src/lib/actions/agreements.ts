"use server";

import { createElement } from "react";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CURRENCY_SYMBOLS } from "@/lib/constants";
import { formatDateOnly } from "@/lib/formatDate";
import { getAgreementContent } from "@/lib/pdf/agreementContent";
import { wordingToBlocks, DEFAULT_OFFICE_LINE } from "@/lib/pdf/templateWording";
import { requirePermission } from "@/lib/auth/permissions";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

function formatAgreementDate(d: Date) {
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("en-US", { month: "long" });
  return `${day}-${month}-${d.getFullYear()}`;
}

function parseAgreementFields(formData: FormData) {
  const template_id = String(formData.get("template_id") ?? "") || null;
  const signing_method = String(formData.get("signing_method") ?? "");
  const admin_charge_override = formData.get("admin_charge_override")
    ? Number(formData.get("admin_charge_override"))
    : null;
  const consultancy_fee_override = formData.get("consultancy_fee_override")
    ? Number(formData.get("consultancy_fee_override"))
    : null;
  const discount_amount = formData.get("discount_amount") ? Number(formData.get("discount_amount")) : null;
  const installmentCountRaw = Number(formData.get("installment_count") ?? 1);
  const installment_count = [1, 2, 3].includes(installmentCountRaw) ? installmentCountRaw : 1;
  return { template_id, signing_method, admin_charge_override, consultancy_fee_override, discount_amount, installment_count };
}

export async function generateAgreement(studentId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const fields = parseAgreementFields(formData);

  if (!["paper", "e_signature"].includes(fields.signing_method)) {
    return { error: "Choose a signing method." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("agreements").insert({
    student_id: studentId,
    ...fields,
    generated_by: user?.id,
    status: "pending_signature",
  });

  if (error) return { error: error.message };

  revalidatePath(`/students/${studentId}`);
  return { success: true };
}

// Lets Super Admin correct an already-created (unsigned) agreement's
// template/fees/installments/signing method without deleting and
// re-creating it — e.g. a wrong override typed at generation time.
// Regenerating the PDF afterward is a separate, explicit step (the
// existing "Regenerate PDF" button) so an edit here never silently
// invalidates a PDF the student may already be reviewing.
export async function updateAgreement(agreementId: string, studentId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const denied = await requirePermission("agreements.edit_delete", "Only Super Admin can edit an agreement.");
  if (denied) return { error: denied.error };

  const { data: existing } = await supabase.from("agreements").select("status").eq("id", agreementId).maybeSingle();
  if (existing?.status === "signed") return { error: "This agreement is already signed and can no longer be edited." };

  const fields = parseAgreementFields(formData);
  if (!["paper", "e_signature"].includes(fields.signing_method)) {
    return { error: "Choose a signing method." };
  }

  const { error } = await supabase.from("agreements").update(fields).eq("id", agreementId);
  if (error) return { error: error.message };

  revalidatePath(`/students/${studentId}`);
  return { success: true };
}

// Renders the destination's retainer agreement with the student's details,
// fee breakdown, agreement date, and HMARK's pre-uploaded signature filled
// in, then stores it as agreements.pdf_path. The student's own signature
// line and the per-page right-hand signature box are left blank for them
// to sign after printing/e-signing.
export async function generateAgreementPdf(agreementId: string, studentId: string, revalidateTo: string) {
  const supabase = await createClient();
  const denied = await requirePermission("agreements.process", "Only Super Admin/Processing can regenerate an agreement PDF.");
  if (denied) return { error: denied.error };

  const { data: agreement, error: agreementError } = await supabase
    .from("agreements")
    .select("id, template_id, admin_charge_override, consultancy_fee_override, discount_amount, installment_count, created_at")
    .eq("id", agreementId)
    .single();
  if (agreementError || !agreement) return { error: agreementError?.message ?? "Agreement not found." };
  if (!agreement.template_id) return { error: "This agreement has no template selected." };

  const { data: template } = await supabase
    .from("agreement_templates")
    .select(
      "signatory_name, wording, destination:destinations(country_code, track, display_name, admin_charge, consultancy_fee, consultancy_fee_currency)"
    )
    .eq("id", agreement.template_id)
    .maybeSingle();
  const destination = template?.destination
    ? (one(template.destination as never) as {
        country_code?: string;
        track?: string;
        display_name?: string;
        admin_charge?: number;
        consultancy_fee?: number;
        consultancy_fee_currency?: string;
      } | null)
    : null;
  if (!destination?.country_code || !destination.track) return { error: "This agreement's destination could not be resolved." };

  const { data: student } = await supabase
    .from("students")
    .select("full_name, date_of_birth, email, address, contact_number, home_phone, current_qualification, course_of_interest")
    .eq("id", studentId)
    .maybeSingle();
  if (!student) return { error: "Student not found." };

  const { data: profile } = await supabase
    .from("student_profiles")
    .select("emergency_contact_name, emergency_contact_relation, emergency_contact_number")
    .eq("student_id", studentId)
    .maybeSingle();

  // The agreement PDF prints these fields directly (see StudentDetailsChart
  // below) — generating it with any of them blank would hand the student a
  // legal document with empty fields instead of failing loudly here.
  const missingProfileFields = [
    !student.address?.trim() && "address",
    !profile?.emergency_contact_name?.trim() && "emergency contact name",
    !profile?.emergency_contact_relation?.trim() && "emergency contact relation",
    !profile?.emergency_contact_number?.trim() && "emergency contact number",
  ].filter((f): f is string => Boolean(f));
  if (missingProfileFields.length > 0) {
    return { error: `Complete the student's profile before generating the agreement — missing: ${missingProfileFields.join(", ")}.` };
  }

  // The doc's rule: the agreement's signatory is always the one fixed
  // authorized person on the template, never the staff member who
  // generated it (that's tracked separately via agreements.generated_by).
  const signatoryName = template?.signatory_name ?? null;

  const { data: sigFile } = await supabase.storage.from("documents").download("branding/hmark-signature.png");
  const signatureDataUri = sigFile ? `data:image/png;base64,${Buffer.from(await sigFile.arrayBuffer()).toString("base64")}` : null;

  const adminCharge = agreement.admin_charge_override ?? destination.admin_charge ?? 0;
  const consultancyFee = agreement.consultancy_fee_override ?? destination.consultancy_fee ?? 0;
  const discountAmount = agreement.discount_amount ?? 0;
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
  const installmentCount = agreement.installment_count ?? 1;
  const perInstallment = Math.round((discountedConsultancyFee / installmentCount) * 100) / 100;
  const installmentAmounts = Array.from({ length: installmentCount }, (_, i) =>
    i === installmentCount - 1 ? discountedConsultancyFee - perInstallment * (installmentCount - 1) : perInstallment
  );

  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { AgreementDocument, money } = await import("@/lib/pdf/AgreementDocument");

  // Super-admin-authored wording (the agreement builder) takes priority over
  // the legacy hardcoded per-country content — falls back to the latter only
  // for templates that haven't had their wording filled in yet.
  const content = template?.wording?.trim()
    ? {
        officeLine: DEFAULT_OFFICE_LINE,
        blocks: wordingToBlocks(template.wording, {
          student_name: student.full_name ?? "",
          destination: destination.display_name ?? "",
          admin_charge: money(currencySymbol, adminCharge),
          consultancy_fee: money(currencySymbol, consultancyFee),
          discount: agreement.discount_amount ? money(currencySymbol, agreement.discount_amount) : "",
          total_fee: money(currencySymbol, totalFee),
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
      officeLine: content.officeLine,
      blocks: content.blocks,
      student: {
        fullName: student.full_name,
        dob: student.date_of_birth ? formatDateOnly(student.date_of_birth) : null,
        email: student.email,
        address: student.address,
        mobile: student.contact_number,
        home: student.home_phone,
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
      },
      agreementDate: agreementDateStr,
      signatureDataUri,
      signatoryName,
    },
  });

  // AgreementDocument's root element is a <Document>, but react-pdf's
  // renderToBuffer type can't see through the wrapper component to verify
  // that structurally — safe to assert since we control the component.
  const buffer = await renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);

  const path = `${studentId}/agreements/${agreementId}-generated.pdf`;
  const { error: uploadError } = await supabase.storage.from("documents").upload(path, buffer, { contentType: "application/pdf", upsert: true });
  if (uploadError) return { error: uploadError.message };

  const { error: updateError } = await supabase.from("agreements").update({ pdf_path: path }).eq("id", agreementId);
  if (updateError) return { error: updateError.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function deleteAgreement(agreementId: string, studentId: string) {
  const supabase = await createClient();
  const denied = await requirePermission("agreements.edit_delete", "Only Super Admin can delete an agreement.");
  if (denied) return { error: denied.error };

  const { error } = await supabase.from("agreements").delete().eq("id", agreementId);
  if (error) return { error: error.message };

  revalidatePath(`/students/${studentId}`);
  return { success: true };
}

export async function uploadSignedAgreement(agreementId: string, studentId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const denied = await requirePermission("agreements.process", "Only Super Admin/Processing can upload a signed agreement.");
  if (denied) return { error: denied.error };

  const file = formData.get("file") as File | null;
  const email_verified = formData.get("email_verified") === "on";
  const video_recording_path = String(formData.get("video_recording_path") ?? "") || null;

  if (!file || file.size === 0) {
    return { error: "Choose a file to upload." };
  }

  const path = `${studentId}/agreements/${agreementId}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { upsert: true });
  if (uploadError) return { error: uploadError.message };

  const { error } = await supabase
    .from("agreements")
    .update({ signed_file_path: path, status: "signed", email_verified, video_recording_path })
    .eq("id", agreementId);

  if (error) return { error: error.message };

  revalidatePath(`/students/${studentId}`);
  return { success: true };
}
