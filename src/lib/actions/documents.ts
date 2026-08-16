"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const STATUSES = ["missing", "submitted", "under_review", "verified", "rejected"] as const;

export async function uploadDocument(
  studentId: string,
  studentDocumentId: string,
  _prevState: unknown,
  formData: FormData
) {
  const supabase = await createClient();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file first." };
  }

  const path = `${studentId}/${studentDocumentId}-${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(path, file, { upsert: true });

  if (uploadError) {
    return { error: uploadError.message };
  }

  const { error } = await supabase
    .from("student_documents")
    .update({ file_path: path, status: "submitted", uploaded_at: new Date().toISOString() })
    .eq("id", studentDocumentId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/students/${studentId}`);
  return { success: true };
}

export async function updateDocumentStatus(studentId: string, studentDocumentId: string, status: string) {
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const patch: Record<string, unknown> = { status };
  if (status === "verified") {
    patch.verified_by = user?.id ?? null;
    patch.verified_at = new Date().toISOString();
  }

  await supabase.from("student_documents").update(patch).eq("id", studentDocumentId);
  revalidatePath(`/students/${studentId}`);
}
