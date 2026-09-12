// Earlier versions of a document requirement, with links that open them.
//
// A replacement archives what it replaced (0165) rather than overwriting it.
// Keeping the file is only half of that: staff sent it back for a reason, and
// the thing they saw has to be reachable, so this resolves the stored paths
// into signed URLs the way the current document's own link is resolved.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ArchivedUpload } from "@/components/DocumentHistory";

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

  await Promise.all(
    (data ?? []).map(async (row) => {
      const { data: signed } = await supabase.storage.from("documents").createSignedUrl(row.file_path, 3600);
      const entry: ArchivedUpload = {
        id: row.id,
        version: row.version,
        uploadedAt: row.uploaded_at,
        uploadedByRole: row.uploaded_by_role,
        previousStatus: row.previous_status,
        rejectedReason: row.rejected_reason,
        fileUrl: signed?.signedUrl ?? null,
      };
      const list = byDocument.get(row.document_id) ?? [];
      list.push(entry);
      byDocument.set(row.document_id, list);
    })
  );

  // Promise.all resolves out of order, so the newest-first ordering above is
  // restored here rather than assumed.
  for (const list of byDocument.values()) {
    list.sort((a, b) => b.version - a.version);
  }

  return byDocument;
}
