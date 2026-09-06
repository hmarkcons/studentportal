export const MAX_DOCUMENT_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

export const ACCEPTED_DOCUMENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

// A hint for the <input accept> attribute — kept in sync with ACCEPTED_DOCUMENT_TYPES.
export const ACCEPTED_DOCUMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.doc,.docx";

export function validateDocumentFile(file: File): string | null {
  if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
    return `File is too large (max ${MAX_DOCUMENT_SIZE_BYTES / (1024 * 1024)}MB).`;
  }
  // Some mobile browsers/cameras omit a MIME type on capture — only reject
  // when a type IS reported and it's not one we accept, rather than requiring one.
  if (file.type && !(ACCEPTED_DOCUMENT_TYPES as readonly string[]).includes(file.type)) {
    return "Unsupported file type — upload a PDF, Word document, or image.";
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
