"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function uploadDocument(
  documentId: string,
  studentId: string,
  revalidateTo: string,
  _prevState: unknown,
  formData: FormData
) {
  const supabase = await createClient();
  const file = formData.get("file") as File | null;

  if (!file || file.size === 0) {
    return { error: "Choose a file to upload." };
  }

  const path = `${studentId}/${documentId}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { upsert: true });
  if (uploadError) return { error: uploadError.message };

  const { error } = await supabase
    .from("student_documents")
    .update({
      file_path: path,
      status: "submitted",
      uploaded_at: new Date().toISOString(),
      uploaded_by_role: "staff",
    })
    .eq("id", documentId);

  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function reviewDocument(documentId: string, revalidateTo: string, status: "verified" | "rejected", reason?: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase
    .from("student_documents")
    .update({
      status,
      verified_by: user?.id,
      verified_at: new Date().toISOString(),
      rejected_reason: status === "rejected" ? reason ?? null : null,
    })
    .eq("id", documentId);

  revalidatePath(revalidateTo);
}

export async function addDocumentRequirement(
  studentId: string,
  applicationId: string | null,
  revalidateTo: string,
  _prevState: unknown,
  formData: FormData
) {
  const supabase = await createClient();
  const category = String(formData.get("category") ?? "other");
  const name = String(formData.get("name") ?? "").trim();
  const deadline = String(formData.get("deadline") ?? "") || null;

  if (!name) return { error: "Name is required." };

  const { error } = await supabase.from("student_documents").insert({
    student_id: studentId,
    application_id: applicationId,
    category,
    deadline,
    status: "missing",
  });

  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}
