"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function parseGuestEmails(formData: FormData): string[] {
  return String(formData.get("guest_emails") ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

// Single unified add-event action for the calendar's day modal — branches on
// `type` instead of running two separate forms (one for a personal reminder,
// one for a student/application task) so the modal only ever shows one
// title field and one priority field.
export async function createCalendarEvent(revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const type = String(formData.get("type") ?? "personal");
  const title = String(formData.get("title") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const due_date = String(formData.get("due_date") ?? "");
  const end_date = String(formData.get("end_date") ?? "").trim() || null;
  const all_day = formData.get("all_day") === "on";
  const due_time = !all_day ? String(formData.get("due_time") ?? "").trim() || null : null;
  const priority = String(formData.get("priority") ?? "medium");
  const color = String(formData.get("color") ?? "").trim() || null;
  const guest_emails = parseGuestEmails(formData);
  const recurrence = String(formData.get("recurrence") ?? "none");
  const recurrence_end_date = String(formData.get("recurrence_end_date") ?? "").trim() || null;

  if (!title || !due_date) return { error: "Title and date are required." };
  if (end_date && end_date < due_date) return { error: "End date can't be before the start date." };

  if (type === "task") {
    const application_id = String(formData.get("application_id") ?? "");
    if (!application_id) return { error: "Choose a student/application for this task." };

    const { error } = await supabase.from("application_tasks").insert({
      application_id,
      description: title,
      notes,
      due_date,
      end_date,
      all_day,
      due_time,
      priority,
      color,
      guest_emails,
      recurrence,
      recurrence_end_date,
    });
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("personal_tasks").insert({
      owner_id: user.id,
      title,
      description: notes,
      due_date,
      end_date,
      all_day,
      due_time,
      priority,
      color,
      guest_emails,
      recurrence,
      recurrence_end_date,
    });
    if (error) return { error: error.message };
  }

  revalidatePath(revalidateTo);
  return { success: true };
}

// Rich edit for an existing application-linked task, used only by the
// calendar's CalendarTaskRow — TaskList.tsx / DashboardTaskList.tsx elsewhere
// in the app keep using the original, simpler updateApplicationTask.
export async function updateCalendarTask(taskId: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const title = String(formData.get("title") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const due_date = String(formData.get("due_date") ?? "");
  const end_date = String(formData.get("end_date") ?? "").trim() || null;
  const all_day = formData.get("all_day") === "on";
  const due_time = !all_day ? String(formData.get("due_time") ?? "").trim() || null : null;
  const priority = String(formData.get("priority") ?? "medium");
  const color = String(formData.get("color") ?? "").trim() || null;
  const guest_emails = parseGuestEmails(formData);
  const recurrence = String(formData.get("recurrence") ?? "none");
  const recurrence_end_date = String(formData.get("recurrence_end_date") ?? "").trim() || null;

  if (!title || !due_date) return { error: "Title and date are required." };
  if (end_date && end_date < due_date) return { error: "End date can't be before the start date." };

  const { error } = await supabase
    .from("application_tasks")
    .update({
      description: title,
      notes,
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
