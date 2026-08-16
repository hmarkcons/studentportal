"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { STAGES } from "@/lib/stages";

export async function createStudent(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const full_name = String(formData.get("full_name") ?? "").trim();
  const destination_country = String(formData.get("destination_country") ?? "");
  const email = String(formData.get("email") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const assigned_counselor_id = String(formData.get("assigned_counselor_id") ?? "") || null;

  if (!full_name || !destination_country) {
    return { error: "Name and destination are required." };
  }

  const { data, error } = await supabase
    .from("students")
    .insert({ full_name, destination_country, email, phone, assigned_counselor_id })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  redirect(`/students/${data.id}`);
}

export async function updateStudent(studentId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const full_name = String(formData.get("full_name") ?? "").trim();
  const destination_country = String(formData.get("destination_country") ?? "");
  const email = String(formData.get("email") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const assigned_counselor_id = String(formData.get("assigned_counselor_id") ?? "") || null;
  const current_stage = String(formData.get("current_stage") ?? "");

  if (!full_name || !destination_country || !STAGES.includes(current_stage as never)) {
    return { error: "Please fill in all required fields." };
  }

  const { error } = await supabase
    .from("students")
    .update({ full_name, destination_country, email, phone, assigned_counselor_id, current_stage })
    .eq("id", studentId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/students");
  revalidatePath("/board");
  return { success: true };
}

export async function moveStudentStage(studentId: string, stage: string) {
  if (!STAGES.includes(stage as never)) return;

  const supabase = await createClient();
  await supabase.from("students").update({ current_stage: stage }).eq("id", studentId);

  revalidatePath("/board");
  revalidatePath("/students");
  revalidatePath(`/students/${studentId}`);
}
