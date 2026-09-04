"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%";
  const bytes = randomBytes(20);
  let pw = "";
  for (let i = 0; i < 20; i++) pw += chars[bytes[i] % chars.length];
  return pw;
}

export async function inviteStudentToPortal(studentId: string, _prevState: unknown, _formData: FormData) {
  const supabase = await createClient();

  // Fetch through the RLS-respecting client first — if this returns nothing,
  // the caller isn't authorized to manage this student, and we stop here
  // rather than trusting the admin client's elevated access.
  const { data: student, error } = await supabase
    .from("students")
    .select("id, email, auth_user_id")
    .eq("id", studentId)
    .maybeSingle();

  if (error || !student) {
    return { error: "Not found or not authorized." };
  }
  if (!student.email) {
    return { error: "Add an email address for this student before creating portal access." };
  }
  if (student.auth_user_id) {
    return { error: "Portal access is already enabled for this student." };
  }

  const password = generatePassword();
  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: student.email,
    password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    return { error: createError?.message ?? "Could not create the portal account." };
  }

  const { error: linkError } = await supabase
    .from("students")
    .update({ auth_user_id: created.user.id })
    .eq("id", studentId);

  if (linkError) {
    return { error: linkError.message };
  }

  const { error: storeError } = await supabase.rpc("store_credential", {
    p_owner_type: "student",
    p_owner_id: studentId,
    p_credential_type: "portal_login",
    p_plaintext: JSON.stringify({ username: student.email, password }),
  });

  revalidatePath(`/students/${studentId}`, "layout");
  // The portal account itself is already created and usable — this is a
  // best-effort copy for later retrieval, so a failure here doesn't fail the
  // whole action, but staff need to know the password below won't be
  // revealable again if they don't copy it down now.
  return {
    success: true,
    email: student.email,
    password,
    warning: storeError ? "Couldn't save a retrievable copy of this password — copy it down now, it won't be revealable later." : undefined,
  };
}

export async function resetStudentPortalPassword(studentId: string, _prevState: unknown, _formData: FormData) {
  const supabase = await createClient();

  const { data: student, error } = await supabase
    .from("students")
    .select("id, email, auth_user_id")
    .eq("id", studentId)
    .maybeSingle();

  if (error || !student?.auth_user_id) {
    return { error: "Portal access isn't enabled for this student yet." };
  }

  const password = generatePassword();
  const admin = createAdminClient();
  const { error: updateError } = await admin.auth.admin.updateUserById(student.auth_user_id, { password });

  if (updateError) {
    return { error: updateError.message };
  }

  const { error: storeError } = await supabase.rpc("store_credential", {
    p_owner_type: "student",
    p_owner_id: studentId,
    p_credential_type: "portal_login",
    p_plaintext: JSON.stringify({ username: student.email ?? "", password }),
  });

  revalidatePath(`/students/${studentId}`, "layout");
  return {
    success: true,
    password,
    warning: storeError ? "Couldn't save a retrievable copy of this password — copy it down now, it won't be revealable later." : undefined,
  };
}

async function requireSuperAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
  if (staffRow?.role !== "super_admin") return "Only Super Admin can manage a student's portal access.";
  return null;
}

// Suspend keeps the login (auth_user_id, stored credentials) intact but
// flips portal_active off — the (student) layout redirects anyone with
// portal_active=false straight to "/", so this blocks access immediately
// without destroying anything, unlike Delete below.
export async function suspendStudentPortalAccess(studentId: string) {
  const supabase = await createClient();
  const denied = await requireSuperAdmin(supabase);
  if (denied) return { error: denied };

  const { data: student } = await supabase.from("students").select("auth_user_id").eq("id", studentId).maybeSingle();
  if (!student?.auth_user_id) return { error: "Portal access isn't enabled for this student yet." };

  const { error } = await supabase.from("leads").update({ portal_active: false }).eq("id", studentId);
  if (error) return { error: error.message };

  revalidatePath(`/students/${studentId}`, "layout");
  return { success: true };
}

export async function activateStudentPortalAccess(studentId: string) {
  const supabase = await createClient();
  const denied = await requireSuperAdmin(supabase);
  if (denied) return { error: denied };

  const { data: student } = await supabase.from("students").select("auth_user_id").eq("id", studentId).maybeSingle();
  if (!student?.auth_user_id) return { error: "This student has no portal login to activate — create one first." };

  const { error } = await supabase.from("leads").update({ portal_active: true }).eq("id", studentId);
  if (error) return { error: error.message };

  revalidatePath(`/students/${studentId}`, "layout");
  return { success: true };
}

// Delete fully removes the portal login itself — the auth user, the
// student's link to it, and the saved portal_login credential — while
// leaving the student record and their other stored credentials (Gmail,
// university portal, ...) untouched. Staff can always re-create a fresh
// portal login afterward via "Create portal login".
export async function deleteStudentPortalAccess(studentId: string) {
  const supabase = await createClient();
  const denied = await requireSuperAdmin(supabase);
  if (denied) return { error: denied };

  const { data: student } = await supabase.from("students").select("auth_user_id").eq("id", studentId).maybeSingle();
  if (!student?.auth_user_id) return { error: "Portal access isn't enabled for this student." };

  const { error } = await supabase.from("leads").update({ auth_user_id: null, portal_active: false }).eq("id", studentId);
  if (error) return { error: error.message };

  await supabase.rpc("delete_credential", { p_owner_type: "student", p_owner_id: studentId, p_credential_type: "portal_login" });

  const admin = createAdminClient();
  await admin.auth.admin.deleteUser(student.auth_user_id).catch(() => {});

  revalidatePath(`/students/${studentId}`, "layout");
  return { success: true };
}
