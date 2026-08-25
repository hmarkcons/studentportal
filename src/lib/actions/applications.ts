"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createApplication(studentId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const university_id = String(formData.get("university_id") ?? "");
  const program_id = String(formData.get("program_id") ?? "") || null;
  const intake = String(formData.get("intake") ?? "").trim() || null;

  if (!university_id) return { error: "Choose a university." };

  const { data, error } = await supabase
    .from("applications")
    .insert({ student_id: studentId, university_id, program_id, intake })
    .select("id")
    .single();

  if (error) return { error: error.message };

  redirect(`/students/${studentId}/applications/${data.id}`);
}

export async function updateApplicationStage(applicationId: string, studentId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const current_stage = String(formData.get("current_stage") ?? "");
  if (!current_stage) return { error: "Choose a stage." };

  const { error } = await supabase.from("applications").update({ current_stage }).eq("id", applicationId);
  if (error) return { error: error.message };

  revalidatePath(`/students/${studentId}/applications/${applicationId}`);
  return { success: true };
}

export async function addApplicationTask(applicationId: string, studentId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const description = String(formData.get("description") ?? "").trim();
  const due_date = String(formData.get("due_date") ?? "") || null;
  const owner_id = String(formData.get("owner_id") ?? "") || null;

  if (!description) return { error: "Description is required." };

  const { error } = await supabase.from("application_tasks").insert({ application_id: applicationId, description, due_date, owner_id });
  if (error) return { error: error.message };

  revalidatePath(`/students/${studentId}/applications/${applicationId}`);
  return { success: true };
}

export async function toggleApplicationTask(taskId: string, applicationId: string, studentId: string, done: boolean) {
  const supabase = await createClient();
  await supabase.from("application_tasks").update({ status: done ? "done" : "pending" }).eq("id", taskId);
  revalidatePath(`/students/${studentId}/applications/${applicationId}`);
}

export async function updateVisaRecord(applicationId: string, studentId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const outcome = String(formData.get("outcome") ?? "pending");
  const outcome_reason = String(formData.get("outcome_reason") ?? "").trim() || null;
  const biometric_appointment = String(formData.get("biometric_appointment") ?? "") || null;
  const interview_appointment = String(formData.get("interview_appointment") ?? "") || null;
  const medical_appointment = String(formData.get("medical_appointment") ?? "") || null;

  const { error } = await supabase.from("visa_records").upsert(
    { application_id: applicationId, outcome, outcome_reason, biometric_appointment, interview_appointment, medical_appointment },
    { onConflict: "application_id" }
  );

  if (error) return { error: error.message };

  revalidatePath(`/students/${studentId}/applications/${applicationId}`);
  return { success: true };
}
