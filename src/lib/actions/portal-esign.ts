"use server";

import { revalidatePath } from "next/cache";
import { getStudentUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadedFile } from "@/lib/stagedUpload";
import { buildStudentAgreementPdf } from "@/lib/agreementPdfBuild";
import { validateVideoFile, sanitizeFilename } from "@/lib/documentUpload";
import { signatureFromPng, signedLineText } from "@/lib/esignature";
import type { ClientSignature } from "@/lib/pdf/AgreementDocument";

// A student signing their agreement in the portal: the signature they drew or
// photographed (SignatureCapture) placed wherever the client signs — the line
// after the last clause and the box at the foot of every page — in a PDF they
// look at first (preview), then submit. The submitted PDF is the "signed
// agreement" half of an e-signature submission, recorded through the same
// student_submit_signed_agreement as an uploaded scan, with the consent video
// beside it, and checked by staff the same way.
//
// The PDF is built here, on the server, from the agreement's own record — not
// from anything the browser made — so the copy on file is the agreement HMARK
// wrote with the student's signature in it, nothing else.

type Ready = {
  supabase: Awaited<ReturnType<typeof getStudentUser>>["supabase"];
  student: { id: string; full_name: string };
};

/** The signed-in student, if this agreement is theirs to sign in the portal now. */
async function forSigning(agreementId: string): Promise<Ready | { error: string }> {
  const { supabase, userId } = await getStudentUser();
  if (!userId) return { error: "You have been signed out. Sign in again, then sign the agreement." };
  const { data: student } = await supabase.from("leads").select("id, full_name").eq("auth_user_id", userId).maybeSingle();
  if (!student) return { error: "Your student record could not be found." };
  const { data: agreement } = await supabase
    .from("agreements")
    .select("id, student_id, status, signing_method, signed_file_path, pdf_path")
    .eq("id", agreementId)
    .maybeSingle();
  if (!agreement || agreement.student_id !== student.id) return { error: "That agreement is not yours to sign." };
  if (agreement.signing_method !== "e_signature") return { error: "This agreement is signed in person at the office." };
  if (agreement.status === "signed") return { error: "This agreement is already signed." };
  if (agreement.signed_file_path) return { error: "Your signed agreement is already with your counsellor." };
  // Staff generate the PDF when the agreement is final; until then there is nothing settled to sign.
  if (!agreement.pdf_path) return { error: "Your agreement is still being prepared. You can sign it as soon as your counsellor has it ready." };
  return { supabase, student: student as Ready["student"] };
}

/** The builder's refusal, said to the student: their profile is theirs to complete. */
function forStudent(error: string): string {
  const missing = error.match(/missing: (.+)\.$/);
  return missing ? `Your profile is missing your ${missing[1]}. Add ${missing[1].includes(",") ? "them" : "it"} on your Profile page, then sign.` : error;
}

/** The signature the browser staged, checked to be a real, reasonable PNG. */
async function stagedSignature(ref: FormDataEntryValue | null): Promise<{ bytes: Buffer; width: number; height: number } | { error: string }> {
  const form = new FormData();
  if (ref !== null) form.set("signature", ref);
  const file = await uploadedFile(form, "signature");
  if (!file || file.size === 0) return { error: "Sign the agreement first — draw your signature or upload a photo of it." };
  const bytes = Buffer.from(await file.arrayBuffer());
  const read = signatureFromPng(bytes);
  if ("error" in read) return read;
  return { bytes, ...read };
}

function clientSignature(sig: { bytes: Buffer; width: number; height: number }, name: string, at: Date): ClientSignature {
  return { dataUri: `data:image/png;base64,${sig.bytes.toString("base64")}`, width: sig.width, height: sig.height, signedLine: signedLineText(name, at) };
}

/**
 * The agreement with the student's signature in it, to look at before
 * submitting: built, kept beside their agreement as a preview, and handed back
 * as a link that works for ten minutes.
 */
export async function previewESignedAgreement(agreementId: string, signatureRef: string): Promise<{ url: string } | { error: string }> {
  const ready = await forSigning(agreementId);
  if ("error" in ready) return ready;
  const sig = await stagedSignature(signatureRef);
  if ("error" in sig) return sig;

  // The service role builds it: HMARK's own signature image is not the
  // student's to read. They have been checked to own the agreement above.
  const admin = createAdminClient();
  const built = await buildStudentAgreementPdf(admin, agreementId, ready.student.id, {
    clientSignature: clientSignature(sig, ready.student.full_name, new Date()),
  });
  if ("error" in built) return { error: forStudent(built.error) };

  const path = `${ready.student.id}/agreements/${agreementId}-esign-preview.pdf`;
  const { error } = await admin.storage.from("documents").upload(path, built.buffer, { contentType: "application/pdf", upsert: true });
  if (error) return { error: "The preview could not be saved. Try again in a moment." };
  const { data: link } = await admin.storage.from("documents").createSignedUrl(path, 600);
  if (!link?.signedUrl) return { error: "The preview could not be opened. Try again in a moment." };
  return { url: link.signedUrl };
}

/**
 * Submits the e-signed agreement: built again now, with the time it was
 * signed, filed as the signed agreement, with the signature image kept beside
 * it and the consent video when one is asked for — then recorded exactly as
 * an uploaded scan is, so staff verify it the same way.
 */
export async function submitESignedAgreement(agreementId: string, _prevState: unknown, formData: FormData) {
  const ready = await forSigning(agreementId);
  if ("error" in ready) return ready;
  const sig = await stagedSignature(formData.get("signature"));
  if ("error" in sig) return sig;

  const videoFile = await uploadedFile(formData, "video", { allowVideo: true });
  const hasVideo = Boolean(videoFile && videoFile.size > 0);
  if (hasVideo) {
    const videoError = validateVideoFile(videoFile!);
    if (videoError) return { error: videoError };
  }

  const admin = createAdminClient();
  const signedAt = new Date();
  const built = await buildStudentAgreementPdf(admin, agreementId, ready.student.id, {
    clientSignature: clientSignature(sig, ready.student.full_name, signedAt),
  });
  if ("error" in built) return { error: forStudent(built.error) };

  // Filed as the student, under their own folder, as an uploaded copy is.
  const stamp = signedAt.getTime();
  const folder = `${ready.student.id}/agreements`;
  const signedPath = `${folder}/${agreementId}-signed-${stamp}-e-signed.pdf`;
  const signaturePath = `${folder}/${agreementId}-signature-${stamp}.png`;
  const [pdfUp, sigUp] = await Promise.all([
    ready.supabase.storage.from("documents").upload(signedPath, built.buffer, { contentType: "application/pdf", upsert: true }),
    ready.supabase.storage.from("documents").upload(signaturePath, sig.bytes, { contentType: "image/png", upsert: true }),
  ]);
  if (pdfUp.error) return { error: pdfUp.error.message };
  if (sigUp.error) return { error: sigUp.error.message };

  let videoPath: string | null = null;
  if (hasVideo) {
    videoPath = `${folder}/${agreementId}-consent-${stamp}-${sanitizeFilename(videoFile!.name || "recording.webm")}`;
    const { error } = await ready.supabase.storage.from("documents").upload(videoPath, videoFile!, { upsert: true });
    if (error) return { error: error.message };
  }

  // The RPC refuses a submission that would leave the video missing, so a
  // first submission needs it here; a resubmission of the signature alone
  // keeps the video already on file.
  const { error } = await ready.supabase.rpc("student_submit_signed_agreement", {
    p_agreement_id: agreementId,
    p_signed_path: signedPath,
    p_video_path: videoPath,
  });
  if (error) {
    await ready.supabase.storage.from("documents").remove([signedPath, signaturePath, ...(videoPath ? [videoPath] : [])]);
    return { error: error.message };
  }

  // The preview has served its purpose.
  await admin.storage.from("documents").remove([`${folder}/${agreementId}-esign-preview.pdf`]).catch(() => {});

  revalidatePath("/portal/agreement");
  revalidatePath(`/students/${ready.student.id}`);
  return { success: true };
}
