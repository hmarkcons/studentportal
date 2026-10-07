"use server";

import { removeStorageFiles } from "@/lib/fileTrash";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getStaffSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { sanitizeFilename, validateDocumentFile } from "@/lib/documentUpload";
import { uploadedFile } from "@/lib/stagedUpload";
import { resolveScholarship, type ScholarshipRef } from "@/lib/scholarshipRecord";

export type ScholarshipProof = {
  id: string;
  fileName: string;
  fileSize: number | null;
  uploadedAt: string;
  url: string | null;
};

/**
 * The evidence on file for each of a student's scholarship applications.
 *
 * Signed here rather than in the component: the list renders on the client and
 * a client cannot sign a storage URL.
 */
export async function listScholarshipProofs(scholarshipIds: string[]): Promise<Record<string, ScholarshipProof[]>> {
  if (scholarshipIds.length === 0) return {};
  const supabase = await createClient();

  const { data } = await supabase
    .from("scholarship_proofs")
    .select("id, scholarship_id, file_path, file_name, file_size, uploaded_at")
    .in("scholarship_id", scholarshipIds)
    .order("uploaded_at", { ascending: false });

  const byScholarship: Record<string, ScholarshipProof[]> = {};
  await Promise.all(
    (data ?? []).map(async (row) => {
      const { data: signed } = await supabase.storage.from("documents").createSignedUrl(row.file_path, 3600);
      const list = byScholarship[row.scholarship_id] ?? [];
      list.push({
        id: row.id,
        fileName: row.file_name,
        fileSize: row.file_size,
        uploadedAt: row.uploaded_at,
        url: signed?.signedUrl ?? null,
      });
      byScholarship[row.scholarship_id] = list;
    })
  );

  // Promise.all resolves out of order, so re-sort rather than trusting it.
  for (const id of Object.keys(byScholarship)) {
    byScholarship[id].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  }
  return byScholarship;
}

/** How many files one call may carry — the uploader sends more in batches. */
const MAX_PROOFS_AT_ONCE = 8;

/**
 * Attaches proof that a scholarship application was submitted — several files
 * at once, since an agency hands over several: the receipt, the protocol
 * number, the ISEE acknowledgement.
 *
 * The files come as staged references under file, file_1, file_2 … (each went
 * from the browser straight into storage as it was chosen), and each is
 * checked and filed on its own. A file that is refused does not take the
 * others with it, and the answer says exactly which went through.
 *
 * `ref` may be a scholarship not on record yet — a finalised university's body
 * whose panel nobody has touched — and the first file that passes records it
 * (resolveScholarship). A batch in which every file is refused records
 * nothing.
 */
export async function uploadScholarshipProof(ref: ScholarshipRef, studentId: string, formData: FormData) {
  const denied = await requirePermission(
    "scholarships.manage",
    "Only staff who manage scholarships can attach proof of an application."
  );
  if (denied) return { error: denied.error };

  const { supabase, staff } = await getStaffSession();
  if (!staff) return { error: "You are signed out — reload the page." };

  const names = ["file", ...Array.from({ length: MAX_PROOFS_AT_ONCE - 1 }, (_, i) => `file_${i + 1}`)];
  const files: File[] = [];
  /** Each file turned away, and why — the uploader marks those, not the batch. */
  const refused: { name: string; reason: string }[] = [];
  for (const name of names) {
    const file = await uploadedFile(formData, name);
    if (!file || file.size === 0) continue;
    // The same 5 MB and the same accepted types as every other upload.
    const invalid = validateDocumentFile(file, "file");
    if (invalid) refused.push({ name: file.name, reason: invalid });
    else files.push(file);
  }
  if (files.length === 0 && refused.length === 0) return { error: "Choose a file to attach." };

  let scholarshipId: string | null = "id" in ref ? ref.id : null;
  if (files.length > 0) {
    const resolved = await resolveScholarship(supabase, ref, studentId);
    if ("error" in resolved) return { error: resolved.error };
    scholarshipId = resolved.id;
  }

  let attached = 0;
  for (const file of files) {
    // Namespaced by student and scholarship, and stamped, so re-uploading a
    // file with the same name does not overwrite the earlier one — both are
    // evidence.
    const safe = sanitizeFilename(file.name);
    const path = `${studentId}/scholarship-proofs/${scholarshipId}-${Date.now()}-${attached}-${safe}`;
    const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { upsert: false });
    if (uploadError) {
      refused.push({ name: file.name, reason: uploadError.message });
      continue;
    }
    const { error } = await supabase.from("scholarship_proofs").insert({
      scholarship_id: scholarshipId,
      file_path: path,
      file_name: file.name,
      file_size: file.size,
      uploaded_by: staff.id,
    });
    if (error) {
      // Do not leave a file in the bucket with no row pointing at it.
      await supabase.storage.from("documents").remove([path]);
      refused.push({ name: file.name, reason: error.message });
      continue;
    }
    attached += 1;
  }

  if (scholarshipId) revalidatePath(`/students/${studentId}/scholarship`);
  if (refused.length > 0) {
    return {
      error: `${attached > 0 ? `${attached} attached; ` : ""}${refused.length === 1 ? "this one wasn't" : "these weren't"} — ${refused.map((r) => `${r.name}: ${r.reason}`).join(" · ")}`,
      attached,
      refused,
      scholarshipId,
    };
  }
  return { success: true as const, attached, scholarshipId };
}

/** Removes one proof file, and the object behind it. */
export async function deleteScholarshipProof(proofId: string, studentId: string) {
  const denied = await requirePermission(
    "scholarships.manage",
    "Only staff who manage scholarships can remove proof of an application."
  );
  if (denied) return { error: denied.error };

  const supabase = await createClient();
  const { data: proof } = await supabase
    .from("scholarship_proofs")
    .select("id, file_path")
    .eq("id", proofId)
    .maybeSingle();
  if (!proof) return { error: "That file is already gone." };

  // Asked for back: a delete RLS refuses removes nothing and raises nothing.
  const { data: removed, error } = await supabase.from("scholarship_proofs").delete().eq("id", proofId).select("id");
  if (error) return { error: error.message };
  if (!removed?.length) return { error: "It wasn't removed — your role may not be allowed to change this student's scholarships." };

  // The row is the record, so it goes first; a storage object left behind is
  // untidy, a row pointing at a deleted object is broken.
  await removeStorageFiles(supabase, "documents", [proof.file_path]);

  revalidatePath(`/students/${studentId}/scholarship`);
  return { success: true };
}
