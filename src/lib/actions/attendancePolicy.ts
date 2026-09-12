"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";

const SETTINGS_PATH = "/setup/attendance-policy";

function readTime(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return /^\d{2}:\d{2}$/.test(text) ? `${text}:00` : null;
}

function readAmount(value: FormDataEntryValue | null): number {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function readDays(formData: FormData): number[] {
  return formData
    .getAll("work_days")
    .map((d) => Number(d))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort((a, b) => a - b);
}

/**
 * The office's default hours and what attendance is worth.
 *
 * Hours are per staff member — they differ per person — so these are the
 * defaults anybody without their own schedule is held to, which means a new
 * joiner is covered without anybody filling in a form.
 */
export async function updateAttendancePolicy(_prevState: unknown, formData: FormData) {
  const denied = await requirePermission("attendance.qr_admin", "Only Super Admin can set the attendance policy.");
  if (denied) return { error: denied.error };

  const supabase = await createClient();
  const work_start_time = readTime(formData.get("work_start_time"));
  const work_end_time = readTime(formData.get("work_end_time"));
  const grace_minutes = Math.max(0, Math.min(240, Number(formData.get("grace_minutes") ?? 0) || 0));
  const work_days = readDays(formData);

  if (formData.get("work_start_time") && !work_start_time) return { error: "That start time is not a valid time." };
  if (formData.get("work_end_time") && !work_end_time) return { error: "That end time is not a valid time." };
  if (work_start_time && work_end_time && work_end_time <= work_start_time) {
    return { error: "The day has to end after it starts — check the hours." };
  }
  if (work_days.length === 0) return { error: "Choose at least one working day, or nobody is ever due in." };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("attendance_policy")
    .update({
      work_start_time,
      work_end_time,
      work_days,
      grace_minutes,
      overtime_rate_per_hour: readAmount(formData.get("overtime_rate_per_hour")),
      late_deduction: readAmount(formData.get("late_deduction")),
      absent_deduction: readAmount(formData.get("absent_deduction")),
      updated_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    })
    .eq("id", true);
  if (error) return { error: error.message };

  revalidatePath(SETTINGS_PATH);
  revalidatePath("/finance/payroll");
  return { success: true };
}

/**
 * One person's own hours.
 *
 * Blank means "the office default", so a schedule only has to be filled in
 * for somebody who actually differs from it.
 */
export async function updateStaffWorkingHours(staffId: string, _prevState: unknown, formData: FormData) {
  const denied = await requirePermission("staff.manage", "Only Super Admin can set working hours.");
  if (denied) return { error: denied.error };

  const supabase = await createClient();
  const work_start_time = readTime(formData.get("work_start_time"));
  const work_end_time = readTime(formData.get("work_end_time"));
  const days = readDays(formData);

  if (formData.get("work_start_time") && !work_start_time) return { error: "That start time is not a valid time." };
  if (formData.get("work_end_time") && !work_end_time) return { error: "That end time is not a valid time." };
  if (work_start_time && work_end_time && work_end_time <= work_start_time) {
    return { error: "The day has to end after it starts — check the hours." };
  }
  // One without the other would hold somebody to half a schedule.
  if (Boolean(work_start_time) !== Boolean(work_end_time)) {
    return { error: "Set both a start and an end time, or leave both blank to use the office hours." };
  }

  const { data, error } = await supabase
    .from("staff")
    .update({ work_start_time, work_end_time, work_days: days.length > 0 ? days : null })
    .eq("id", staffId)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "You don't have permission to change this person's hours." };

  revalidatePath("/admin/staff");
  revalidatePath("/finance/payroll");
  return { success: true };
}
