"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateStudentProfile(studentId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const passport_number = String(formData.get("passport_number") ?? "").trim() || null;
  const passport_expiry = String(formData.get("passport_expiry") ?? "") || null;
  const cnic = String(formData.get("cnic") ?? "").trim() || null;
  const financial_sponsor_name = String(formData.get("financial_sponsor_name") ?? "").trim() || null;
  const financial_sponsor_relation = String(formData.get("financial_sponsor_relation") ?? "").trim() || null;

  const { error } = await supabase.from("student_profiles").upsert(
    {
      student_id: studentId,
      passport_number,
      passport_expiry,
      cnic,
      financial_sponsor_name,
      financial_sponsor_relation,
    },
    { onConflict: "student_id" }
  );

  if (error) return { error: error.message };

  revalidatePath(`/students/${studentId}`);
  return { success: true };
}

export async function addTestScore(studentId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const test_type = String(formData.get("test_type") ?? "");
  const score = String(formData.get("score") ?? "").trim();
  const test_date = String(formData.get("test_date") ?? "") || null;

  if (!test_type || !score) return { error: "Test type and score are required." };

  const { error } = await supabase.from("student_test_scores").insert({ student_id: studentId, test_type, score, test_date });
  if (error) return { error: error.message };

  revalidatePath(`/students/${studentId}`);
  return { success: true };
}
