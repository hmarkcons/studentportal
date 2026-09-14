// One place that decides how big an upload may be, and how that is said.
//
// The office set 2 MB per document. Every upload in the app is held to it —
// documents, signed agreements, payment proofs, imports, templates — with one
// lower limit for profile photos, which have no reason to be large, and one
// deliberate exception for the e-signature consent video (see
// MAX_VIDEO_SIZE_BYTES in documentUpload.ts): sixty seconds of webcam capture
// cannot be 2 MB, so holding it to that would disable agreement signing.
//
// Kept free of any browser or server API so both sides use the same numbers
// and the same wording — a limit enforced in one place and worded differently
// in another is how a student ends up told two things about the same file.

/** Every document, agreement, proof, import and template. */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/** A head-and-shoulders photo. Smaller on purpose — nothing needs more. */
export const MAX_PHOTO_BYTES = 500 * 1024;

/**
 * A size a person would write.
 *
 * Whole numbers under a megabyte, one decimal above it: "512 KB" and "4.2 MB"
 * are how the number is said out loud, and "4.23 MB" reads as precision that
 * is not the point when the answer is "too big".
 */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  // An exact figure loses the decimal, so the limit reads as "max 2 MB". A
  // measured one keeps it — 2.04 MB printed as "2 MB" would read as being at
  // the limit while being refused by it, so it stays "2.0 MB".
  if (bytes % (1024 * 1024) === 0) return `${mb} MB`;
  return `${(Math.round(mb * 10) / 10).toFixed(1)} MB`;
}

/** How the limit is written wherever it is mentioned up front. */
export function limitHint(limitBytes: number = MAX_UPLOAD_BYTES): string {
  return `max ${formatFileSize(limitBytes)}`;
}

/**
 * Why this file cannot be sent, or null.
 *
 * Names the file's actual size, because "too large" leaves a person guessing
 * how much they have to lose — and someone who knows they are 0.3 MB over
 * behaves differently from someone who thinks they might be ten times over.
 */
export function fileSizeError(
  bytes: number,
  limitBytes: number = MAX_UPLOAD_BYTES,
  noun = "document"
): string | null {
  if (bytes <= limitBytes) return null;
  return `This file is ${formatFileSize(bytes)}. The limit is ${formatFileSize(limitBytes)} per ${noun}. Reduce it and try again.`;
}

/** What was done to a file to get it under the limit, for saying so afterwards. */
export function shrunkNote(fromBytes: number, toBytes: number, limitBytes: number = MAX_UPLOAD_BYTES): string {
  return `Reduced from ${formatFileSize(fromBytes)} to ${formatFileSize(toBytes)} to fit the ${formatFileSize(limitBytes)} limit.`;
}

const SHRINKABLE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const SHRINKABLE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

/**
 * Whether an oversized file can be made smaller in the browser.
 *
 * JPEG, PNG and WebP can be drawn to a canvas and re-encoded. HEIC cannot —
 * no browser decodes it without a library, and a phone that shoots HEIC can
 * be told to shoot JPEG instead, which is a better answer than shipping a
 * decoder. A PDF cannot be resized at all without rewriting its contents,
 * which is not something to do silently to a legal document.
 */
export function isShrinkableImage(type: string | null | undefined, name = ""): boolean {
  const base = (type ?? "").split(";")[0].trim().toLowerCase();
  if (base) return SHRINKABLE_TYPES.includes(base);
  // Some phone captures report no type at all, so fall back to the extension.
  const lower = name.toLowerCase();
  return SHRINKABLE_EXTENSIONS.some((e) => lower.endsWith(e));
}

/**
 * The extra sentence an oversized file that cannot be shrunk deserves.
 *
 * A PDF and a HEIC photo are both refused, but what the person should do next
 * is different, and "reduce it" alone leaves them with no idea how.
 */
export function reduceHint(type: string | null | undefined, name = ""): string | null {
  const base = (type ?? "").split(";")[0].trim().toLowerCase();
  const lower = name.toLowerCase();
  if (base === "application/pdf" || lower.endsWith(".pdf")) {
    return "For a PDF, scan at a lower quality or use a compress-PDF tool, then upload it again.";
  }
  if (base === "image/heic" || base === "image/heif" || lower.endsWith(".heic") || lower.endsWith(".heif")) {
    return "This photo is in Apple's HEIC format, which cannot be resized here. Set your camera to “Most Compatible” (JPEG) and take it again, or save it as a JPEG first.";
  }
  if (base.startsWith("application/") && (lower.endsWith(".doc") || lower.endsWith(".docx"))) {
    return "For a Word file, save it as a PDF or remove large images from it.";
  }
  return null;
}
