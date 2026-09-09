"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/permissions";
import { dateOfBirthError } from "@/lib/dateOfBirth";
import { phoneError } from "@/lib/phoneNumber";

// "Suspended" just freezes the account (blocked from every staff route by
// the (staff) layout's `status !== "active"` check, same as deactivated) —
// unlike Inactive, it never triggers the reassignment flow below, since a
// suspension is meant to be a temporary hold, not a handover.
function statusFromFormValue(value: string): "active" | "suspended" | "deactivated" {
  if (value === "suspended") return "suspended";
  if (value === "inactive") return "deactivated";
  return "active";
}

function staffFieldsFromFormData(formData: FormData) {
  return {
    full_name: String(formData.get("full_name") ?? "").trim(),
    role: String(formData.get("role") ?? ""),
    designation: String(formData.get("designation") ?? "").trim() || null,
    status: statusFromFormValue(String(formData.get("status") ?? "active")),
    gender: String(formData.get("gender") ?? "").trim() || null,
    date_of_birth: String(formData.get("date_of_birth") ?? "") || null,
    marital_status: String(formData.get("marital_status") ?? "").trim() || null,
    cnic: String(formData.get("cnic") ?? "").trim() || null,
    address: String(formData.get("address") ?? "").trim() || null,
    mobile_personal: String(formData.get("mobile_personal") ?? "").trim() || null,
    mobile_official: String(formData.get("mobile_official") ?? "").trim() || null,
    email_personal: String(formData.get("email_personal") ?? "").trim() || null,
    email_official: String(formData.get("email_official") ?? "").trim() || null,
    emergency_contact_number: String(formData.get("emergency_contact_number") ?? "").trim() || null,
    emergency_contact_name: String(formData.get("emergency_contact_name") ?? "").trim() || null,
    emergency_contact_relation: String(formData.get("emergency_contact_relation") ?? "").trim() || null,
    monthly_salary: formData.get("monthly_salary") ? Number(formData.get("monthly_salary")) : null,
    currency: String(formData.get("currency") ?? "PKR"),
    allowance: formData.get("allowance") ? Number(formData.get("allowance")) : null,
    commission_rate_general: formData.get("commission_rate_general") ? Number(formData.get("commission_rate_general")) : null,
    commission_rate_public_universities: formData.get("commission_rate_public_universities")
      ? Number(formData.get("commission_rate_public_universities"))
      : null,
    commission_type_general: String(formData.get("commission_type_general") ?? "percentage") === "flat" ? "flat" : "percentage",
    commission_type_public_universities:
      String(formData.get("commission_type_public_universities") ?? "percentage") === "flat" ? "flat" : "percentage",
    monthly_target: formData.get("monthly_target") ? Number(formData.get("monthly_target")) : null,
    bonus_eligible: formData.get("bonus_eligible") === "on",
    bonus_rate_percent:
      formData.get("bonus_eligible") === "on" && formData.get("bonus_rate_percent") ? Number(formData.get("bonus_rate_percent")) : null,
  };
}

// Checked outright rather than only-when-changed, unlike the student forms:
// every number in the staff table already passes, so there is no legacy value
// here for this to hold an unrelated edit hostage to.
function staffPhoneError(fields: ReturnType<typeof staffFieldsFromFormData>) {
  return (
    phoneError(fields.mobile_personal, "personal mobile") ??
    phoneError(fields.mobile_official, "official mobile") ??
    phoneError(fields.emergency_contact_number, "emergency contact number")
  );
}

export async function createStaffAccount(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const denied = await requirePermission("staff.manage", "Only Super Admin can add staff.");
  if (denied) return { error: denied.error };

  const email = String(formData.get("email_official") ?? "").trim();
  const fields = staffFieldsFromFormData(formData);

  if (!email || !fields.full_name || !fields.role) return { error: "Email (official), name, and role are required." };
  const dobError = dateOfBirthError(fields.date_of_birth);
  if (dobError) return { error: dobError };
  const phoneIssue = staffPhoneError(fields);
  if (phoneIssue) return { error: phoneIssue };

  const admin = createAdminClient();
  const tempPassword = Math.random().toString(36).slice(2) + "A1!";
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });

  if (createError || !created.user) return { error: createError?.message ?? "Could not create the account." };

  const { error } = await supabase.from("staff").insert({ id: created.user.id, ...fields });
  if (error) return { error: error.message };

  revalidatePath("/admin/staff");
  revalidateTag("staff-directory", { expire: 0 });
  return { success: true, email, password: tempPassword };
}

export async function updateStaffDetails(staffId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const denied = await requirePermission("staff.manage", "Only Super Admin can edit staff.");
  if (denied) return { error: denied.error };

  const fields = staffFieldsFromFormData(formData);
  if (!fields.full_name || !fields.role) return { error: "Name and role are required." };
  const dobError = dateOfBirthError(fields.date_of_birth);
  if (dobError) return { error: dobError };
  const phoneIssue = staffPhoneError(fields);
  if (phoneIssue) return { error: phoneIssue };

  // Deactivating a staff member must not silently strand their students with
  // a counselor nobody can see any more (is_active_staff() already hides an
  // inactive counselor from role-filtered pickers everywhere else) — so a
  // replacement is required up front and the handover happens before the
  // status flip itself, never after, so a failed reassignment can't leave
  // the staff member deactivated with orphaned assignments. Every handed-over
  // student is logged in staff_reassignment_log so reactivating this same
  // staff member later can hand them back automatically (see below).
  if (fields.status === "deactivated") {
    const { data: assignedLeads } = await supabase.from("leads").select("id").eq("assigned_counselor_id", staffId);

    if (assignedLeads && assignedLeads.length > 0) {
      const reassignToStaffId = String(formData.get("reassign_to_staff_id") ?? "") || null;
      if (!reassignToStaffId) {
        return {
          error: `This staff member has ${assignedLeads.length} assigned student(s). Choose a replacement staff member before deactivating.`,
        };
      }
      if (reassignToStaffId === staffId) {
        return { error: "Choose a different staff member to reassign to." };
      }
      const { data: replacement } = await supabase.from("staff").select("id, status").eq("id", reassignToStaffId).maybeSingle();
      if (!replacement || replacement.status !== "active") {
        return { error: "The chosen replacement staff member must be active." };
      }

      const { error: reassignError } = await supabase
        .from("leads")
        .update({ assigned_counselor_id: reassignToStaffId })
        .eq("assigned_counselor_id", staffId);
      if (reassignError) return { error: reassignError.message };

      const { error: logError } = await supabase.from("staff_reassignment_log").insert(
        assignedLeads.map((l) => ({ from_staff_id: staffId, to_staff_id: reassignToStaffId, student_id: l.id }))
      );
      if (logError) return { error: logError.message };
    }
  }

  // Reactivating a staff member hands back any student that was moved to
  // their stand-in on deactivation and hasn't been reassigned again since
  // (checked against the student's CURRENT assigned_counselor_id, not the
  // log row itself) — so a student someone else has since taken over stays
  // put instead of being yanked back.
  let restoredCount = 0;
  if (fields.status === "active") {
    const { data: pendingReversals } = await supabase
      .from("staff_reassignment_log")
      .select("id, to_staff_id, student_id")
      .eq("from_staff_id", staffId)
      .is("reversed_at", null);

    for (const entry of pendingReversals ?? []) {
      const { data: student } = await supabase.from("leads").select("assigned_counselor_id").eq("id", entry.student_id).maybeSingle();
      if (student?.assigned_counselor_id !== entry.to_staff_id) continue;

      const { error: revertError } = await supabase
        .from("leads")
        .update({ assigned_counselor_id: staffId })
        .eq("id", entry.student_id);
      if (revertError) continue;

      await supabase.from("staff_reassignment_log").update({ reversed_at: new Date().toISOString() }).eq("id", entry.id);
      restoredCount++;
    }
  }

  const { error } = await supabase.from("staff").update(fields).eq("id", staffId);
  if (error) return { error: error.message };

  revalidatePath("/admin/staff");
  revalidatePath("/students");
  revalidatePath("/leads");
  revalidateTag("staff-directory", { expire: 0 });
  return { success: true, ...(restoredCount > 0 ? { restoredCount } : {}) };
}

export async function uploadStaffPhoto(staffId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const denied = await requirePermission("staff.manage", "Only Super Admin can set a staff member's photo.");
  if (denied) return { error: denied.error };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Choose a photo to upload." };
  if (!file.type.startsWith("image/")) return { error: "Choose an image file." };

  const path = `staff-photos/${staffId}/photo-${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { upsert: true });
  if (uploadError) return { error: uploadError.message };

  const { error } = await supabase.from("staff").update({ photo_path: path }).eq("id", staffId);
  if (error) return { error: error.message };

  revalidatePath("/admin/staff");
  revalidateTag("staff-directory", { expire: 0 });
  return { success: true };
}

export async function deleteStaffAccount(staffId: string) {
  const supabase = await createClient();
  const denied = await requirePermission("staff.manage", "Only Super Admin can delete staff.");
  if (denied) return { error: denied.error };

  const { error } = await supabase.from("staff").delete().eq("id", staffId);
  if (error) {
    return {
      error: error.message.includes("foreign key")
        ? "Can't delete — this staff member has historical records (leads, commissions, agreements, etc.). Set them to Inactive instead."
        : error.message,
    };
  }

  // The login must go too, and a failure here cannot be swallowed: it used to
  // be, so deleting a staff member whose id appeared in audit_log (i.e. anyone
  // who had ever edited a lead) removed the staff row, reported success, and
  // left a working credential behind. Migration 0136 made the two history FKs
  // ON DELETE SET NULL so this now succeeds; if it ever fails again, say so
  // instead of pretending the account is gone.
  const admin = createAdminClient();
  const { error: authError } = await admin.auth.admin.deleteUser(staffId);

  revalidatePath("/admin/staff");
  revalidateTag("staff-directory", { expire: 0 });

  if (authError) {
    return {
      error:
        "Removed them from the staff list, but their login could not be deleted, so it may still work. " +
        `Tell the developer: ${authError.message}`,
    };
  }
  return { success: true };
}

export async function approvePartnerAccount(accountId: string, status: string) {
  const supabase = await createClient();
  const denied = await requirePermission("partners.approve", "Only Super Admin can approve partner accounts.");
  if (denied) return { error: denied.error };

  const { error } = await supabase.from("partner_university_accounts").update({ status }).eq("id", accountId);
  if (error) return { error: error.message };
  revalidatePath("/admin/staff");
  return { success: true };
}

export type PunchOutcome = "in" | "out" | "already_in" | "not_in" | "not_staff" | "invalid_token";

/**
 * Clock in or out.
 *
 * The work is done by attendance_punch (0157) rather than here. Two reasons:
 * ordinary staff no longer hold INSERT or UPDATE on attendance_records — which
 * is what stopped a timesheet being rewritten by the person it is about — and
 * the button and the QR scan were two separate implementations of the same
 * toggle, each with its own copy of the stale-shift handling.
 *
 * It also says what happened. This used to return success without doing
 * anything at all when the state already matched: pressing Clock In while
 * already clocked in, or Clock Out while not clocked in, both reported a
 * cheerful success over nothing. And after a forgotten clock-out, Clock In did
 * nothing every time, forever, still reporting success.
 */
export async function clockInOut(action: "in" | "out") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data, error } = await supabase.rpc("attendance_punch", { p_action: action, p_method: "button" });
  if (error) return { error: error.message };

  const result = (Array.isArray(data) ? data[0] : data) as { outcome: PunchOutcome; detail: string } | null;
  if (!result) return { error: "Attendance could not be recorded — try again." };

  revalidatePath("/admin/attendance");
  // "Already clocked in since 9:04 AM" is not a failure, but it is not a
  // silent success either — the caller shows it either way.
  return { success: true, outcome: result.outcome, message: result.detail };
}

/**
 * QR check-in (Module 1M): a fixed sheet posted at the office encodes a token;
 * scanning it hits /attendance/checkin?token=..., which calls this to toggle
 * arrival/departure for whichever staff account the phone is logged into.
 *
 * The token is no longer read here and compared in JavaScript. It was readable
 * by every active staff member through the API (checked against production),
 * so anyone who had ever logged in could assemble the check-in URL and record
 * physical presence at the office from anywhere — which is the entire thing the
 * printed sheet exists to establish. attendance_punch verifies it inside the
 * database and never returns it, and only Super Admin can read it now, to
 * print the sheet.
 */
export async function checkinViaQr(
  token: string
): Promise<{ status: "in" | "out" | "already_in" | "not_in" | "invalid_token" | "not_staff" | "error"; detail?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not_staff" };

  const { data, error } = await supabase.rpc("attendance_punch", {
    p_action: "toggle",
    p_method: "qr",
    p_token: token,
  });
  if (error) return { status: "error" };

  const result = (Array.isArray(data) ? data[0] : data) as
    | { outcome: "in" | "out" | "already_in" | "not_in" | "invalid_token" | "not_staff"; detail: string }
    | null;
  if (!result) return { status: "error" };

  revalidatePath("/admin/attendance");
  return { status: result.outcome, detail: result.detail };
}

export async function rotateOfficeQrToken(_prevState: unknown, _formData: FormData) {
  const supabase = await createClient();
  const denied = await requirePermission("attendance.qr_admin", "Only Super Admin can rotate the office QR code.");
  if (denied) return { error: denied.error };

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
