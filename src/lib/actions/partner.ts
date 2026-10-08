"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { FEE_TEXT_MAX, parseTuitionText } from "@/lib/applicationFee";
import { syncStagesForApplication } from "@/lib/autoStagesSync";
import { refuseFinalizedStageByHand } from "@/lib/finalizedStageGuard";
import { sanitizeFilename, validateDocumentFile } from "@/lib/documentUpload";
import { parseRoundsFromFormData } from "@/lib/programRounds";
import { saveProgramRounds } from "@/lib/actions/programRoundsWrite";
import { parseSourceNames } from "@/lib/documentFileNames";
import { uploadedFile } from "@/lib/stagedUpload";

export async function partnerUpdateStage(applicationId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const current_stage = String(formData.get("current_stage") ?? "");
  if (!current_stage) return { error: "Choose a stage." };
  const refused = await refuseFinalizedStageByHand(supabase, applicationId, current_stage);
  if (refused) return { error: refused.error };

  const { error } = await supabase.from("applications").update({ current_stage }).eq("id", applicationId);
  if (error) return { error: error.message };

  await syncStagesForApplication(applicationId);
  revalidatePath(`/partner/applications/${applicationId}`);
  return { success: true };
}

export async function partnerUploadLetter(applicationId: string, category: "offer_letter" | "rejection_letter", _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const file = await uploadedFile(formData, "file");
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

  // The letter's requirement: the one already on this application, or a new one.
  // Its id chosen here: a university that sees its students in limited mode
  // may add the row but not read it back.
  const documentId = (existing?.id as string | undefined) ?? crypto.randomUUID();
  if (!existing) {
    const { error } = await supabase
      .from("student_documents")
      .insert({ id: documentId, student_id: app.student_id, application_id: applicationId, category, status: "missing", uploaded_by_role: "partner" });
    if (error) {
      await supabase.storage.from("documents").remove([path]);
      return { error: error.message };
    }
  }
  // A file of its own beside any earlier letter (0328) — one HMARK sent back
  // is replaced by it and kept in the history — under the name it was sent as.
  const { error: fileError } = await supabase.rpc("add_student_document_file", {
    p_document_id: documentId,
    p_path: path,
    p_name: file.name,
    p_sources: parseSourceNames(formData.get("file_sources")),
    p_role: "partner",
    p_status: "submitted",
  });
  if (fileError) {
    await supabase.storage.from("documents").remove([path]);
    return { error: fileError.message === "not authorized" ? "That application is not one of your university's." : fileError.message };
  }

  // An offer letter from the university moves the application and the country on.
  await syncStagesForApplication(applicationId);
  revalidatePath(`/partner/applications/${applicationId}`);
  return { success: true };
}

export async function partnerUploadCommissionProof(commissionId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const file = await uploadedFile(formData, "file");
  if (!file || file.size === 0) return { error: "Choose a file." };
  const proofTooLarge = validateDocumentFile(file, "file");
  if (proofTooLarge) return { error: proofTooLarge };

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
  const file = await uploadedFile(formData, "file");
  const description = String(formData.get("description") ?? "").trim() || null;
  if (!file || file.size === 0) return { error: "Choose a file." };
  const exchangeTooLarge = validateDocumentFile(file, "file");
  if (exchangeTooLarge) return { error: exchangeTooLarge };

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
  // An amount or words ("€3,000 per year", "Free") — see parseTuitionText.
  const tuition_fee = parseTuitionText(String(formData.get("tuition_fee") ?? ""));
  if (tuition_fee && tuition_fee.length > FEE_TEXT_MAX) return { error: `Keep the tuition fee to ${FEE_TEXT_MAX} characters.` };
  const duration = String(formData.get("duration") ?? "").trim() || null;
  const language_requirement = String(formData.get("language_requirement") ?? "").trim() || null;

  if (!level || !name) return { error: "Level and name are required." };

  // The dates are intake rounds in their own table, not two columns here —
  // see supabase/migrations/0232_program_intake_rounds.sql.
  const { data: created, error } = await supabase
    .from("programs")
    .insert({
      university_id: universityId,
      level,
      name,
      core_field,
      sub_field,
      tuition_fee,
      duration,
      language_requirement,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const rounds = parseRoundsFromFormData(formData);
  if (rounds.length > 0) {
    const roundsError = await saveProgramRounds(supabase, created.id, rounds);
    if (roundsError) return { error: `Programme added, but its intake rounds could not be saved: ${roundsError}` };
  }

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
