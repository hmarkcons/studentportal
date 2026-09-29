"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import { isScholarshipDocumentStatus, isScholarshipStatus } from "@/lib/scholarships";

const DENIED = "Only staff who manage scholarships can change this.";

/**
 * Sets one field of a student's scholarship from the Scholarship tab's
 * dropdowns, which save as they change.
 *
 * Asked for the row back: an update RLS refuses (0012 lets processing and
 * Super Admin write) matches nothing and reads as success, and a dropdown
 * that says Saved over a change that never happened is worse than an error.
 */
async function setField(scholarshipId: string, studentId: string, patch: Record<string, string | null>) {
  const denied = await requirePermission("scholarships.manage", DENIED);
  if (denied) return { error: denied.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("student_scholarships")
    .update(patch)
    .eq("id", scholarshipId)
    .eq("student_id", studentId)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "It wasn't saved — your role may not be allowed to change this student's scholarships." };

  revalidatePath(`/students/${studentId}/scholarship`);
  return { success: true as const };
}

/** The application's status: Submitted, Pending, Accepted, Modification requested or Rejected. */
export async function setScholarshipStatus(scholarshipId: string, studentId: string, status: string) {
  if (!isScholarshipStatus(status)) return { error: "Choose a status from the list." };
  return setField(scholarshipId, studentId, { status });
}

/** Where its documents stand (0297); empty clears it back to not chosen. */
export async function setScholarshipDocumentsStatus(scholarshipId: string, studentId: string, value: string | null) {
  const next = value ? value : null;
  if (next !== null && !isScholarshipDocumentStatus(next)) return { error: "Choose a documents status from the list." };
  return setField(scholarshipId, studentId, { documents_status: next });
}
