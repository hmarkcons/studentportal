import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { documentUrls } from "@/lib/storageUrls";
import { filesOfDocument, type DocFile, type UploaderRole } from "@/lib/documentFileNames";

type DocLike = {
  id: string;
  file_path: string | null;
  status: string;
  rejected_reason?: string | null;
  uploaded_at?: string | null;
  uploaded_by_role?: string | null;
  verified_at?: string | null;
};

type FileRow = {
  id: string;
  document_id: string;
  file_path: string;
  file_name: string;
  source_names: string[] | null;
  status: string;
  rejected_reason: string | null;
  uploaded_by_role: string | null;
  uploaded_at: string | null;
  verified_at: string | null;
};

/**
 * Each requirement's files (0328), oldest first, each with a link to open it —
 * read through the viewer's own session, so they see the files of whatever
 * requirements they may see. A requirement written the old way, one path on
 * the requirement itself, still shows that file.
 */
export async function loadDocumentFiles(supabase: SupabaseClient, docs: readonly DocLike[]): Promise<Map<string, DocFile[]>> {
  const ids = docs.map((d) => d.id);
  const rows: FileRow[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase
      .from("student_document_files")
      .select("id, document_id, file_path, file_name, source_names, status, rejected_reason, uploaded_by_role, uploaded_at, verified_at")
      .in("document_id", ids.slice(i, i + 200))
      .order("uploaded_at")
      .order("created_at");
    rows.push(...((data ?? []) as FileRow[]));
  }
  const byDoc = new Map<string, DocFile[]>();
  for (const r of rows) {
    const list = byDoc.get(r.document_id) ?? [];
    list.push({
      id: r.id,
      name: r.file_name,
      sources: r.source_names && r.source_names.length > 1 ? r.source_names : null,
      path: r.file_path,
      status: r.status,
      reason: r.rejected_reason,
      uploadedAt: r.uploaded_at,
      uploadedByRole: (r.uploaded_by_role as UploaderRole | null) ?? null,
      verifiedAt: r.verified_at,
    });
    byDoc.set(r.document_id, list);
  }
  const out = new Map<string, DocFile[]>();
  for (const d of docs) out.set(d.id, filesOfDocument(d, byDoc.get(d.id) ?? []));
  const urls = await documentUrls(supabase, [...out.values()].flat().map((f) => f.path));
  for (const list of out.values()) for (const f of list) f.url = urls.get(f.path) ?? null;
  return out;
}
