"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function createStaffAccount(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const email = String(formData.get("email") ?? "").trim();
  const full_name = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "");

  if (!email || !full_name || !role) return { error: "All fields are required." };

  const admin = createAdminClient();
  const tempPassword = Math.random().toString(36).slice(2) + "A1!";
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });

  if (createError || !created.user) return { error: createError?.message ?? "Could not create the account." };

  const { error } = await supabase.from("staff").insert({ id: created.user.id, full_name, role });
  if (error) return { error: error.message };

  revalidatePath("/admin/staff");
  return { success: true, email, password: tempPassword };
}

export async function updateStaffStatus(staffId: string, status: string) {
  const supabase = await createClient();
  await supabase.from("staff").update({ status }).eq("id", staffId);
  revalidatePath("/admin/staff");
}

export async function approvePartnerAccount(accountId: string, status: string) {
  const supabase = await createClient();
  await supabase.from("partner_university_accounts").update({ status }).eq("id", accountId);
  revalidatePath("/admin/staff");
}

export async function clockInOut(action: "in" | "out") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const today = new Date().toISOString().slice(0, 10);

  if (action === "in") {
    await supabase.from("attendance_records").insert({ staff_id: user.id, work_date: today, clock_in: new Date().toISOString() });
  } else {
    const { data: open } = await supabase
      .from("attendance_records")
      .select("id")
      .eq("staff_id", user.id)
      .eq("work_date", today)
      .is("clock_out", null)
      .order("clock_in", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (open) {
      await supabase.from("attendance_records").update({ clock_out: new Date().toISOString() }).eq("id", open.id);
    }
  }

  revalidatePath("/admin/attendance");
}

export async function createServiceRequest(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const student_id = String(formData.get("student_id") ?? "");
  const service_type = String(formData.get("service_type") ?? "");
  const country_applying_to = String(formData.get("country_applying_to") ?? "").trim() || null;
  const total_fee_paid = formData.get("total_fee_paid") ? Number(formData.get("total_fee_paid")) : null;

  if (!student_id || !service_type) return { error: "Student and service type are required." };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("additional_service_requests").insert({
    student_id,
    service_type,
    country_applying_to,
    total_fee_paid,
    created_by: user?.id,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/additional-services");
  return { success: true };
}
