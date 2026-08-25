"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function generateAgreement(studentId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const template_id = String(formData.get("template_id") ?? "") || null;
  const signing_method = String(formData.get("signing_method") ?? "");
  const admin_charge_override = formData.get("admin_charge_override")
    ? Number(formData.get("admin_charge_override"))
    : null;
  const consultancy_fee_override = formData.get("consultancy_fee_override")
    ? Number(formData.get("consultancy_fee_override"))
    : null;

  if (!["paper", "e_signature"].includes(signing_method)) {
    return { error: "Choose a signing method." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("agreements").insert({
    student_id: studentId,
    template_id,
    signing_method,
    admin_charge_override,
    consultancy_fee_override,
    generated_by: user?.id,
    status: "pending_signature",
  });

  if (error) return { error: error.message };

  revalidatePath(`/students/${studentId}`);
  return { success: true };
}

export async function uploadSignedAgreement(agreementId: string, studentId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const file = formData.get("file") as File | null;
  const email_verified = formData.get("email_verified") === "on";
  const video_recording_path = String(formData.get("video_recording_path") ?? "") || null;

  if (!file || file.size === 0) {
    return { error: "Choose a file to upload." };
  }

  const path = `${studentId}/agreements/${agreementId}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { upsert: true });
  if (uploadError) return { error: uploadError.message };

  const { error } = await supabase
    .from("agreements")
    .update({ signed_file_path: path, status: "signed", email_verified, video_recording_path })
    .eq("id", agreementId);

  if (error) return { error: error.message };

  revalidatePath(`/students/${studentId}`);
  return { success: true };
}
