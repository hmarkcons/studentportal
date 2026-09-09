"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseGuestEmails, eventFieldsError } from "@/lib/calendarEventFields";

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

// Reminders (stall/deadline/follow_up) stay visible on the calendar once
// resolved instead of disappearing — resolved just toggles a badge/strike-
// through, so staff can still uncheck, edit, or delete the row afterward.
export async function toggleReminderResolved(reminderId: string, revalidateTo: string, resolved: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("reminders").update({ resolved }).eq("id", reminderId);
  if (error) return { error: error.message };
  revalidatePath(revalidateTo);
  return { success: true };
}

export async function updateReminder(reminderId: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const due_date = String(formData.get("due_date") ?? "");
  const due_time = String(formData.get("due_time") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim();
  if (!due_date) return { error: "A date is required." };

  const { error } = await supabase.from("reminders").update({ due_date, due_time, note: note || null }).eq("id", reminderId);
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function deleteReminder(reminderId: string, revalidateTo: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("reminders").delete().eq("id", reminderId);
  if (error) return { error: error.message };
  revalidatePath(revalidateTo);
  return { success: true };
}
