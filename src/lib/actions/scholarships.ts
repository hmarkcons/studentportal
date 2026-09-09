"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import { isScholarshipStatus, scholarshipIdentityError, SCHOLARSHIP_STATUSES } from "@/lib/scholarships";

// Everything here needs scholarships.manage, which now defaults to Super Admin
// and Processing — matching what the directory page has always claimed.
//
// Three of these had no check at all: creating a scholarship body (so any
// active staff member could add a row to the directory that only Super Admin
// could then remove), adding a scholarship to a student, and ticking
// pre-enrolment finalised. Editing and deleting were gated from the start,
// which is what made the gap easy to miss.
const DENIED = "Only Super Admin and the Processing team can manage scholarships.";

async function gate() {
  const denied = await requirePermission("scholarships.manage", DENIED);
  return denied ? denied.error : null;
}

function readBodyFields(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    region: String(formData.get("region") ?? "").trim() || null,
    academic_year: String(formData.get("academic_year") ?? "").trim(),
    covers: String(formData.get("covers") ?? "")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean),
    stipend_amount: String(formData.get("stipend_amount") ?? "").trim() || null,
  };
}

export async function createScholarshipBody(_prevState: unknown, formData: FormData) {
  const error = await gate();
  if (error) return { error };
  const supabase = await createClient();

  const fields = readBodyFields(formData);
  if (!fields.name || !fields.academic_year) return { error: "Name and academic year are required." };

  const { error: insertError } = await supabase.from("scholarship_bodies").insert(fields);
  if (insertError) return { error: insertError.message };

  revalidatePath("/setup/scholarship-bodies");
  return { success: true };
}

export async function updateScholarshipBody(bodyId: string, _prevState: unknown, formData: FormData) {
  const error = await gate();
  if (error) return { error };
  const supabase = await createClient();

  const fields = readBodyFields(formData);
  if (!fields.name || !fields.academic_year) return { error: "Name and academic year are required." };

  const { error: updateError } = await supabase.from("scholarship_bodies").update(fields).eq("id", bodyId);
  if (updateError) return { error: updateError.message };

  revalidatePath("/setup/scholarship-bodies");
  return { success: true };
}

export async function deleteScholarshipBody(bodyId: string) {
  const error = await gate();
  if (error) return { error };
  const supabase = await createClient();

  // A body a student is already recorded against cannot just vanish: the
  // student_scholarships row would keep an id pointing at nothing and the
  // record would lose the only thing naming it.
  const { count } = await supabase
    .from("student_scholarships")
    .select("id", { count: "exact", head: true })
    .eq("scholarship_body_id", bodyId);
  if ((count ?? 0) > 0) {
    return {
      error: `${count} student scholarship record(s) name this body. Remove or repoint those first.`,
    };
  }

  const { error: deleteError } = await supabase.from("scholarship_bodies").delete().eq("id", bodyId);
  if (deleteError) return { error: deleteError.message };

  revalidatePath("/setup/scholarship-bodies");
  return { success: true };
}

function readScholarshipFields(formData: FormData) {
  const status = String(formData.get("status") ?? "submitted");
  return {
    scholarship_body_id: String(formData.get("scholarship_body_id") ?? "") || null,
    name: String(formData.get("name") ?? "").trim() || null,
    award_amount: formData.get("award_amount") ? Number(formData.get("award_amount")) : null,
    application_deadline: String(formData.get("application_deadline") ?? "").trim() || null,
    status,
  };
}

function validateScholarship(fields: ReturnType<typeof readScholarshipFields>) {
  // Checked here rather than left to the CHECK constraint, which surfaces as a
  // database error nobody can act on.
  if (!isScholarshipStatus(fields.status)) {
    return `Choose one of: ${SCHOLARSHIP_STATUSES.join(", ")}.`;
  }
  const identity = scholarshipIdentityError(fields.name, fields.scholarship_body_id);
  if (identity) return identity;
  if (fields.award_amount !== null && (!Number.isFinite(fields.award_amount) || fields.award_amount < 0)) {
    return "The award amount cannot be negative.";
  }
  return null;
}

export async function addStudentScholarship(
  studentId: string,
  applicationId: string,
  revalidateTo: string,
  _prevState: unknown,
  formData: FormData
) {
  const error = await gate();
  if (error) return { error };
  const supabase = await createClient();

  const fields = readScholarshipFields(formData);
  const invalid = validateScholarship(fields);
  if (invalid) return { error: invalid };

  const { error: insertError } = await supabase
    .from("student_scholarships")
    .insert({ student_id: studentId, application_id: applicationId, ...fields });
  if (insertError) return { error: insertError.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function updateStudentScholarship(
  scholarshipId: string,
  revalidateTo: string,
  _prevState: unknown,
  formData: FormData
) {
  const error = await gate();
  if (error) return { error };
  const supabase = await createClient();

  const fields = readScholarshipFields(formData);
  const invalid = validateScholarship(fields);
  if (invalid) return { error: invalid };

  // The body and the deadline are written too. This used to update only the
  // name, amount and status, so a scholarship recorded against the wrong
  // regional body could never be corrected — the dropdown was offered when
  // adding and then had no effect for the rest of the record's life.
  const { error: updateError } = await supabase.from("student_scholarships").update(fields).eq("id", scholarshipId);
  if (updateError) return { error: updateError.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function deleteStudentScholarship(scholarshipId: string, revalidateTo: string) {
  const error = await gate();
  if (error) return { error };
  const supabase = await createClient();

  const { error: deleteError } = await supabase.from("student_scholarships").delete().eq("id", scholarshipId);
  if (deleteError) return { error: deleteError.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function markPreenrollmentFinalized(applicationId: string, revalidateTo: string, finalized: boolean) {
  const error = await gate();
  if (error) return { error };
  const supabase = await createClient();

  const { error: updateError } = await supabase
    .from("applications")
    .update({ preenrollment_finalized: finalized })
    .eq("id", applicationId);
  if (updateError) return { error: updateError.message };

  revalidatePath(revalidateTo);
  return { success: true };
}
