"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission, hasPermission } from "@/lib/auth/permissions";
import { getStaffSession } from "@/lib/auth/session";
import {
  canGrantSuperAdmin,
  hasRole,
  parseRolesFromFormData,
  rolesWereSubmitted,
  staffRoles,
} from "@/lib/auth/roles";
import type { StaffRole } from "@/lib/constants";
import { dateOfBirthError } from "@/lib/dateOfBirth";
import { phoneError } from "@/lib/phoneNumber";
import { MAX_PHOTO_BYTES, fileSizeError, reduceHint } from "@/lib/fileSize";
import { notifyAssignedStaff } from "@/lib/actions/registrationNotice";
import { compensationFromFormData } from "@/lib/staffCompensation";
import { generatePassword } from "@/lib/generatePassword";
import { sendEmail } from "@/lib/email";
import { getSiteUrl } from "@/lib/siteUrl";
import {
  staffLoginHtml,
  staffLoginSubject,
  staffLoginText,
  type StaffLoginEmailData,
} from "@/lib/staffLoginEmail";
import { uploadedFile } from "@/lib/stagedUpload";

// "Suspended" just freezes the account (blocked from every staff route by
// the (staff) layout's `status !== "active"` check, same as deactivated) —
// unlike Inactive, it never triggers the reassignment flow below, since a
// suspension is meant to be a temporary hold, not a handover.
function statusFromFormValue(value: string): "active" | "suspended" | "deactivated" {
  if (value === "suspended") return "suspended";
  if (value === "inactive") return "deactivated";
  return "active";
}

/**
 * Which of a person's roles is their primary one — the single role the staff
 * list, the directory and role-keyed email wording show.
 *
 * Keep the one they already had wherever it is still held, so giving a
 * counselor an extra Finance role doesn't rename them in every list. Otherwise
 * take the first in STAFF_ROLES order, which runs most-senior first — the same
 * answer 0247's trigger reaches on its own, since the staff_role enum is
 * declared in that same order and Postgres sorts an enum by declaration order.
 */
function primaryRole(next: StaffRole[], previous: StaffRole | null): StaffRole {
  return previous && next.includes(previous) ? previous : next[0];
}

/**
 * How much of a staff record the signed-in person may change.
 *
 * `staff.manage` is the whole thing — salary, commission, status, hours. It is
 * the Super Admin's. `staff.assign_roles` is the roles alone, and it is what
 * Management holds: deciding who does which job is their call, while what
 * anyone is paid is not theirs to see or set.
 */
async function staffEditScope(): Promise<"all" | "roles" | "none"> {
  if (await hasPermission("staff.manage")) return "all";
  if (await hasPermission("staff.assign_roles")) return "roles";
  return "none";
}

/**
 * Whether this role change is allowed, as a message to show if it isn't.
 *
 * Two rules. Everybody keeps at least one role — a staff row with none would
 * be denied by every permission check while still being an active account,
 * which looks like a broken portal rather than a deliberate lockout (use
 * Suspended for that). And Super Admin is granted by Super Admins only:
 * anyone who can hand it out can hand it to themselves, and with it the
 * permissions editor and every salary in the company. The form hides that tick
 * box, but hiding a control is not a restriction — this is where it's enforced.
 */
async function roleChangeError(next: StaffRole[], previous: StaffRole[]): Promise<string | null> {
  if (next.length === 0) {
    return "Pick at least one role. To stop someone signing in, set their status to Suspended instead.";
  }
  const wasSuper = previous.includes("super_admin");
  const isSuper = next.includes("super_admin");
  if (wasSuper !== isSuper) {
    const { staff } = await getStaffSession();
    if (!canGrantSuperAdmin(staff)) {
      return isSuper
        ? "Only a Super Admin can grant the Super Admin role."
        : "Only a Super Admin can remove the Super Admin role.";
    }
  }
  return null;
}

function staffFieldsFromFormData(formData: FormData) {
  return {
    full_name: String(formData.get("full_name") ?? "").trim(),
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
    monthly_target: formData.get("monthly_target") ? Number(formData.get("monthly_target")) : null,
    // Blank means "the office default" (0168), so a schedule only has to be
    // filled in for somebody who actually differs from it. A time input sends
    // "09:00"; the column wants "09:00:00".
    work_start_time: readWorkTime(formData.get("work_start_time")),
    work_end_time: readWorkTime(formData.get("work_end_time")),
    work_days: readWorkDays(formData),
    // The anniversary their leave year runs from (0272). A date input sends
    // YYYY-MM-DD or nothing.
    joined_on: /^\d{4}-\d{2}-\d{2}$/.test(String(formData.get("joined_on") ?? "")) ? String(formData.get("joined_on")) : null,
  };
}

function readWorkTime(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return /^\d{2}:\d{2}$/.test(text) ? `${text}:00` : null;
}

function readWorkDays(formData: FormData): number[] | null {
  const days = formData
    .getAll("work_days")
    .map((d) => Number(d))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort((a, b) => a - b);
  return days.length > 0 ? days : null;
}

/**
 * Half a schedule is worse than none: an end with no start cannot say whether
 * anybody was late, and a start with no end cannot say what overtime is.
 */
function staffHoursError(fields: ReturnType<typeof staffFieldsFromFormData>) {
  if (Boolean(fields.work_start_time) !== Boolean(fields.work_end_time)) {
    return "Set both a start and an end time, or leave both blank to use the office hours.";
  }
  if (fields.work_start_time && fields.work_end_time && fields.work_end_time <= fields.work_start_time) {
    return "The working day has to end after it starts — check the hours.";
  }
  return null;
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

/**
 * Writes the pay the form carried, returning a message if it was refused.
 *
 * An UPDATE, not an upsert: `staff_ensure_compensation` (0249) creates the row
 * with the old column defaults the moment a staff member is inserted, so there
 * is always something to update, and an upsert here would quietly re-create a
 * row that a cascade had deliberately removed.
 *
 * Only ever reached on the staff.manage path. RLS on staff_compensation is
 * Super Admin for writes regardless, so a caller who somehow got here without
 * it is refused by the database rather than by this function.
 */
async function savePay(
  supabase: Awaited<ReturnType<typeof createClient>>,
  staffId: string,
  formData: FormData
): Promise<string | null> {
  const { staff: actor } = await getStaffSession();
  const { error } = await supabase
    .from("staff_compensation")
    .update({
      ...compensationFromFormData(formData),
      updated_at: new Date().toISOString(),
      updated_by: actor?.id ?? null,
    })
    .eq("staff_id", staffId);
  return error ? error.message : null;
}

export async function createStaffAccount(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const denied = await requirePermission("staff.manage", "Only Super Admin can add staff.");
  if (denied) return { error: denied.error };

  const email = String(formData.get("email_official") ?? "").trim();
  const fields = staffFieldsFromFormData(formData);
  const roles = parseRolesFromFormData(formData);

  if (!email || !fields.full_name) return { error: "Email (official) and name are required." };
  const roleIssue = await roleChangeError(roles, []);
  if (roleIssue) return { error: roleIssue };
  const dobError = dateOfBirthError(fields.date_of_birth);
  if (dobError) return { error: dobError };
  const phoneIssue = staffPhoneError(fields);
  const hoursIssue = staffHoursError(fields);
  if (hoursIssue) return { error: hoursIssue };
  if (phoneIssue) return { error: phoneIssue };

  const admin = createAdminClient();
  // The generator every staff login uses (see issueStaffCredentials). This
  // used to be Math.random(), which is not a secure source of randomness.
  const tempPassword = generatePassword();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });

  if (createError || !created.user) return { error: createError?.message ?? "Could not create the account." };

  const { error } = await supabase
    .from("staff")
    .insert({ id: created.user.id, ...fields, roles, role: primaryRole(roles, null) });
  if (error) return { error: error.message };

  // Pay lives on its own table now (0249). The staff insert's trigger has
  // already created the row with column defaults, so this only has to fill in
  // what the form actually carried.
  const payError = await savePay(supabase, created.user.id, formData);
  if (payError) return { error: payError };

  // The same copy and mail a reissue makes, so a first login is never the
  // one-time-only password it used to be. Neither can fail the account, which
  // exists and works by now; each says so if it did not happen.
  const { staff: actor } = await getStaffSession();
  const warnings: string[] = [];
  const { error: storeError } = await supabase.rpc("store_staff_login", {
    p_staff_id: created.user.id,
    p_plaintext: JSON.stringify({ username: email, password: tempPassword }),
  });
  if (storeError) warnings.push("A copy couldn't be kept, so Reveal won't show this password later — copy it down now.");
  const mailError = await mailStaffLogin({
    staffName: fields.full_name,
    email,
    password: tempPassword,
    issuedBy: actor?.full_name ?? null,
    reason: "new_account",
  });
  if (mailError) warnings.push(`The welcome email didn't go (${mailError}) — pass these on yourself.`);

  revalidatePath("/admin/staff");
  revalidateTag("staff-directory", { expire: 0 });
  return {
    success: true,
    email,
    password: tempPassword,
    emailed: !mailError,
    ...(warnings.length ? { warning: warnings.join(" ") } : {}),
  };
}

/**
 * Keeps a staff member's login email the same as their official email.
 *
 * They used to be set once, at creation, and never again — so editing the
 * official email left the login on the old address, and the staff member
 * signing in with the address on their profile was refused. One account had
 * drifted that way when this was written.
 *
 * Done before the staff row is saved, so an address another login already
 * uses is refused before anything changes; the returned `revert` puts the
 * login back if the save after it fails.
 */
async function syncLoginEmail(
  staffId: string,
  officialEmail: string | null | undefined
): Promise<{ error?: string; revert?: () => Promise<void> }> {
  const next = (officialEmail ?? "").trim();
  if (!next) return {};

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(staffId);
  if (error || !data.user) return {};
  const current = data.user.email ?? "";
  if (current.toLowerCase() === next.toLowerCase()) return {};

  const { error: updateError } = await admin.auth.admin.updateUserById(staffId, { email: next, email_confirm: true });
  if (updateError) {
    return {
      error: /already|registered|exists/i.test(updateError.message)
        ? `${next} is already used by another login, so it can't be their sign-in email. Nothing was saved.`
        : `Their sign-in email couldn't be changed to match: ${updateError.message}. Nothing was saved.`,
    };
  }
  return {
    revert: async () => {
      await admin.auth.admin.updateUserById(staffId, { email: current, email_confirm: true });
    },
  };
}

export async function updateStaffDetails(staffId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const scope = await staffEditScope();
  if (scope === "none") return { error: "Only Super Admin can edit staff." };

  // The roles the form posted, if it posted any. A form with no roles field at
  // all leaves the existing set alone rather than clearing it.
  let roles: StaffRole[] | null = null;
  if (rolesWereSubmitted(formData)) {
    const { data: current } = await supabase.from("staff").select("role, roles").eq("id", staffId).maybeSingle();
    if (!current) return { error: "That staff member no longer exists." };

    roles = parseRolesFromFormData(formData);
    // Checked here so a mistake comes back as a sentence rather than a
    // Postgres exception. set_staff_roles() enforces the same two rules
    // itself — that is the one that binds.
    const roleIssue = await roleChangeError(roles, staffRoles(current));
    if (roleIssue) return { error: roleIssue };
  }

  // Management holds staff.assign_roles and nothing else on this form: roles
  // are theirs to set, and salary, commission, status and hours are neither
  // theirs to see nor to change. Everything else the request carried is
  // dropped unread rather than trusted.
  if (scope === "roles") {
    if (!roles) return { error: "No role change was submitted." };
    const { error } = await supabase.rpc("set_staff_roles", { p_staff: staffId, p_roles: roles });
    if (error) return { error: error.message };

    revalidatePath("/admin/staff");
    revalidatePath("/students");
    revalidatePath("/leads");
    revalidateTag("staff-directory", { expire: 0 });
    return { success: true };
  }

  const fields = staffFieldsFromFormData(formData);
  if (!fields.full_name) return { error: "Name is required." };

  // The official email is their sign-in address — changing it moves their
  // login (syncLoginEmail below) — so only a Super Admin may change it. For
  // anyone else the field is read-only on the form; a request that changes
  // it anyway is refused, and one that leaves it as it was simply doesn't
  // write it. 0274 refuses the same change in the database.
  const { staff: editor } = await getStaffSession();
  const editorIsSuperAdmin = !!editor && hasRole(editor, "super_admin");
  if (!editorIsSuperAdmin) {
    const { data: stored } = await supabase.from("staff").select("email_official").eq("id", staffId).maybeSingle();
    if (!stored) return { error: "That staff member no longer exists." };
    const before = (stored.email_official ?? "").trim().toLowerCase();
    const after = (fields.email_official ?? "").trim().toLowerCase();
    if (before !== after) return { error: "Only a Super Admin can change the official email, because it is their sign-in address." };
    delete (fields as { email_official?: string | null }).email_official;
  }

  const dobError = dateOfBirthError(fields.date_of_birth);
  if (dobError) return { error: dobError };
  const phoneIssue = staffPhoneError(fields);
  const hoursIssue = staffHoursError(fields);
  if (hoursIssue) return { error: hoursIssue };
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

      // Deactivating somebody hands their whole caseload to a stand-in. That
      // stand-in is told about each student, which is the case the office
      // most needs the mail for — nobody should discover a caseload by
      // opening the students list one morning.
      for (const l of assignedLeads) await notifyAssignedStaff(l.id);
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
      // Handed back on reactivation. They were told about this student once
      // before, so the notice table keeps this quiet — which is right: it is
      // their own student returning, not news.
      await notifyAssignedStaff(entry.student_id);
      restoredCount++;
    }
  }

  const loginSync = editorIsSuperAdmin ? await syncLoginEmail(staffId, fields.email_official) : {};
  if (loginSync.error) return { error: loginSync.error };

  // Selected back because an UPDATE that RLS refuses raises nothing — it
  // matches no rows and reads as success. Staff rows are written by a Super
  // Admin only (staff_write), so a staff.manage grant to anyone else would
  // otherwise report "Saved" over a change that never happened.
  const { data: written, error } = await supabase.from("staff").update(fields).eq("id", staffId).select("id");
  if (error || !written?.length) {
    await loginSync.revert?.();
    return { error: error?.message ?? "These details weren't saved: only a Super Admin can change a staff member's record." };
  }

  const payError = await savePay(supabase, staffId, formData);
  if (payError) return { error: payError };

  // Roles go through the same function Management uses, rather than being
  // folded into the update above — so the "at least one role" and "Super Admin
  // grants Super Admin" rules are applied by one piece of code on every path,
  // including a staff.manage granted to some other role by an override.
  if (roles) {
    const { error: roleError } = await supabase.rpc("set_staff_roles", { p_staff: staffId, p_roles: roles });
    if (roleError) return { error: roleError.message };
  }

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

  const file = await uploadedFile(formData, "file");
  if (!file || file.size === 0) return { error: "Choose a photo to upload." };
  if (!file.type.startsWith("image/")) return { error: "Choose an image file." };
  // 500 KB for a photo. The browser resizes an oversized one before it gets
  // here, so this is the backstop for a request that skipped that.
  const tooLarge = fileSizeError(file.size, MAX_PHOTO_BYTES, "photo");
  if (tooLarge) return { error: tooLarge };

  const { data: existing } = await supabase.from("staff").select("photo_path").eq("id", staffId).maybeSingle();

  const path = `staff-photos/${staffId}/photo-${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { upsert: true });
  if (uploadError) return { error: uploadError.message };

  const { error } = await supabase.from("staff").update({ photo_path: path }).eq("id", staffId);
  if (error) return { error: error.message };

  // The one it replaced. Paths are timestamped, so without this every photo a
  // staff member has ever had stays in the bucket with nothing pointing at it.
  if (existing?.photo_path && existing.photo_path !== path) {
    await supabase.storage.from("documents").remove([existing.photo_path]);
  }

  revalidatePath("/admin/staff");
  revalidateTag("staff-directory", { expire: 0 });
  return { success: true };
}

/**
 * Removes a staff member's photo.
 *
 * Super Admin only, the same as setting one — staff.manage here, and
 * documents_storage_staff_photos_write restricts the bucket to a super admin
 * underneath, so a staff member cannot remove their own or anyone else's.
 */
export async function deleteStaffPhoto(staffId: string) {
  const supabase = await createClient();
  const denied = await requirePermission("staff.manage", "Only Super Admin can remove a staff member's photo.");
  if (denied) return { error: denied.error };

  const { data: staffRow } = await supabase.from("staff").select("photo_path").eq("id", staffId).maybeSingle();
  if (!staffRow?.photo_path) return { error: "There is no photo to remove." };

  // The row first: a bucket with no photo and a row still pointing at one is a
  // broken avatar everywhere the directory is shown.
  const { error } = await supabase.from("staff").update({ photo_path: null }).eq("id", staffId);
  if (error) return { error: error.message };

  await supabase.storage.from("documents").remove([staffRow.photo_path]);

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
  const proofFile = await uploadedFile(formData, "proof_of_payment");
  if (proofFile && proofFile.size > 0) {
    const proofTooLarge = fileSizeError(proofFile.size, undefined, "file");
    if (proofTooLarge) return { error: `${proofTooLarge} ${reduceHint(proofFile.type, proofFile.name) ?? ""}`.trim() };
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

// ======================================================= staff login credentials
//
// A Super Admin issues a staff member's login: a generated password, their
// official email as the username, a copy kept encrypted for the Super Admin to
// reveal later (0270), and the same details mailed to that official address.
// Staff cannot change their own password, so what is issued here is what they
// keep until a Super Admin issues another.
//
// Super Admin only, by role — not by the staff.manage permission, which an
// override can grant to other roles. Handing someone a colleague's password is
// not the same kind of thing as editing their phone number. The database
// functions check the same thing again, and theirs is the check that binds.

type StaffLoginResult =
  | { error: string; success?: undefined }
  | { success: true; error?: undefined; email: string; password: string; emailed: boolean; warning?: string };

async function superAdminActor() {
  const { staff } = await getStaffSession();
  return staff && hasRole(staff, "super_admin") ? staff : null;
}

/**
 * Mails a staff member their login. Never fails the action that called it:
 * the login already works, and the Super Admin has it on screen — a mail that
 * did not go is a warning to pass it on by hand, not a failure.
 */
async function mailStaffLogin(data: Omit<StaffLoginEmailData, "loginUrl">): Promise<string | null> {
  const payload: StaffLoginEmailData = { ...data, loginUrl: `${getSiteUrl()}/login` };
  const sent = await sendEmail({
    to: data.email,
    subject: staffLoginSubject(payload),
    text: staffLoginText(payload),
    html: staffLoginHtml(payload),
  });
  return sent && "error" in sent && sent.error ? String(sent.error) : null;
}

/**
 * Issues new login credentials for a staff member.
 *
 * In this order, because each step is only worth doing once the one before it
 * has worked: the auth account gets the new password (and their official
 * email as its login), then their other sessions are ended, then the copy is
 * stored, then the mail goes. A failure part-way says exactly what happened.
 */
export async function issueStaffCredentials(staffId: string): Promise<StaffLoginResult> {
  const actor = await superAdminActor();
  if (!actor) return { error: "Only a Super Admin can issue login credentials." };

  const supabase = await createClient();
  const { data: member } = await supabase
    .from("staff")
    .select("id, full_name, email_official, status")
    .eq("id", staffId)
    .maybeSingle();
  if (!member) return { error: "That staff member no longer exists." };
  if (member.status !== "active") {
    return { error: "Their account isn't active, so they couldn't sign in with it. Set them to Active first." };
  }
  const email = (member.email_official ?? "").trim();
  if (!email) return { error: "Add their official email first — it's the email they sign in with." };

  const password = generatePassword();
  const admin = createAdminClient();
  const { error: authError } = await admin.auth.admin.updateUserById(staffId, {
    email,
    password,
    email_confirm: true,
  });
  if (authError) {
    return {
      error: /already|registered|exists/i.test(authError.message)
        ? `${email} is already used by another login (a student or partner account), so it can't be theirs too. Give them a different official email.`
        : authError.message,
    };
  }

  // Everywhere they were signed in — except the Super Admin's own session,
  // when they are reissuing their own login from the page they are on.
  let warning: string | undefined;
  if (staffId !== actor.id) {
    const { error: revokeError } = await supabase.rpc("revoke_staff_sessions", { p_staff_id: staffId });
    if (revokeError) warning = `The new password works, but they may still be signed in elsewhere: ${revokeError.message}`;
  }

  const { error: storeError } = await supabase.rpc("store_staff_login", {
    p_staff_id: staffId,
    p_plaintext: JSON.stringify({ username: email, password }),
  });
  if (storeError) {
    warning = [warning, "A copy couldn't be kept, so Reveal won't show this password later — copy it down now."]
      .filter(Boolean)
      .join(" ");
  }

  const mailError = await mailStaffLogin({
    staffName: member.full_name,
    email,
    password,
    issuedBy: actor.full_name,
    reason: "reissued",
  });

  revalidatePath("/admin/staff");
  return {
    success: true,
    email,
    password,
    emailed: !mailError,
    ...(warning || mailError
      ? { warning: [warning, mailError ? `The email didn't go (${mailError}) — pass these on yourself.` : null].filter(Boolean).join(" ") }
      : {}),
  };
}

/** The stored copy of a staff member's login, for a Super Admin. Null when none was kept. */
export async function revealStaffCredentials(
  staffId: string
): Promise<{ error: string } | { success: true; credentials: { email: string; password: string; issuedAt: string; issuedBy: string | null } | null }> {
  if (!(await superAdminActor())) return { error: "Only a Super Admin can see login credentials." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("read_staff_login", { p_staff_id: staffId });
  if (error) return { error: error.message };
  const row = (data as { plaintext: string; updated_at: string; updated_by_name: string | null }[] | null)?.[0];
  if (!row) return { success: true, credentials: null };

  const parsed = JSON.parse(row.plaintext) as { username: string; password: string };
  // The email they sign in with today. The stored copy keeps the one it was
  // issued with, which an edit to their official email has since moved on.
  const { data: authUser } = await createAdminClient().auth.admin.getUserById(staffId);
  return {
    success: true,
    credentials: {
      email: authUser?.user?.email ?? parsed.username,
      password: parsed.password,
      issuedAt: row.updated_at,
      issuedBy: row.updated_by_name,
    },
  };
}
