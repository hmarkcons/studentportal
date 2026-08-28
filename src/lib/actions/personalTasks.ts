"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createPersonalTask(revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const due_date = String(formData.get("due_date") ?? "");
  const due_time = String(formData.get("due_time") ?? "").trim() || null;
  const priority = String(formData.get("priority") ?? "medium");
  const ownerIdInput = String(formData.get("owner_id") ?? "") || user.id;

  if (!title || !due_date) return { error: "Title and date are required." };

  const { error } = await supabase.from("personal_tasks").insert({
    owner_id: ownerIdInput,
    title,
    description,
    due_date,
    due_time,
    priority,
  });
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function updatePersonalTask(taskId: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const due_date = String(formData.get("due_date") ?? "");
  const due_time = String(formData.get("due_time") ?? "").trim() || null;
  const priority = String(formData.get("priority") ?? "medium");

  if (!title || !due_date) return { error: "Title and date are required." };

  const { error } = await supabase
    .from("personal_tasks")
    .update({ title, description, due_date, due_time, priority })
    .eq("id", taskId);
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function togglePersonalTask(taskId: string, revalidateTo: string, done: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("personal_tasks").update({ status: done ? "done" : "pending" }).eq("id", taskId);
  if (error) return { error: error.message };
  revalidatePath(revalidateTo);
  return { success: true };
}

export async function deletePersonalTask(taskId: string, revalidateTo: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("personal_tasks").delete().eq("id", taskId);
  if (error) return { error: error.message };
  revalidatePath(revalidateTo);
  return { success: true };
}
