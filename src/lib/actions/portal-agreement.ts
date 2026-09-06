"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateDocumentFile, validateVideoFile, sanitizeFilename } from "@/lib/documentUpload";

// Student-side submission of an e-signed agreement (outside Karachi). Both
// files go up first, then a single RPC records the pair — the RPC is what
// enforces "video or it doesn't count", so a caller can't record the
// agreement path without one. Status stays pending until staff verify.
export async function submitSignedAgreement(
  agreementId: string,
  studentId: string,
  _prevState: unknown,
  formData: FormData
) {
  const supabase = await createClient();

  const agreementFile = formData.get("agreement") as File | null;
  const videoFile = formData.get("video") as File | null;

  if (!agreementFile || agreementFile.size === 0) return { error: "Attach your signed agreement." };
  if (!videoFile || videoFile.size === 0) {
    return { error: "Record the short video before submitting — it's what makes the e-signature verifiable." };
  }

  const agreementError = validateDocumentFile(agreementFile);
  if (agreementError) return { error: agreementError };
  const videoError = validateVideoFile(videoFile);
  if (videoError) return { error: videoError };

  const stamp = Date.now();
  const agreementPath = `${studentId}/agreements/${agreementId}-signed-${stamp}-${sanitizeFilename(agreementFile.name)}`;
  const videoPath = `${studentId}/agreements/${agreementId}-consent-${stamp}-${sanitizeFilename(videoFile.name || "recording.webm")}`;

  const { error: agreementUploadError } = await supabase.storage.from("documents").upload(agreementPath, agreementFile, { upsert: true });
  if (agreementUploadError) return { error: agreementUploadError.message };

  const { error: videoUploadError } = await supabase.storage.from("documents").upload(videoPath, videoFile, { upsert: true });
  if (videoUploadError) return { error: videoUploadError.message };

  const { error } = await supabase.rpc("student_submit_signed_agreement", {
    p_agreement_id: agreementId,
    p_signed_path: agreementPath,
    p_video_path: videoPath,
  });
  if (error) return { error: error.message };

  revalidatePath("/portal/agreement");
  revalidatePath(`/students/${studentId}`);
  return { success: true };
}
