// A signature given in the portal, as the server takes it: a PNG it can trust
// the size of, and the line printed under it in the agreement. Pure — the
// unit tests (scripts/esignature-test.mjs) read it under plain Node.

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The largest signature image taken: a cropped signature is far smaller. */
export const SIGNATURE_MAX_BYTES = 2 * 1024 * 1024;

const u32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;

/**
 * The width and height of a signature PNG, or why it is not one: it must be a
 * PNG (its first bytes say so, whatever it is called), of a sensible size and
 * shape for a signature, and able to be transparent — the paper taken out.
 */
export function signatureFromPng(bytes: Uint8Array): { width: number; height: number } | { error: string } {
  if (bytes.length > SIGNATURE_MAX_BYTES) return { error: "That signature image is too large. Draw or upload it again." };
  if (bytes.length < 33 || PNG_MAGIC.some((b, i) => bytes[i] !== b)) return { error: "That is not a signature image. Draw or upload it again." };
  // The first chunk is always IHDR: width, height, bit depth, colour type.
  if (String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]) !== "IHDR") return { error: "That signature image could not be read. Draw or upload it again." };
  const width = u32(bytes, 16);
  const height = u32(bytes, 20);
  const colourType = bytes[25];
  // 6 is colour with transparency, 4 grey with it, 3 a palette (which can carry it).
  if (![3, 4, 6].includes(colourType)) return { error: "That signature still has its background. Draw or upload it again." };
  if (width < 20 || height < 10 || width > 4000 || height > 2000) return { error: "That signature image is not a usable size. Draw or upload it again." };
  const ratio = width / height;
  if (ratio < 0.4 || ratio > 25) return { error: "That does not look like a signature. Draw or upload it again." };
  return { width, height };
}

/**
 * The line under the student's signature: who signed, when — in Karachi's
 * time, where the agreement is kept — and how. "Signed electronically by Ali
 * Raza on 7 October 2026 at 3:15 pm (Pakistan time), in the HMARK student portal."
 */
export function signedLineText(name: string, at: Date): string {
  const day = at.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Karachi" });
  const time = at
    .toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Karachi" })
    .replace(/\s/g, " ")
    .toLowerCase();
  return `Signed electronically by ${name.trim() || "the client"} on ${day} at ${time} (Pakistan time), in the HMARK student portal.`;
}

/** Whether a signed copy on file was e-signed in the portal rather than uploaded. */
export function isPortalESigned(signedFilePath: string | null | undefined): boolean {
  return Boolean(signedFilePath && /-e-signed\.pdf$/.test(signedFilePath));
}
