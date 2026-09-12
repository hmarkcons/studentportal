"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sanitizeFilename, validateDocumentFile } from "@/lib/documentUpload";

export async function partnerUpdateStage(applicationId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const current_stage = String(formData.get("current_stage") ?? "");
  if (!current_stage) return { error: "Choose a stage." };

  const { error } = await supabase.from("applications").update({ current_stage }).eq("id", applicationId);
  if (error) return { error: error.message };

  revalidatePath(`/partner/applications/${applicationId}`);
  return { success: true };
}

export async function partnerUploadLetter(applicationId: string, category: "offer_letter" | "rejection_letter", _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Choose a file." };
  const validationError = validateDocumentFile(file);
  if (validationError) return { error: validationError };

  const { data: app } = await supabase.from("applications").select("student_id").eq("id", applicationId).maybeSingle();
  if (!app) return { error: "Application not found." };

  // An existing letter of the same kind on this application is replaced rather
  // than duplicated, and the one it replaces is archived — a university that
  // reissues an offer leaves the first one on the record.
  const { data: existing } = await supabase
    .from("student_documents")
    .select("id, status, file_path, version")
    .eq("application_id", applicationId)
    .eq("category", category)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing?.status === "verified") {
    return { error: "HMARK has already accepted this letter — send them a message if it needs replacing." };
  }

  // The filename is sanitised and the version is part of the key. It used to
  // be the raw filename with upsert: true, so a second letter with the same
  // name replaced the object in storage, and a name containing an escape
  // produced a stored path that did not match the object it named.
  const version = (existing?.version ?? 0) + 1;
  const path = `${app.student_id}/${applicationId}-${category}-v${version}-${sanitizeFilename(file.name)}`;
  const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { upsert: false });
  if (uploadError) return { error: uploadError.message };

  if (existing) {
    // Archives whatever was there and points the requirement at the new file,
    // in one transaction (0165).
    const { error } = await supabase.rpc("replace_student_document", {
      p_document_id: existing.id,
      p_new_path: path,
      p_uploaded_by_role: "partner",
    });
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("student_documents").insert({
      student_id: app.student_id,
      application_id: applicationId,
      category,
      file_path: path,
      status: "submitted",
      uploaded_by_role: "partner",
      // The staff and student upload paths both stamp this; this one did not,
      // so an offer letter from a university was the one document on file that
      // nobody could date. uploaded_at has no database default, so the row was
      // simply left null. A trigger (0154) now backs all three up.
      uploaded_at: new Date().toISOString(),
    });
    if (error) return { error: error.message };
  }

  revalidatePath(`/partner/applications/${applicationId}`);
  return { success: true };
}

export async function partnerUploadCommissionProof(commissionId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Choose a file." };

  const path = `${commissionId}/proof-${file.name}`;
  const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { upsert: true });
  if (uploadError) return { error: uploadError.message };

  const { error } = await supabase
    .from("partner_commissions")
    .update({ payment_proof_path: path, payment_proof_uploaded_at: new Date().toISOString() })
    .eq("id", commissionId);
  if (error) return { error: error.message };

  revalidatePath("/partner/commissions");
  return { success: true };
}

export async function partnerDisputeCommission(commissionId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("partner_commissions").update({ status: "disputed" }).eq("id", commissionId);
  if (error) return { error: error.message };
  revalidatePath("/partner/commissions");
  return { success: true };
}

export async function partnerUploadDocument(universityId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const file = formData.get("file") as File | null;
  const description = String(formData.get("description") ?? "").trim() || null;
  if (!file || file.size === 0) return { error: "Choose a file." };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = `${universityId}/exchange-${file.name}`;
  const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { upsert: true });
  if (uploadError) return { error: uploadError.message };

  const { error } = await supabase.from("partner_document_exchange").insert({
    university_id: universityId,
    file_path: path,
    description,
    uploaded_by_partner: user?.id,
  });

  if (error) return { error: error.message };

  revalidatePath("/partner/documents");
  return { success: true };
}

// Module 3D: Course/Program Management — partners self-manage their own
// university's course directory (RLS in 0034 scopes every call here to the
// caller's own university via partner_university_id()).
export async function partnerAddProgram(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: account } = await supabase
    .from("partner_university_accounts")
    .select("university_id, status")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  if (!account || account.status !== "active") return { error: "Not authorized." };
  const universityId = account.university_id;

  const level = String(formData.get("level") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const core_field = String(formData.get("core_field") ?? "").trim() || null;
  const sub_field = String(formData.get("sub_field") ?? "").trim() || null;
  const tuition_fee = formData.get("tuition_fee") ? Number(formData.get("tuition_fee")) : null;
  const duration = String(formData.get("duration") ?? "").trim() || null;
  const language_requirement = String(formData.get("language_requirement") ?? "").trim() || null;
  const application_deadline = String(formData.get("application_deadline") ?? "").trim() || null;

  if (!level || !name) return { error: "Level and name are required." };

  const { error } = await supabase.from("programs").insert({
    university_id: universityId,
    level,
    name,
    core_field,
    sub_field,
    tuition_fee,
    duration,
    language_requirement,
    application_deadline,
  });
  if (error) return { error: error.message };

  revalidatePath("/partner/programs");
  return { success: true };
}

export async function partnerDeleteProgram(programId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("programs").delete().eq("id", programId);
  if (error) return { error: error.message };
  revalidatePath("/partner/programs");
  return { success: true };
}
