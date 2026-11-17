// Every stored file is downloaded as a PDF (2026-11-17): a document, a
// receipt, a letter, a signed agreement, a certificate, a proof, a task's
// attachment. This decides what each file is, and so how it becomes one —
// the converting itself is done in the browser (src/lib/toPdf.ts), where a
// file of any size can be handled and nothing leaves the portal.
//
// A file of a kind that cannot be made into a PDF (a .zip, a video, an old
// .doc) is downloaded as it is, and the person is told so. Staff can still
// open any file as it was uploaded; a student or a university has the PDF.
//
// No portal imports, so the unit tests load it under plain Node.

export type ConversionKind = "pdf" | "image" | "heic" | "text" | "csv" | "docx" | "xlsx" | "none";

const BY_EXTENSION: Record<string, ConversionKind> = {
  pdf: "pdf",
  jpg: "image",
  jpeg: "image",
  jfif: "image",
  png: "image",
  webp: "image",
  gif: "image",
  bmp: "image",
  avif: "image",
  svg: "image",
  heic: "heic",
  heif: "heic",
  txt: "text",
  text: "text",
  md: "text",
  markdown: "text",
  log: "text",
  json: "text",
  xml: "text",
  yaml: "text",
  yml: "text",
  ini: "text",
  htm: "text",
  html: "text",
  eml: "text",
  ics: "text",
  csv: "csv",
  tsv: "csv",
  docx: "docx",
  docm: "docx",
  dotx: "docx",
  xlsx: "xlsx",
  xlsm: "xlsx",
};

/** The file's extension, lower-cased, without the dot; "" when it has none. */
export function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const at = base.lastIndexOf(".");
  return at > 0 ? base.slice(at + 1).toLowerCase() : "";
}

/** How a file becomes a PDF, from its name and, when its name says nothing, its type. */
export function conversionKind(name: string, mime?: string | null): ConversionKind {
  const byName = BY_EXTENSION[extensionOf(name)];
  if (byName) return byName;
  const type = (mime ?? "").split(";")[0].trim().toLowerCase();
  if (type === "application/pdf") return "pdf";
  if (type === "image/heic" || type === "image/heif") return "heic";
  if (type.startsWith("image/")) return "image";
  if (type === "text/csv" || type === "text/tab-separated-values") return "csv";
  if (type.startsWith("text/")) return "text";
  if (type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "xlsx";
  return "none";
}

/** The name the PDF is saved under: the file's own, ending .pdf. */
export function pdfName(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "").trim();
  const stem = base.replace(/\.[^.]+$/, "").trim();
  return `${stem || "document"}.pdf`;
}

/**
 * A stored file's name from its link, when the page has no other: the last
 * part of the path, without the query that signs it. Stored names start with
 * a short tag or an id ("ab12cd34-receipt.pdf", "<uuid>-passport.jpg"), which
 * is no part of what the person called it.
 */
export function nameFromUrl(url: string): string {
  let path = url;
  try {
    path = new URL(url, "https://portal.invalid").pathname;
  } catch {
    path = url.split("?")[0];
  }
  let last = path.split("/").filter(Boolean).pop() ?? "";
  try {
    last = decodeURIComponent(last);
  } catch {
    // Left as it is.
  }
  const withoutId = last.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, "").replace(/^\d{10,}-/, "");
  return withoutId || last || "document";
}

/** What a person is told when a file of this kind comes down as it is. */
export function keptAsItIsNote(name: string, why?: string): string {
  const ext = extensionOf(name);
  const what = ext ? `A .${ext} file` : "This file";
  return why
    ? `${name} could not be turned into a PDF (${why}), so it was downloaded as it is.`
    : `${what} cannot be turned into a PDF, so ${name} was downloaded as it is.`;
}
