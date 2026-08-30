"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { QUALIFICATION_TYPES } from "@/lib/qualifications";

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

  const qualification_name = String(formData.get("qualification_name") ?? "").trim() || null;
  const institution_name = String(formData.get("institution_name") ?? "").trim() || null;
  const city = String(formData.get("city") ?? "").trim() || null;
  const country = String(formData.get("country") ?? "").trim() || null;
  const address = String(formData.get("address") ?? "").trim() || null;
  const grade_percentage = String(formData.get("grade_percentage") ?? "").trim() || null;

  const { error } = await supabase
    .from("student_qualifications")
    .upsert(
      { student_id: studentId, qualification_type, qualification_name, institution_name, city, country, address, grade_percentage },
      { onConflict: "student_id,qualification_type" }
    );
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function deleteStudentQualification(qualificationId: string, revalidateTo: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("student_qualifications").delete().eq("id", qualificationId);
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}
