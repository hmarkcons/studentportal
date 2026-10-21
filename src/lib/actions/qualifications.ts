"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { QUALIFICATION_TYPES } from "@/lib/qualifications";

// A refused UPDATE/DELETE matches no rows and raises nothing (AGENTS.md); say so.
const QUALIFICATION_REFUSED = "That wasn't saved — this qualification may not be yours to change, or it no longer exists.";

export async function upsertStudentQualification(
  studentId: string,
  revalidateTo: string,
  _prevState: unknown,
  formData: FormData
) {
  const supabase = await createClient();

  const qualification_type = String(formData.get("qualification_type") ?? "");
  if (!(QUALIFICATION_TYPES as readonly string[]).includes(qualification_type)) {
    return { error: "Choose a valid qualification type." };
  }

  const fields = {
    qualification_name: String(formData.get("qualification_name") ?? "").trim() || null,
    institution_name: String(formData.get("institution_name") ?? "").trim() || null,
    city: String(formData.get("city") ?? "").trim() || null,
    country: String(formData.get("country") ?? "").trim() || null,
    address: String(formData.get("address") ?? "").trim() || null,
    grade_percentage: String(formData.get("grade_percentage") ?? "").trim() || null,
  };

  // Keyed by row id rather than upserted on (student, type): a student can
  // now hold several qualifications of the same type, so the type no longer
  // identifies a row. An id means "edit this one", no id means "add another".
  const qualificationId = String(formData.get("qualification_id") ?? "");

  if (qualificationId) {
    const { data, error } = await supabase
      .from("student_qualifications")
      .update({ qualification_type, ...fields })
      .eq("id", qualificationId)
      .select("id");
    if (error) return { error: error.message };
    // An RLS-refused update matches no rows and raises nothing.
    if (!data?.length) return { error: QUALIFICATION_REFUSED };
  } else {
    const { error } = await supabase
      .from("student_qualifications")
      .insert({ student_id: studentId, qualification_type, ...fields });
    if (error) return { error: error.message };
  }

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function deleteStudentQualification(qualificationId: string, revalidateTo: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("student_qualifications").delete().eq("id", qualificationId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: QUALIFICATION_REFUSED };

  revalidatePath(revalidateTo);
  return { success: true };
}
