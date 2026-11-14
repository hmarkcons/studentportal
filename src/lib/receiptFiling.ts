import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeFilename } from "@/lib/documentUpload";
import { ensureCurrentCycle } from "@/lib/ensureCycle";
import { FEE_RECEIPT_CATEGORY, FEE_RECEIPT_NAME, feeReceiptPath } from "@/lib/applicationFeeReceipts";

type Client = Awaited<ReturnType<typeof createClient>>;

/** One file to file: the file, the name it is kept under, and what it was joined from. */
export type ReceiptFile = { file: File; name: string; sources?: string[] | null };

/**
 * Files receipts on an application (0365): into its one receipts requirement
 * in Receipts - Universities, found or made, approved as filed, each file its
 * own. Shared by the receipts card and the "Documents from the university"
 * box, so a receipt is filed the same way whichever it came in through. The
 * caller holds the permission line; this answers in its words.
 */
export async function fileReceipts(
  supabase: Client,
  app: { id: string; studentId: string; cycleId: string | null; visible: boolean },
  files: ReceiptFile[],
  denied: string
): Promise<{ added: number } | { error: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("student_documents")
    .select("id")
    .eq("application_id", app.id)
    .eq("category", FEE_RECEIPT_CATEGORY)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  let documentId = existing?.id as string | undefined;
  let made = false;
  if (!documentId) {
    const cycleId = app.cycleId ?? (await ensureCurrentCycle(app.studentId))?.id ?? null;
    const { data: row, error } = await supabase
      .from("student_documents")
      .insert({
        student_id: app.studentId,
        application_id: app.id,
        category: FEE_RECEIPT_CATEGORY,
        custom_name: FEE_RECEIPT_NAME,
        status: "verified",
        uploaded_by_role: "staff",
        uploaded_at: now,
        verified_by: user?.id ?? null,
        verified_at: now,
        cycle_id: cycleId,
      })
      .select("id")
      .single();
    if (error || !row) return { error: error?.message.includes("row-level security") ? denied : (error?.message ?? "The receipt could not be filed.") };
    documentId = row.id as string;
    made = true;
  }

  let added = 0;
  for (const { file, name, sources = null } of files) {
    const path = feeReceiptPath(app.studentId, app.id, sanitizeFilename(file.name), crypto.randomUUID().slice(0, 8));
    const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (uploadError) {
      if (made && added === 0) await supabase.from("student_documents").delete().eq("id", documentId);
      return { error: added ? `${added} receipt${added === 1 ? "" : "s"} uploaded, then ${name} failed: ${uploadError.message}` : uploadError.message };
    }
    const { error: fileError } = await supabase.rpc("add_student_document_file", {
      p_document_id: documentId,
      p_path: path,
      p_name: name,
      p_sources: sources,
      p_role: "staff",
      p_status: "verified",
    });
    if (fileError) {
      // Only a file just put there, never recorded, is removed outright.
      await supabase.storage.from("documents").remove([path]);
      if (made && added === 0) await supabase.from("student_documents").delete().eq("id", documentId);
      return { error: fileError.message === "not authorized" ? denied : fileError.message };
    }
    added += 1;
  }

  // Shown to the student already: they hear that another has arrived.
  if (app.visible) await createAdminClient().rpc("notify_fee_receipts", { p_application: app.id });
  return { added };
}
