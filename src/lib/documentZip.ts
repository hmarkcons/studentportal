// What a student's documents are called inside "Download all": a folder for
// each checklist section, numbered as the page numbers them, and each file
// named after its checklist item — "CV - Resume.pdf", whatever the student
// called the file they uploaded. Pure — scripts/document-zip-test.mjs.

/** Picture types turned into a one-page PDF on the way into the ZIP. */
export const PICTURE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];

/** Longest name kept for a folder or a file, before its extension. */
const NAME_MAX = 120;

/** Names Windows will not create a file under, whatever the extension. */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * A checklist name made safe for a file or folder on Windows, macOS and in
 * every unzip tool: "/" and "\" become " - " ("CV / Resume" → "CV - Resume"),
 * the characters Windows refuses are dropped, dashes of every width become a
 * hyphen, and a name may not end in a dot or a space.
 */
export function safeName(raw: string | null | undefined, fallback = "Document"): string {
  let s = (raw ?? "")
    .normalize("NFC")
    .replace(/\s*[/\\]\s*/g, " - ")
    .replace(/[‒-―−]/g, "-")
    .replace(/[<>:"|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length > NAME_MAX) s = s.slice(0, NAME_MAX).trim();
  s = s.replace(/[. ]+$/, "");
  if (!s) return fallback;
  return RESERVED.test(s) ? `${s}_` : s;
}

/** A stored file's extension, lower-case and without the dot; "" when it has none. */
export function extensionOf(path: string | null | undefined): string {
  const name = (path ?? "").split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "";
  const ext = name.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : "";
}

/** The extension for a file whose stored name has none, from what the server says it is. */
export function extensionForType(contentType: string | null | undefined): string {
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  const known: Record<string, string> = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  };
  return known[type] ?? "";
}

export type ZipEntry = {
  /** The section's place on the page, from 1. */
  sectionNumber: number;
  sectionLabel: string;
  /** The checklist item's name. */
  name: string;
  /** The extension the file is saved with, without the dot. */
  ext: string;
};

/**
 * The path of each entry inside the ZIP, in the order given:
 * "1. Admission/CV - Resume.pdf". Numbered folders keep the page's order in
 * any file browser. Two items of the same name in one section — two
 * "Transcript" rows — are told apart as "Transcript (2)".
 */
export function zipPaths(entries: ZipEntry[]): string[] {
  const taken = new Set<string>();
  return entries.map((e) => {
    const folder = `${e.sectionNumber}. ${safeName(e.sectionLabel, "Other documents")}`;
    const base = safeName(e.name);
    const dot = e.ext ? `.${e.ext}` : "";
    let path = `${folder}/${base}${dot}`;
    for (let n = 2; taken.has(path.toLowerCase()); n++) path = `${folder}/${base} (${n})${dot}`;
    taken.add(path.toLowerCase());
    return path;
  });
}

/** The ZIP's own name: "Ali Khan - HMC-2026-IT-0012 - Documents.zip", with the intake when the student has had more than one. */
export function zipFileName(studentName: string, studentCode: string | null, intake: string | null): string {
  const parts = [safeName(studentName, "Student"), studentCode ? safeName(studentCode) : null, "Documents", intake ? safeName(intake) : null];
  return `${parts.filter(Boolean).join(" - ")}.zip`;
}
