"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseGuestEmails, eventFieldsError } from "@/lib/calendarEventFields";

export async function updatePersonalTask(taskId: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("notes") ?? "").trim() || null;
  const due_date = String(formData.get("due_date") ?? "");
  const end_date = String(formData.get("end_date") ?? "").trim() || null;
  const all_day = formData.get("all_day") === "on";
  const due_time = !all_day ? String(formData.get("due_time") ?? "").trim() || null : null;
  const priority = String(formData.get("priority") ?? "medium");
  const color = String(formData.get("color") ?? "").trim() || null;
  const guests = parseGuestEmails(formData.get("guest_emails"));
  if (guests.error) return { error: guests.error };
  const guest_emails = guests.emails;
  const recurrence = String(formData.get("recurrence") ?? "none");
  const recurrence_end_date = String(formData.get("recurrence_end_date") ?? "").trim() || null;

  const invalid = eventFieldsError({
    title,
    dueDate: due_date,
    endDate: end_date,
    recurrence,
    recurrenceEndDate: recurrence_end_date,
    priority,
  });
  if (invalid) return { error: invalid };

  const { error } = await supabase
    .from("personal_tasks")
    .update({
      title,
      description,
      due_date,
      end_date,
      all_day,
      due_time,
      priority,
      color,
      guest_emails,
      recurrence,
      recurrence_end_date,
    })
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
