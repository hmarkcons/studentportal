"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeFilename, validateDocumentFile } from "@/lib/documentUpload";
import { documentFilePath, parseSourceNames } from "@/lib/documentFileNames";
import { removeStorageFiles } from "@/lib/fileTrash";
import { uploadedFile } from "@/lib/stagedUpload";

/**
 * A file the student sends for a requirement (0328): added beside any
 * already there, or — where one was sent back — in its place, the one sent
 * back kept in the history. Several chosen at once arrive joined into one,
 * with the names they were joined from.
 */
export async function studentUploadDocument(documentId: string, studentId: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const file = await uploadedFile(formData, "file");

  if (!file || file.size === 0) return { error: "Choose a file to upload." };
  const validationError = validateDocumentFile(file);
  if (validationError) return { error: validationError };

  const { data: existing } = await supabase.from("student_documents").select("status").eq("id", documentId).maybeSingle();
  if (!existing) return { error: "That document requirement no longer exists — reload the page." };
  if (existing.status === "verified") {
    return { error: "This document is already approved — ask your processing officer if something needs to change." };
  }

  // A folder of its own, so no upload can land on top of another.
  const path = documentFilePath(studentId, documentId, sanitizeFilename(file.name), crypto.randomUUID().slice(0, 8));
  const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { upsert: false });
  if (uploadError) return { error: uploadError.message };

  const { error } = await supabase.rpc("add_student_document_file", {
    p_document_id: documentId,
    p_path: path,
    p_name: file.name,
    p_sources: parseSourceNames(formData.get("file_sources")),
    p_role: "student",
    p_status: "submitted",
  });
  if (error) {
    await supabase.storage.from("documents").remove([path]);
    return { error: error.message === "not authorized" ? "That document is not yours to upload." : error.message };
  }

  revalidatePath(revalidateTo);
  return { success: true };
}

/**
 * Takes one of their own files off a requirement, until it is approved — one
 * sent by mistake. The database checks it is theirs and not yet approved; the
 * file itself is kept for 90 days (fileTrash), removed with the service role
 * since a student may not delete from storage.
 */
export async function studentRemoveDocumentFile(fileId: string, revalidateTo: string) {
  const supabase = await createClient();
  const { data: path, error } = await supabase.rpc("remove_student_document_file", { p_file_id: fileId });
  if (error) return { error: error.message === "not authorized" ? "That file has been approved, or is not yours to remove — ask your processing officer." : error.message };
  if (typeof path === "string" && path) await removeStorageFiles(createAdminClient(), "documents", [path]);
  revalidatePath(revalidateTo);
  return { success: true };
}
