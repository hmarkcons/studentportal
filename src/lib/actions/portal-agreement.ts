"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateDocumentFile, validateVideoFile, sanitizeFilename } from "@/lib/documentUpload";

// Student-side submission of an e-signed agreement (outside Karachi). Files go
// up first, then a single RPC records them — the RPC is what enforces "video or
// it doesn't count", so a caller can't record the agreement path without one.
// Status stays pending until staff verify.
//
// A submission may carry one half or both. On a first submission the form
// requires both; after staff send back only the video, it asks for only the
// video and this passes null for the document, which the RPC reads as "keep
// what is on file" and leaves that half's approval intact.
export async function submitSignedAgreement(
  agreementId: string,
  studentId: string,
  _prevState: unknown,
  formData: FormData
) {
  const supabase = await createClient();

  const agreementFile = formData.get("agreement") as File | null;
  const videoFile = formData.get("video") as File | null;
  const hasAgreement = Boolean(agreementFile && agreementFile.size > 0);
  const hasVideo = Boolean(videoFile && videoFile.size > 0);

  if (!hasAgreement && !hasVideo) {
    return { error: "Attach your signed agreement or record the video before submitting." };
  }

  if (hasAgreement) {
    const agreementError = validateDocumentFile(agreementFile!);
    if (agreementError) return { error: agreementError };
  }
  if (hasVideo) {
    const videoError = validateVideoFile(videoFile!);
    if (videoError) return { error: videoError };
  }

  const stamp = Date.now();
  let agreementPath: string | null = null;
  let videoPath: string | null = null;

  if (hasAgreement) {
    agreementPath = `${studentId}/agreements/${agreementId}-signed-${stamp}-${sanitizeFilename(agreementFile!.name)}`;
    const { error } = await supabase.storage.from("documents").upload(agreementPath, agreementFile!, { upsert: true });
    if (error) return { error: error.message };
  }

  if (hasVideo) {
    videoPath = `${studentId}/agreements/${agreementId}-consent-${stamp}-${sanitizeFilename(videoFile!.name || "recording.webm")}`;
    const { error } = await supabase.storage.from("documents").upload(videoPath, videoFile!, { upsert: true });
    if (error) return { error: error.message };
  }

  // The RPC still refuses a submission that would leave either half missing,
  // so "one half" only works when the other is already on record.
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
