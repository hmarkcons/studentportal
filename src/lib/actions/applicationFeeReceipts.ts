"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/permissions";
import { uploadedFiles } from "@/lib/stagedUpload";
import { sanitizeFilename, validateDocumentFile } from "@/lib/documentUpload";
import { removeStorageFiles } from "@/lib/fileTrash";
import { ensureCurrentCycle } from "@/lib/ensureCycle";
import { FEE_RECEIPT_CATEGORY, FEE_RECEIPT_NAME, MAX_FEE_RECEIPTS_AT_ONCE, feeReceiptPath } from "@/lib/applicationFeeReceipts";

// Application fee receipts (0365), filed on an application by Processing (and
// Super Admin) — the office's choice, the same line as the documents from the
// university. Each file is kept as its own; all of an application's receipts
// sit in one "Application fee receipt" requirement in the student's
// Application Fee section, approved as they are filed. The student sees them
// only once "Show to the student" is ticked, and is told then.

const DENIED = "Only Super Admin and the Processing team can file application fee receipts.";
type Result = { success: true; message: string } | { error: string };

function revalidateAll(studentId: string, applicationId: string) {
  revalidatePath(`/students/${studentId}/applications/${applicationId}`);
  revalidatePath(`/students/${studentId}/documents`);
}

/** The application, if it is this student's — with whether its receipts are shown. */
async function applicationOf(supabase: Awaited<ReturnType<typeof createClient>>, studentId: string, applicationId: string) {
  const { data } = await supabase.from("applications").select("id, student_id, cycle_id, fee_receipts_visible").eq("id", applicationId).maybeSingle();
  return data && data.student_id === studentId ? data : null;
}

/** Uploads one or more receipts to an application, each kept as a file of its own. */
export async function uploadFeeReceipts(studentId: string, applicationId: string, _prev: unknown, formData: FormData): Promise<Result> {
  const denied = await requirePermission("documents.manage_requirements", DENIED);
  if (denied) return denied;
  const supabase = await createClient();
  const app = await applicationOf(supabase, studentId, applicationId);
  if (!app) return { error: "That application isn't this student's." };

  const { files, sent } = await uploadedFiles(formData, "files", { max: MAX_FEE_RECEIPTS_AT_ONCE });
  if (sent > MAX_FEE_RECEIPTS_AT_ONCE) return { error: `Upload at most ${MAX_FEE_RECEIPTS_AT_ONCE} receipts at once.` };
  if (!files.length) return { error: "Choose the receipt files to upload." };
  if (files.length < sent) return { error: "Some of the files could not be read — choose them again." };
  for (const f of files) {
    const problem = validateDocumentFile(f);
    if (problem) return { error: `${f.name}: ${problem}` };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const now = new Date().toISOString();

  // The application's receipts requirement: found, or made — approved, as what is filed here is.
  const { data: existing } = await supabase
    .from("student_documents")
    .select("id")
    .eq("application_id", applicationId)
    .eq("category", FEE_RECEIPT_CATEGORY)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  let documentId = existing?.id as string | undefined;
  let made = false;
  if (!documentId) {
    const cycleId = (app.cycle_id as string | null) ?? (await ensureCurrentCycle(studentId))?.id ?? null;
    const { data: row, error } = await supabase
      .from("student_documents")
      .insert({
        student_id: studentId,
        application_id: applicationId,
        category: FEE_RECEIPT_CATEGORY,
        custom_name: FEE_RECEIPT_NAME,
        status: "verified",
        uploaded_by_role: "staff",
        uploaded_at: now,
        verified_by: user?.id ?? null,
        verified_at: now,
        cycle_id: cycleId,
      })
      .select("id")
      .single();
    if (error || !row) return { error: error?.message.includes("row-level security") ? DENIED : (error?.message ?? "The receipt could not be filed.") };
    documentId = row.id as string;
    made = true;
  }

  let added = 0;
  for (const f of files) {
    const path = feeReceiptPath(studentId, applicationId, sanitizeFilename(f.name), crypto.randomUUID().slice(0, 8));
    const { error: uploadError } = await supabase.storage.from("documents").upload(path, f, { upsert: false, contentType: f.type || undefined });
    if (uploadError) {
      if (made && added === 0) await supabase.from("student_documents").delete().eq("id", documentId);
      return { error: added ? `${added} receipt${added === 1 ? "" : "s"} uploaded, then ${f.name} failed: ${uploadError.message}` : uploadError.message };
    }
    const { error: fileError } = await supabase.rpc("add_student_document_file", {
      p_document_id: documentId,
      p_path: path,
      p_name: f.name,
      p_sources: null,
      p_role: "staff",
      p_status: "verified",
    });
    if (fileError) {
      // Only a file just put there, never recorded, is removed outright.
      await supabase.storage.from("documents").remove([path]);
      if (made && added === 0) await supabase.from("student_documents").delete().eq("id", documentId);
      return { error: fileError.message === "not authorized" ? DENIED : fileError.message };
    }
    added += 1;
  }

  // Shown to the student already: they hear that another has arrived.
  if (app.fee_receipts_visible) await createAdminClient().rpc("notify_fee_receipts", { p_application: applicationId });
  revalidateAll(studentId, applicationId);
  return { success: true, message: `${added} receipt${added === 1 ? "" : "s"} uploaded.` };
}

/** Removes one receipt file; the requirement goes with its last file, so the section never shows an empty one. */
export async function removeFeeReceipt(studentId: string, applicationId: string, fileId: string): Promise<Result> {
  const denied = await requirePermission("documents.manage_requirements", DENIED);
  if (denied) return denied;
  const supabase = await createClient();
  const { data: file } = await supabase
    .from("student_document_files")
    .select("id, document_id, document:student_documents!inner(application_id, category, student_id)")
    .eq("id", fileId)
    .maybeSingle();
  const doc = (Array.isArray(file?.document) ? file?.document[0] : file?.document) as { application_id: string; category: string; student_id: string } | undefined;
  if (!file || !doc || doc.category !== FEE_RECEIPT_CATEGORY || doc.application_id !== applicationId || doc.student_id !== studentId) {
    return { error: "That receipt is no longer there — reload the page." };
  }
  const { data: path, error } = await supabase.rpc("remove_student_document_file", { p_file_id: fileId });
  if (error) return { error: error.message === "not authorized" ? DENIED : error.message };
  // Kept in the trash for 90 days, so a restore from the audit log brings the file back too.
  if (typeof path === "string" && path) await removeStorageFiles(supabase, "documents", [path]);
  const { count } = await supabase.from("student_document_files").select("id", { count: "exact", head: true }).eq("document_id", file.document_id);
  if (!count) await supabase.from("student_documents").delete().eq("id", file.document_id);
  revalidateAll(studentId, applicationId);
  return { success: true, message: "Removed." };
}

/** Shows an application's receipts to the student, or hides them again. Shown, the student is told. */
export async function setFeeReceiptsVisible(studentId: string, applicationId: string, visible: boolean): Promise<Result> {
  const denied = await requirePermission("documents.manage_requirements", DENIED);
  if (denied) return denied;
  const supabase = await createClient();
  const app = await applicationOf(supabase, studentId, applicationId);
  if (!app) return { error: "That application isn't this student's." };
  if (Boolean(app.fee_receipts_visible) === visible) return { success: true, message: visible ? "Shown to the student." : "Hidden from the student." };
  const { data: saved, error } = await supabase.from("applications").update({ fee_receipts_visible: visible }).eq("id", applicationId).select("id");
  if (error) return { error: error.message };
  if (!saved?.length) return { error: DENIED };
  if (visible) {
    const { count } = await supabase.from("student_documents").select("id", { count: "exact", head: true }).eq("application_id", applicationId).eq("category", FEE_RECEIPT_CATEGORY);
    if (count) await createAdminClient().rpc("notify_fee_receipts", { p_application: applicationId });
  }
  revalidateAll(studentId, applicationId);
  return { success: true, message: visible ? "Shown to the student — they have been told." : "Hidden from the student." };
}
