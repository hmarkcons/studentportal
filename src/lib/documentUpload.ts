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
export function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-150);
  return cleaned || "file";
}
