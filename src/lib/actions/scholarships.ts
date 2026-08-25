"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createScholarshipBody(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const region = String(formData.get("region") ?? "").trim() || null;
  const academic_year = String(formData.get("academic_year") ?? "").trim();
  const covers = String(formData.get("covers") ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  const stipend_amount = String(formData.get("stipend_amount") ?? "").trim() || null;

  if (!name || !academic_year) return { error: "Name and academic year are required." };

  const { error } = await supabase.from("scholarship_bodies").insert({ name, region, academic_year, covers, stipend_amount });
  if (error) return { error: error.message };

  revalidatePath("/setup/scholarship-bodies");
  return { success: true };
}

export async function addStudentScholarship(studentId: string, applicationId: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const scholarship_body_id = String(formData.get("scholarship_body_id") ?? "") || null;
  const name = String(formData.get("name") ?? "").trim() || null;
  const provider = String(formData.get("provider") ?? "").trim() || null;
  const award_amount = formData.get("award_amount") ? Number(formData.get("award_amount")) : null;
  const status = String(formData.get("status") ?? "applied");

  const { error } = await supabase
    .from("student_scholarships")
    .insert({ student_id: studentId, application_id: applicationId, scholarship_body_id, name, provider, award_amount, status });

  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function markPreenrollmentFinalized(applicationId: string, revalidateTo: string, finalized: boolean) {
  const supabase = await createClient();
  await supabase.from("applications").update({ preenrollment_finalized: finalized }).eq("id", applicationId);
  revalidatePath(revalidateTo);
}
