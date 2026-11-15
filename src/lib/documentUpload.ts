import { MAX_UPLOAD_BYTES, fileSizeError, reduceHint } from "./fileSize.ts";

// The office set 5 MB per document. Held here rather than repeated, so the
// browser hint, the browser check and this backstop can never disagree.
export const MAX_DOCUMENT_SIZE_BYTES = MAX_UPLOAD_BYTES;

/**
 * Whether a document can be stored: any type at all (the office's choice,
 * 2026-11-15), within the size limit. Uploads whose file is read or shown as
 * it is — a spreadsheet to import, a photo, an email template, a consent
 * video — check their own format; this is for everything kept as a file.
 */
export function validateDocumentFile(file: File, noun = "document"): string | null {
  // The same sentence the browser would have shown. Reached when the browser
  // check was bypassed or the file grew between the two — so it has to stand
  // on its own, naming the size and what to do about it.
  const tooLarge = fileSizeError(file.size, MAX_DOCUMENT_SIZE_BYTES, noun);
  if (tooLarge) {
    const advice = reduceHint(file.type, file.name);
    return advice ? `${tooLarge} ${advice}` : tooLarge;
  }
  return null;
}

// Storage object paths are built as `${studentId}/${documentId}-${filename}` —
// strip anything that isn't safe in a storage key so an unusual original
// filename (spaces, unicode, path separators) can't produce a bad path.
// E-signature consent videos (see student_submit_signed_agreement). Capped at
// 60 seconds of webcam capture, which lands around 3-5MB — the ceiling here is
// deliberately looser to allow for a phone-recorded file uploaded as a
// fallback, which is often larger for the same duration.
export const MAX_VIDEO_SIZE_BYTES = 40 * 1024 * 1024; // 40MB
export const MAX_VIDEO_SECONDS = 60;
export const ACCEPTED_VIDEO_ACCEPT = "video/*";

const VIDEO_EXTENSIONS = [".webm", ".mp4", ".m4v", ".mov", ".ogg", ".ogv", ".3gp", ".avi", ".mkv"];

export function validateVideoFile(file: File): string | null {
  if (file.size > MAX_VIDEO_SIZE_BYTES) {
    return `Video is too large (max ${MAX_VIDEO_SIZE_BYTES / (1024 * 1024)}MB). Record a shorter clip.`;
  }
  // Recorded clips arrive as "video/webm;codecs=vp8,opus", and some mobile
  // captures report no type at all — so compare only the type/subtype and
  // fall back to the extension rather than demanding a bare "video/*".
  const baseType = file.type.split(";")[0].trim().toLowerCase();
  const name = file.name.toLowerCase();
  const looksLikeVideo =
    baseType.startsWith("video/") || (!baseType && VIDEO_EXTENSIONS.some((e) => name.endsWith(e)));
  if (baseType && !baseType.startsWith("video/")) {
    return "That isn't a video file — record a clip or choose a video.";
  }
  if (!looksLikeVideo) {
    return "That isn't a video file — record a clip or choose a video.";
  }
  return null;
}

export function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-150);
  return cleaned || "file";
}
