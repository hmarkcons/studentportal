"use server";

import { getStaffSession } from "@/lib/auth/session";
import { seesStagesOnly } from "@/lib/auth/studentAccess";
import { documentUrls } from "@/lib/storageUrls";
import { extensionOf } from "@/lib/documentZip";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One file: its requirement's id (a requirement may have several), and a link to it. */
export type DocumentDownloadLink = { id: string; url: string; ext: string };

/**
 * Fresh links to a student's document files, for "Download all" on the
 * Documents tab, which builds the ZIP in the browser.
 *
 * Asked for when the button is pressed rather than taken from the page, whose
 * links last an hour and may be older than that by then — and so a file
 * replaced since the page was opened is the one downloaded. Read through the
 * viewer's own session, so the table's and the bucket's RLS decide what may be
 * read, exactly as for "View file"; and refused, like the tab itself, to a
 * counsellor with no processing role (ProcessingTabGuard).
 */
export async function documentDownloadLinks(
  studentId: string,
  documentIds: string[]
): Promise<{ files: DocumentDownloadLink[] } | { error: string }> {
  const { supabase, staff } = await getStaffSession();
  if (!staff || staff.status !== "active") return { error: "You are signed out — reload the page." };
  if (seesStagesOnly(staff)) return { error: "A registered student's documents are the processing team's to download." };
  const wanted = new Set(documentIds.filter((id) => UUID.test(id)));
  if (!UUID.test(studentId) || wanted.size === 0) return { files: [] };

  // Every file of this student's, kept to the ones asked for here: a student
  // has tens of documents, and a hundred ids in the address would not fit.
  // Each requirement's files one by one (0328), oldest first; one written the
  // old way, a path on the requirement with no file of its own, as that path.
  const [{ data: docs, error }, { data: fileRows }] = await Promise.all([
    supabase.from("student_documents").select("id, file_path").eq("student_id", studentId).not("file_path", "is", null),
    supabase.from("student_document_files").select("document_id, file_path").eq("student_id", studentId).order("uploaded_at").order("created_at"),
  ]);
  if (error) return { error: error.message };
  const own = (fileRows ?? []).filter((f) => wanted.has(f.document_id as string));
  const withFiles = new Set(own.map((f) => f.document_id as string));
  const rows = [
    ...own.map((f) => ({ id: f.document_id as string, path: f.file_path as string })),
    ...(docs ?? []).filter((d) => wanted.has(d.id as string) && !withFiles.has(d.id as string)).map((d) => ({ id: d.id as string, path: d.file_path as string })),
  ];

  const urls = await documentUrls(supabase, rows.map((r) => r.path));
  return {
    files: rows.flatMap((r) => {
      const url = urls.get(r.path);
      return url ? [{ id: r.id, url, ext: extensionOf(r.path) }] : [];
    }),
  };
}
