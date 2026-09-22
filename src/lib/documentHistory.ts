// Earlier versions of a document requirement, with links that open them.
//
// A replacement archives what it replaced (0165) rather than overwriting it.
// Keeping the file is only half of that: staff sent it back for a reason, and
// the thing they saw has to be reachable, so this resolves the stored paths
// into signed URLs the way the current document's own link is resolved.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ArchivedUpload } from "@/components/DocumentHistory";
import { documentUrls } from "@/lib/storageUrls";

export async function loadDocumentHistory(
  supabase: SupabaseClient,
  documentIds: string[]
): Promise<Map<string, ArchivedUpload[]>> {
  const byDocument = new Map<string, ArchivedUpload[]>();
  if (documentIds.length === 0) return byDocument;

  const { data } = await supabase
    .from("student_document_archive")
    .select("id, document_id, file_path, version, uploaded_at, uploaded_by_role, previous_status, rejected_reason")
    .in("document_id", documentIds)
    // Newest first: the version most recently sent back is the one anybody
    // asking about it means.
    .order("archived_at", { ascending: false });

  // One request for every archived version's link. This signed them one at a
  // time, and it runs for EVERY document on a page — a student with twenty
  // documents that had each been sent back twice was forty round trips, on
  // top of the twenty for the current files.
  const urls = await documentUrls(supabase, (data ?? []).map((row) => row.file_path));

  for (const row of data ?? []) {
    const entry: ArchivedUpload = {
      id: row.id,
      version: row.version,
      uploadedAt: row.uploaded_at,
      uploadedByRole: row.uploaded_by_role,
      previousStatus: row.previous_status,
      rejectedReason: row.rejected_reason,
      fileUrl: urls.get(row.file_path) ?? null,
    };
    const list = byDocument.get(row.document_id) ?? [];
    list.push(entry);
    byDocument.set(row.document_id, list);
  }

  // By version rather than by the archived_at the query ordered on: the two
  // agree in practice, and this is the order the reader means.
  for (const list of byDocument.values()) {
    list.sort((a, b) => b.version - a.version);
  }

  return byDocument;
}
