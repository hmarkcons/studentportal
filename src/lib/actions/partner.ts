"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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

  const { data: app } = await supabase.from("applications").select("student_id").eq("id", applicationId).maybeSingle();
  if (!app) return { error: "Application not found." };

  const path = `${app.student_id}/${applicationId}-${category}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { upsert: true });
  if (uploadError) return { error: uploadError.message };

  const { error } = await supabase.from("student_documents").insert({
    student_id: app.student_id,
    application_id: applicationId,
    category,
    file_path: path,
    status: "submitted",
    uploaded_by_role: "partner",
  });

  if (error) return { error: error.message };

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

  const { error } = await supabase.from("partner_commissions").update({ payment_proof_path: path }).eq("id", commissionId);
  if (error) return { error: error.message };

  revalidatePath("/partner/commissions");
  return { success: true };
}

export async function partnerDisputeCommission(commissionId: string) {
  const supabase = await createClient();
  await supabase.from("partner_commissions").update({ status: "disputed" }).eq("id", commissionId);
  revalidatePath("/partner/commissions");
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
  await supabase.from("programs").delete().eq("id", programId);
  revalidatePath("/partner/programs");
}
