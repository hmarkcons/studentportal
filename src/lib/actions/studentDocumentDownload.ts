"use server";

import { getStudentUser } from "@/lib/auth/session";
import { documentUrls } from "@/lib/storageUrls";
import { extensionOf } from "@/lib/documentZip";
import type { DocumentDownloadLink } from "@/lib/actions/documentDownload";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Fresh links to the signed-in student's OWN document files, for the
 * per-section "Download as PDF" on their portal. The staff version
 * (documentDownloadLinks) is gated to the processing team and takes a
 * studentId; this one takes no id — it reads the caller's own record from the
 * session, and the tables' + bucket's RLS keep it to their own files, exactly
 * as the checklist's "View file" already does. Links are minted at click time,
 * not taken from the page, so a file replaced since it loaded is the one saved.
 */
export async function studentDocumentDownloadLinks(
  documentIds: string[]
): Promise<{ files: DocumentDownloadLink[] } | { error: string }> {
  const { supabase, userId } = await getStudentUser();
  if (!userId) return { error: "You are signed out — reload the page." };
  const { data: student } = await supabase.from("students").select("id").eq("auth_user_id", userId).maybeSingle();
  if (!student) return { error: "We couldn't find your record — reload the page." };
  const studentId = student.id as string;

  const wanted = new Set(documentIds.filter((id) => UUID.test(id)));
  if (wanted.size === 0) return { files: [] };

  // Each requirement's files one by one (0328), oldest first; plus one written
  // the old way, a path on the requirement with no file of its own.
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
