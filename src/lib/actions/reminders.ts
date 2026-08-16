"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addReminder(studentId: string, _prevState: unknown, formData: FormData) {
  const due_date = String(formData.get("due_date") ?? "");

  if (!due_date) {
    return { error: "Pick a due date." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("reminders")
    .insert({ student_id: studentId, type: "deadline", due_date });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/students/${studentId}`);
  return { success: true };
}

export async function resolveReminder(studentId: string, reminderId: string) {
  const supabase = await createClient();
  await supabase.from("reminders").update({ resolved: true }).eq("id", reminderId);
  revalidatePath(`/students/${studentId}`);
}
