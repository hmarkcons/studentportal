// A student's agreement as a PDF, built from its record: the template's
// wording and design, the country's fees, the student's details, the company,
// and HMARK's signature — and, once they have signed in the portal, the
// student's own (ClientSignature).
//
// Shared by the staff's "Generate PDF" (through their session) and the
// student's e-signing (through the service role, after the student is checked
// to own the agreement — the HMARK signature image is not theirs to read), so
// the copy a student signs is the same document staff generate.

import type { SupabaseClient } from "@supabase/supabase-js";
import { renderStudentAgreementPdf, type AgreementDestination } from "@/lib/pdf/studentAgreementPdf";
import { readAgreementCompany } from "@/lib/agreementCompanyRead";
import type { ClientSignature } from "@/lib/pdf/AgreementDocument";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function buildStudentAgreementPdf(
  db: SupabaseClient,
  agreementId: string,
  studentId: string,
  { clientSignature = null }: { clientSignature?: ClientSignature | null } = {}
): Promise<{ buffer: Buffer } | { error: string }> {
  const { data: agreement, error: agreementError } = await db
    .from("agreements")
    .select(
      "id, student_id, template_id, destination_id, admin_charge_override, consultancy_fee_override, discount_amount, installment_count, is_backup, created_at, agreement_date, service_type, visa_service_fee_override"
    )
    .eq("id", agreementId)
    .single();
  if (agreementError || !agreement) return { error: agreementError?.message ?? "Agreement not found." };
  if (agreement.student_id !== studentId) return { error: "That agreement is not this student's." };
  if (!agreement.template_id) return { error: "This agreement has no template selected." };

  const { data: template } = await db
    .from("agreement_templates")
    .select(
      "signatory_name, wording, design, destination:destinations(country_code, track, display_name, admin_charge, consultancy_fee, consultancy_fee_currency, visa_service_fee)"
    )
    .eq("id", agreement.template_id)
    .maybeSingle();
  // The agreement names its country (0298) — the only place a general
  // visa-service template's agreement has one; otherwise its template's.
  const { data: ownDestination } = agreement.destination_id
    ? await db
        .from("destinations")
        .select("country_code, track, display_name, admin_charge, consultancy_fee, consultancy_fee_currency, visa_service_fee")
        .eq("id", agreement.destination_id)
        .maybeSingle()
    : { data: null };
  const destination =
    (ownDestination as AgreementDestination | null) ??
    (template?.destination ? (one(template.destination as never) as AgreementDestination | null) : null);
  if (!destination?.country_code || !destination.track) return { error: "This agreement's destination could not be resolved." };

  const { data: student } = await db
    .from("students")
    .select("full_name, date_of_birth, email, address, contact_number, current_qualification, course_of_interest")
    .eq("id", studentId)
    .maybeSingle();
  if (!student) return { error: "Student not found." };

  const { data: profile } = await db
    .from("student_profiles")
    .select("emergency_contact_name, emergency_contact_relation, emergency_contact_number")
    .eq("student_id", studentId)
    .maybeSingle();

  // The agreement PDF prints these fields directly (see StudentDetailsChart
  // in AgreementDocument) — generating it with any of them blank would hand
  // the student a legal document with empty fields instead of failing loudly here.
  const missingProfileFields = [
    !student.date_of_birth && "date of birth",
    !student.address?.trim() && "address",
    !profile?.emergency_contact_name?.trim() && "emergency contact name",
    !profile?.emergency_contact_relation?.trim() && "emergency contact relation",
    !profile?.emergency_contact_number?.trim() && "emergency contact number",
  ].filter((f): f is string => Boolean(f));
  if (missingProfileFields.length > 0) {
    return { error: `Complete the student's profile before generating the agreement — missing: ${missingProfileFields.join(", ")}.` };
  }

  const { data: sigFile } = await db.storage.from("documents").download("branding/hmark-signature.png");
  const signatureDataUri = sigFile ? `data:image/png;base64,${Buffer.from(await sigFile.arrayBuffer()).toString("base64")}` : null;

  return renderStudentAgreementPdf({
    template: { wording: template?.wording ?? null, signatory_name: template?.signatory_name ?? null, design: template?.design ?? null },
    destination,
    agreement,
    student,
    profile: profile ?? null,
    signatureDataUri,
    clientSignature,
    company: await readAgreementCompany(db),
  });
}
