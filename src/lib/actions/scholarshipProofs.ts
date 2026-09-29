"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getStaffSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { sanitizeFilename, validateDocumentFile } from "@/lib/documentUpload";
import { uploadedFile } from "@/lib/stagedUpload";

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

/**
 * Attaches one proof file to a scholarship application.
 *
 * Several files in one submit — file, file_1, file_2 … as the form adds
 * fields — each staged, checked and filed one at a time. A file that is
 * refused does not take the others with it, and the answer says exactly
 * which went through: "2 attached; report.pdf wasn't: …" leaves nobody
 * wondering what is on record.
 */
/** How many files one submit may carry. */
const MAX_PROOFS_AT_ONCE = 8;

export async function uploadScholarshipProof(
  scholarshipId: string,
  studentId: string,
  _prevState: unknown,
  formData: FormData
) {
  const denied = await requirePermission(
    "scholarships.manage",
    "Only staff who manage scholarships can attach proof of an application."
  );
  if (denied) return { error: denied.error };

  const { supabase, staff } = await getStaffSession();
  if (!staff) return { error: "You are signed out — reload the page." };

  const names = ["file", ...Array.from({ length: MAX_PROOFS_AT_ONCE - 1 }, (_, i) => `file_${i + 1}`)];
  let attached = 0;
  const refused: string[] = [];
  for (const name of names) {
    const file = await uploadedFile(formData, name);
    if (!file || file.size === 0) continue;
    // The same 5 MB and the same accepted types as every other upload.
    const invalid = validateDocumentFile(file, "file");
    if (invalid) {
      refused.push(`${file.name}: ${invalid}`);
      continue;
    }
    // Namespaced by student and scholarship, and stamped, so re-uploading a
    // file with the same name does not overwrite the earlier one — both are
    // evidence.
    const safe = sanitizeFilename(file.name);
    const path = `${studentId}/scholarship-proofs/${scholarshipId}-${Date.now()}-${attached}-${safe}`;
    const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { upsert: false });
    if (uploadError) {
      refused.push(`${file.name}: ${uploadError.message}`);
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
      refused.push(`${file.name}: ${error.message}`);
      continue;
    }
    attached += 1;
  }

  if (attached > 0) revalidatePath(`/students/${studentId}/scholarship`);
  if (attached === 0 && refused.length === 0) return { error: "Choose a file to attach." };
  if (refused.length > 0) {
    return { error: `${attached > 0 ? `${attached} attached; ` : ""}${refused.length === 1 ? "this one wasn't" : "these weren't"} — ${refused.join(" · ")}` };
  }
  return { success: true, attached };
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

  const { error } = await supabase.from("scholarship_proofs").delete().eq("id", proofId);
  if (error) return { error: error.message };

  // The row is the record, so it goes first; a storage object left behind is
  // untidy, a row pointing at a deleted object is broken.
  await supabase.storage.from("documents").remove([proof.file_path]);

  revalidatePath(`/students/${studentId}/scholarship`);
  return { success: true };
}
