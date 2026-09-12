"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sanitizeFilename, validateDocumentFile } from "@/lib/documentUpload";

export async function studentUploadDocument(documentId: string, studentId: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const file = formData.get("file") as File | null;

  if (!file || file.size === 0) return { error: "Choose a file to upload." };
  const validationError = validateDocumentFile(file);
  if (validationError) return { error: validationError };

  const { data: existing } = await supabase
    .from("student_documents")
    .select("status, file_path, version")
    .eq("id", documentId)
    .maybeSingle();
  if (!existing) return { error: "That document requirement no longer exists — reload the page." };
  if (existing.status === "verified") {
    return { error: "This document is already verified and can't be replaced — ask staff to reopen it first." };
  }

  // The version goes in the key, so a replacement cannot land on top of what
  // it replaces. This used to be `<student>/<document id>-<filename>` with
  // upsert: true — a student fixing a scan and re-uploading it under the same
  // filename destroyed the rejected one, which is the evidence of why it was
  // sent back.
  const nextVersion = (existing.version ?? 1) + (existing.file_path ? 1 : 0);
  const path = `${studentId}/${documentId}-v${nextVersion}-${sanitizeFilename(file.name)}`;
  const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { upsert: false });
  if (uploadError) return { error: uploadError.message };

  // One call, so the archive row and the replacement commit together (0165).
  const { error } = await supabase.rpc("replace_student_document", {
    p_document_id: documentId,
    p_new_path: path,
    p_uploaded_by_role: "student",
  });
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}
