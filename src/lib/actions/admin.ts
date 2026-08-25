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

// QR check-in (Module 1M): a fixed QR code posted at the office encodes
// this token; scanning it hits /attendance/checkin?token=..., which calls
// this to record arrival/departure tied to whichever staff account is
// currently logged in — same clock-in/out toggle as the manual button,
// just method: 'qr' and no button press required.
export async function checkinViaQr(token: string): Promise<{ status: "in" | "out" | "invalid_token" | "not_staff" }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not_staff" };

  const { data: qr } = await supabase.from("office_qr_tokens").select("token").eq("id", true).maybeSingle();
  if (!qr || qr.token !== token) return { status: "invalid_token" };

  const { data: staffRow } = await supabase.from("staff").select("id").eq("id", user.id).eq("status", "active").maybeSingle();
  if (!staffRow) return { status: "not_staff" };

  const today = new Date().toISOString().slice(0, 10);
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
    revalidatePath("/admin/attendance");
    return { status: "out" };
  }

  await supabase
    .from("attendance_records")
    .insert({ staff_id: user.id, work_date: today, clock_in: new Date().toISOString(), method: "qr" });
  revalidatePath("/admin/attendance");
  return { status: "in" };
}

export async function rotateOfficeQrToken(_prevState: unknown, _formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("office_qr_tokens")
    .update({ token: crypto.randomUUID(), updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) return { error: error.message };
  revalidatePath("/admin/attendance");
  return { success: true };
}

export async function createServiceRequest(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const student_id = String(formData.get("student_id") ?? "");
  const service_type = String(formData.get("service_type") ?? "");
  const country_applying_to = String(formData.get("country_applying_to") ?? "").trim() || null;
  const total_fee_paid = formData.get("total_fee_paid") ? Number(formData.get("total_fee_paid")) : null;
  const passport_number = String(formData.get("passport_number") ?? "").trim() || null;
  const documents_submission_date = String(formData.get("documents_submission_date") ?? "").trim() || null;
  const documents_received = formData.get("documents_received") === "on";
  const fee_receiving_date = String(formData.get("fee_receiving_date") ?? "").trim() || null;
  const delivery_date = String(formData.get("delivery_date") ?? "").trim() || null;
  const required_document_names = String(formData.get("required_document_names") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const pending_documents = String(formData.get("pending_documents") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!student_id || !service_type) return { error: "Student and service type are required." };

  const extraFieldKeys = String(formData.get("extra_field_keys") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const extra_fields: Record<string, string | boolean> = {};
  for (const key of extraFieldKeys) {
    const raw = formData.get(`extra_${key}`);
    if (raw === "on") extra_fields[key] = true;
    else if (typeof raw === "string" && raw !== "") extra_fields[key] = raw;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const id = crypto.randomUUID();
  let proof_of_payment_path: string | null = null;
  const proofFile = formData.get("proof_of_payment") as File | null;
  if (proofFile && proofFile.size > 0) {
    const path = `${student_id}/additional-services/${id}-${proofFile.name}`;
    const { error: uploadError } = await supabase.storage.from("documents").upload(path, proofFile, { upsert: true });
    if (uploadError) return { error: uploadError.message };
    proof_of_payment_path = path;
  }

  const { error } = await supabase.from("additional_service_requests").insert({
    id,
    student_id,
    service_type,
    country_applying_to,
    total_fee_paid,
    passport_number,
    documents_submission_date,
    documents_received,
    fee_receiving_date,
    delivery_date,
    required_document_names,
    pending_documents,
    proof_of_payment_path,
    extra_fields,
    created_by: user?.id,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/additional-services");
  return { success: true };
}
