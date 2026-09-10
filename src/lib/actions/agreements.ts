"use server";

import { createElement } from "react";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CURRENCY_SYMBOLS } from "@/lib/constants";
import { formatDateOnly } from "@/lib/formatDate";
import { getAgreementContent } from "@/lib/pdf/agreementContent";
import { wordingToBlocks, DEFAULT_OFFICE_LINE } from "@/lib/pdf/templateWording";
import { requirePermission } from "@/lib/auth/permissions";
import { validateDocumentFile, sanitizeFilename } from "@/lib/documentUpload";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

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

// A destination is a "backup" for this student when its lead_destinations
// row has is_backup=true (see PrimaryBackupDestinationSelect) — such an
// agreement gets an administrative-fee-only fee table (no consultancy fee),
// so any consultancy/discount/installment values submitted for it are
// dropped rather than stored, keeping the row consistent with what
// generateAgreementPdf will actually render.
async function resolveIsBackup(supabase: SupabaseServerClient, studentId: string, templateId: string | null) {
  if (!templateId) return false;
  const { data: template } = await supabase.from("agreement_templates").select("destination_id").eq("id", templateId).maybeSingle();
  if (!template?.destination_id) return false;
  const { data: destRow } = await supabase
    .from("lead_destinations")
    .select("is_backup")
    .eq("lead_id", studentId)
    .eq("destination_id", template.destination_id)
    .maybeSingle();
  return destRow?.is_backup ?? false;
}

export async function generateAgreement(studentId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const fields = parseAgreementFields(formData);

  if (!["paper", "e_signature"].includes(fields.signing_method)) {
    return { error: "Choose a signing method." };
  }

  const is_backup = await resolveIsBackup(supabase, studentId, fields.template_id);
  if (is_backup) {
    fields.consultancy_fee_override = null;
    fields.discount_amount = null;
    fields.installment_count = 1;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("agreements").insert({
    student_id: studentId,
    ...fields,
    is_backup,
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

  // Re-resolve is_backup here too — staff may have switched the template to
  // a different destination since the agreement was first generated.
  const is_backup = await resolveIsBackup(supabase, studentId, fields.template_id);
  if (is_backup) {
    fields.consultancy_fee_override = null;
    fields.discount_amount = null;
    fields.installment_count = 1;
  }

  const { error } = await supabase.from("agreements").update({ ...fields, is_backup }).eq("id", agreementId);
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
    .select("id, template_id, admin_charge_override, consultancy_fee_override, discount_amount, installment_count, is_backup, created_at")
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
    .select("full_name, date_of_birth, email, address, contact_number, current_qualification, course_of_interest")
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
    !student.date_of_birth && "date of birth",
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

  // A backup-country agreement (see resolveIsBackup/PrimaryBackupDestinationSelect)
  // never carries a consultancy fee or discount — it exists purely to charge
  // this destination's administrative fee — so both are forced to zero here
  // regardless of what's stored, even though generateAgreement/updateAgreement
  // already null them out at write time (this is the belt to that suspenders,
  // for any agreement row written before that enforcement existed).
  const isBackup = agreement.is_backup ?? false;
  const adminCharge = agreement.admin_charge_override ?? destination.admin_charge ?? 0;
  const consultancyFee = isBackup ? 0 : (agreement.consultancy_fee_override ?? destination.consultancy_fee ?? 0);
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

  // Collect the file paths before the row goes, including any archived by a
  // rejection — once the row is deleted the archive cascades with it and the
  // paths are unrecoverable.
  const { data: agreement } = await supabase
    .from("agreements")
    .select("pdf_path, signed_file_path, video_recording_path")
    .eq("id", agreementId)
    .maybeSingle();
  const { data: archived } = await supabase
    .from("agreement_submission_archive")
    .select("file_path")
    .eq("agreement_id", agreementId);

  const paths = [
    ...new Set(
      [
        agreement?.pdf_path,
        agreement?.signed_file_path,
        agreement?.video_recording_path,
        ...(archived ?? []).map((a) => a.file_path),
      ].filter((p): p is string => Boolean(p))
    ),
  ];

  const { error } = await supabase.from("agreements").delete().eq("id", agreementId);
  if (error) return { error: error.message };

  // Storage is cleared too, not just the row. This used to delete only the
  // row, so every agreement ever deleted left its generated PDF behind — and a
  // leftover file is not merely clutter: documents_storage_select_self grants a
  // student read on everything under their own id folder, so an orphan stays
  // readable by them for as long as it exists. A signed copy uploaded against
  // the wrong student would stay readable by the wrong student.
  //
  // Deliberately after the row delete and not fatal: the agreement is already
  // gone, and failing the whole action over a leftover file would tell staff
  // the deletion did not happen when it did.
  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage.from("documents").remove(paths);
    if (storageError) {
      console.error(`deleteAgreement: removed agreement ${agreementId} but left files behind:`, storageError.message);
    }
  }

  revalidatePath(`/students/${studentId}`);
  return { success: true };
}

export async function uploadSignedAgreement(agreementId: string, studentId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const denied = await requirePermission("agreements.process", "Only Super Admin/Processing can upload a signed agreement.");
  if (denied) return { error: denied.error };

  const file = formData.get("file") as File | null;
  const email_verified = formData.get("email_verified") === "on";

  if (!file || file.size === 0) {
    return { error: "Choose a file to upload." };
  }

  // Paper (Karachi) agreements only. E-signature ones are submitted by the
  // student with their consent video (student_submit_signed_agreement) and
  // staff verify those instead — uploading over one here would replace the
  // signed file while leaving the video pointing at a different submission.
  const { data: existing } = await supabase.from("agreements").select("signing_method, status").eq("id", agreementId).maybeSingle();
  if (existing?.signing_method === "e_signature") {
    return { error: "E-signature agreements are uploaded by the student from their portal — verify their submission instead." };
  }

  // Replacing the scan of an already-signed agreement is a correction, not
  // routine processing — staff have uploaded the wrong student's agreement
  // before — so it takes the same permission as editing or deleting one.
  if (existing?.status === "signed") {
    const replaceDenied = await requirePermission(
      "agreements.edit_delete",
      "Only Super Admin can replace the scan of an agreement that is already signed."
    );
    if (replaceDenied) return { error: replaceDenied.error };
  }

  // Size and type are checked here as they are on every other upload path.
  // This one took the file unchecked, so a 200MB video could be filed as a
  // signed agreement.
  const invalid = validateDocumentFile(file);
  if (invalid) return { error: invalid };

  // The filename is sanitised, as it is everywhere else. It used to go into
  // the key verbatim, and a real filename containing "%28" produced a stored
  // path that did not match the object it named — which only worked because
  // the signed-URL call happens to decode it, and which made the stored path
  // useless for comparing against what is actually in the bucket.
  const path = `${studentId}/agreements/${agreementId}-${sanitizeFilename(file.name)}`;

  // What this replaces, if anything. A re-upload under a different filename
  // used to leave the previous object behind with nothing pointing at it —
  // and an orphan stays readable by whichever student's folder it sits in.
  const { data: previous } = await supabase
    .from("agreements")
    .select("signed_file_path")
    .eq("id", agreementId)
    .maybeSingle();

  const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { upsert: true });
  if (uploadError) return { error: uploadError.message };

  const { error } = await supabase
    .from("agreements")
    // updated_at moves on every later change to the row, including a staff
    // review, so it cannot say when the signed agreement itself arrived. The
    // artefact gets its own stamp (0154).
    .update({
      signed_file_path: path,
      status: "signed",
      email_verified,
      signed_file_uploaded_at: new Date().toISOString(),
    })
    .eq("id", agreementId);

  if (error) return { error: error.message };

  // Only once the new path is safely recorded, and never the file just written.
  if (previous?.signed_file_path && previous.signed_file_path !== path) {
    const { error: cleanupError } = await supabase.storage.from("documents").remove([previous.signed_file_path]);
    if (cleanupError) {
      console.error(`uploadSignedAgreement: replaced ${agreementId} but left ${previous.signed_file_path}:`, cleanupError.message);
    }
  }

  revalidatePath(`/students/${studentId}`);
  return { success: true };
}

// Staff sign-off on a student's e-signed submission: they watch the consent
// video, check the document, then mark it signed. Refuses until both are
// actually present so "verified" always means someone saw a video.
/**
 * Approves an e-signed submission. Both halves must be ticked: the document
 * and the consent video are judged separately, since the video is what makes
 * the signature attributable and a glance at the PDF alone does not establish
 * that.
 */
export async function verifySignedAgreement(
  agreementId: string,
  studentId: string,
  emailVerified: boolean,
  documentApproved = true,
  videoApproved = true
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  const denied = await requirePermission("agreements.process", "Only Super Admin/Processing can verify a signed agreement.");
  if (denied) return { error: denied.error };

  const { data: agreement } = await supabase
    .from("agreements")
    .select("signed_file_path, video_recording_path")
    .eq("id", agreementId)
    .maybeSingle();

  if (!agreement?.signed_file_path) return { error: "The student hasn't submitted a signed agreement yet." };
  if (!agreement.video_recording_path) return { error: "There's no consent video on this submission — it can't be verified." };
  if (!documentApproved || !videoApproved) {
    return { error: "Tick both the agreement and the video to approve. If either is wrong, reject that one instead." };
  }

  // Who approved it, not just when. The reject path records the reviewer (see
  // reject_agreement_artifact), and an approval is the half of this workflow
  // where knowing who signed off actually matters.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("agreements")
    .update({
      status: "signed",
      email_verified: emailVerified,
      document_status: "approved",
      video_status: "approved",
      document_review_note: null,
      video_review_note: null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user?.id ?? null,
    })
    .eq("id", agreementId);
  if (error) return { error: error.message };

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/portal/agreement");
  return { success: true };
}

/**
 * Takes an approval back.
 *
 * Approving was a one-way door: verifySignedAgreement marks the agreement
 * signed and the review panel disappears, so a mistaken approval — the wrong
 * video watched, a colleague clicking through — could only be undone by
 * deleting the agreement and regenerating it, which throws away the student's
 * signed copy and their recording.
 *
 * This is not a rejection and does not behave like one. Nothing is archived,
 * nothing is unlinked, and the student is not asked to send anything again:
 * the submission simply goes back to awaiting verification. Their portal
 * closes again to everything but the agreement, their payments and support,
 * because the access was granted on the strength of an approval that no longer
 * stands — but their login keeps working, since a student who cannot reach
 * their agreement page cannot help with whatever was wrong with it.
 */
export async function undoAgreementApproval(
  agreementId: string,
  studentId: string,
  kind: "document" | "video" | "both",
  note?: string
): Promise<{ error?: string; success?: boolean }> {
  const denied = await requirePermission("agreements.process", "Only Super Admin/Processing can undo an approval.");
  if (denied) return { error: denied.error };

  const trimmed = note?.trim() ?? "";
  if (trimmed.length > 500) return { error: "Keep the note under 500 characters." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("undo_agreement_approval", {
    p_agreement_id: agreementId,
    p_kind: kind,
    p_note: trimmed || null,
  });
  if (error) return { error: error.message };

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/portal/agreement");
  // The student's menu is built from the gate, so it has to be rebuilt too.
  revalidatePath("/portal", "layout");
  return { success: true };
}

/**
 * Sends one half of a submission back to the student to redo. The file is
 * archived rather than deleted — a rejected consent video is still the record
 * of what was originally submitted — and the reason is shown to the student so
 * they know what to fix rather than guessing.
 */
export async function rejectAgreementArtifact(
  agreementId: string,
  studentId: string,
  kind: "document" | "video",
  reason: string
): Promise<{ error?: string; success?: boolean }> {
  const denied = await requirePermission("agreements.process", "Only Super Admin/Processing can reject a submission.");
  if (denied) return { error: denied.error };

  if (!reason.trim()) return { error: "Give the student a reason so they know what to fix." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_agreement_artifact", {
    p_agreement_id: agreementId,
    p_kind: kind,
    p_reason: reason.trim(),
  });
  if (error) return { error: error.message };

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/portal/agreement");
  return { success: true };
}
