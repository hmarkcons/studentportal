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

  const { data: existing } = await supabase.from("student_documents").select("status").eq("id", documentId).maybeSingle();
  if (existing?.status === "verified") {
    return { error: "This document is already verified and can't be replaced — ask staff to reopen it first." };
  }

  const path = `${studentId}/${documentId}-${sanitizeFilename(file.name)}`;
  const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { upsert: true });
  if (uploadError) return { error: uploadError.message };

  const { error } = await supabase
    .from("student_documents")
    .update({ file_path: path, status: "submitted", uploaded_at: new Date().toISOString(), uploaded_by_role: "student" })
    .eq("id", documentId);

  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}
