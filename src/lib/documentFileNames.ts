// What a stored file is called on screen — the name it was uploaded with —
// and, for a student's requirement, each of its files (0328).
//
// Pure, so the unit tests import it directly (scripts/document-file-names-test.mjs).

export type UploaderRole = "staff" | "student" | "partner";

/** One file of a requirement, as the pages show it. */
export type DocFile = {
  /** Null for a file on record from before files were kept one by one, not yet given its own row. */
  id: string | null;
  name: string;
  /** The files it was joined from, when several were chosen at once. */
  sources: string[] | null;
  path: string;
  status: string;
  reason: string | null;
  uploadedAt: string | null;
  uploadedByRole: UploaderRole | null;
  verifiedAt: string | null;
  url?: string | null;
};

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * The name a file was uploaded with, read from where it is stored: the folder
 * and what the portal put in front of it — an id, a version, a time — taken
 * off. "…/1f…e9-v2-Passport_scan.pdf" is "Passport_scan.pdf". (Characters a
 * file name may not keep in storage are underscores there.)
 */
export function storedFileName(path: string | null | undefined): string {
  const name = ((path ?? "").split("/").pop() ?? "")
    .replace(new RegExp(`^${UUID}-`, "i"), "")
    .replace(/^(offer_letter|rejection_letter)-/i, "")
    .replace(/^(proof|exchange)-/i, "")
    .replace(/^v\d+-/i, "")
    .replace(/^\d{10,}-/, "");
  return name || "file";
}

/** "passport.pdf — joined from 3 files: front.jpg, back.jpg, visa.pdf", or just the name. */
export function fileDisplayName(name: string, sources?: readonly string[] | null): string {
  if (!sources || sources.length < 2) return name;
  return `${name} — joined from ${sources.length} files: ${sources.join(", ")}`;
}

/**
 * The files of a requirement: its own, and — for one written the old way, a
 * single path on the requirement with no file of its own — that one, so it
 * is never left unshown.
 */
export function filesOfDocument(
  doc: { file_path: string | null; status: string; rejected_reason?: string | null; uploaded_at?: string | null; uploaded_by_role?: string | null; verified_at?: string | null },
  own: readonly DocFile[]
): DocFile[] {
  if (!doc.file_path || own.some((f) => f.path === doc.file_path)) return [...own];
  return [
    ...own,
    {
      id: null,
      name: storedFileName(doc.file_path),
      sources: null,
      path: doc.file_path,
      status: doc.status === "missing" ? "submitted" : doc.status,
      reason: doc.status === "rejected" ? (doc.rejected_reason ?? null) : null,
      uploadedAt: doc.uploaded_at ?? null,
      uploadedByRole: (doc.uploaded_by_role as UploaderRole | null) ?? null,
      verifiedAt: doc.verified_at ?? null,
    },
  ];
}

/**
 * Where a newly uploaded file goes: the student's folder, the requirement's,
 * and one of its own — so no upload overwrites another, and the stored name is
 * the uploaded name with nothing in front of it.
 */
export function documentFilePath(studentId: string, documentId: string, safeName: string, tag: string): string {
  return `${studentId}/documents/${documentId}/${tag}/${safeName}`;
}

/** The joined files' names posted beside an upload (FileField's "<name>_sources"), read safely. */
export function parseSourceNames(raw: unknown): string[] | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return null;
    const names = list.filter((n): n is string => typeof n === "string" && n.trim() !== "").map((n) => n.trim().slice(0, 255)).slice(0, 50);
    return names.length > 1 ? names : null;
  } catch {
    return null;
  }
}
