"use server";

import { hasRole } from "@/lib/auth/roles";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generatePassword } from "@/lib/generatePassword";
import { chosenPasswordError } from "@/lib/passwordPolicy";
import { finishPasswordSet, passwordRefusal, type PasswordSetResult } from "@/lib/passwordSet";
import { sendEmail } from "@/lib/email";
import { getSiteUrl } from "@/lib/siteUrl";
import { staffLoginHtml, staffLoginSubject, staffLoginText, type StaffLoginEmailData } from "@/lib/staffLoginEmail";


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
  // Only a Super Admin resets or sets a password — setStudentPortalPassword,
  // below, is what the page offers them now.
  const denied = await requireSuperAdmin(supabase);
  if (denied) return { error: "Only a Super Admin can reset a student's password." };

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
  const { data: staffRow } = await supabase.from("staff").select("role, roles").eq("id", user?.id ?? "").maybeSingle();
  if (!hasRole(staffRow, "super_admin")) return "Only Super Admin can manage a student's portal access.";
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

  const { data: student } = await supabase
    .from("students")
    .select("auth_user_id, student_code, intake")
    .eq("id", studentId)
    .maybeSingle();
  if (!student?.auth_user_id) return { error: "This student has no portal login to activate — create one first." };

  // No Student ID, no portal, and no override — the same rule the (student)
  // layout enforces, stated here so the button says why instead of appearing
  // to work and leaving the student bounced back to the landing page.
  //
  // The ID names the intake (0260), so a missing one means the intake is
  // missing. Recording it issues the ID and opens the portal on its own.
  if (!student.student_code) {
    return {
      error: student.intake
        ? "This student has no Student ID yet — their intake is recorded but no country is, so no ID could be composed. Add their country first."
        : "This student has no Student ID yet. Record their intake on their profile and the ID is issued — the portal opens with it.",
    };
  }

  // The same two conditions the DB trigger applies on its own
  // (activate_student_portal_for_agreement, 0253) — enforced here too, since
  // this manual re-activation path doesn't go through that trigger.
  const { data: signedAgreement } = await supabase
    .from("agreements")
    .select("id")
    .eq("student_id", studentId)
    .eq("status", "signed")
    .not("signed_file_path", "is", null)
    .limit(1)
    .maybeSingle();

  // An outstanding e-signature agreement counts as well. The student submits
  // it from inside the portal, so requiring a signed one first would mean a
  // suspended student could never be let back in to do the submitting — the
  // deadlock 0253 exists to remove.
  const { data: awaitingSubmission } = signedAgreement
    ? { data: null }
    : await supabase
        .from("agreements")
        .select("id")
        .eq("student_id", studentId)
        .eq("signing_method", "e_signature")
        .neq("status", "signed")
        .limit(1)
        .maybeSingle();

  if (!signedAgreement && !awaitingSubmission) {
    return { error: "Portal access can only be activated once an agreement has been generated for this student." };
  }

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

/**
 * A student's portal password, as a Super Admin chose it — typed or generated.
 * The student is signed out everywhere, a copy is kept (Reveal credentials, as
 * for every portal login) and they are emailed it, with their Student ID,
 * which they can sign in with too. See finishPasswordSet.
 */
export async function setStudentPortalPassword(studentId: string, password: string): Promise<PasswordSetResult> {
  const supabase = await createClient();
  const denied = await requireSuperAdmin(supabase);
  if (denied) return { error: "Only a Super Admin can set a student's password." };
  const problem = chosenPasswordError(password);
  if (problem) return { error: problem };

  const { data: student } = await supabase
    .from("students")
    .select("id, full_name, email, auth_user_id, student_code")
    .eq("id", studentId)
    .maybeSingle();
  if (!student) return { error: "Not found or not authorized." };
  if (!student.auth_user_id) return { error: "Portal access isn't set up for this student yet — create their portal login first." };

  const admin = createAdminClient();
  const { data: authUser } = await admin.auth.admin.getUserById(student.auth_user_id);
  const email = authUser?.user?.email ?? student.email ?? "";
  const { error: authError } = await admin.auth.admin.updateUserById(student.auth_user_id, { password });
  if (authError) return { error: passwordRefusal(authError.message) };

  const { data: me } = await supabase.auth.getUser();
  const { data: actor } = await supabase.from("staff").select("full_name").eq("id", me.user?.id ?? "").maybeSingle();
  const done = await finishPasswordSet({
    signOut: () => supabase.rpc("revoke_user_sessions", { p_user_id: student.auth_user_id }),
    keepCopy: () =>
      supabase.rpc("store_credential", {
        p_owner_type: "student",
        p_owner_id: studentId,
        p_credential_type: "portal_login",
        p_plaintext: JSON.stringify({ username: email, password }),
      }),
    mail: async () => {
      if (!email) return "the student has no email address";
      const payload: StaffLoginEmailData = {
        staffName: student.full_name ?? "there",
        email,
        password,
        loginUrl: `${getSiteUrl()}/login`,
        issuedBy: actor?.full_name ?? null,
        reason: "password_set",
        audience: "student",
        studentCode: student.student_code ?? null,
      };
      const sent = await sendEmail({ to: email, subject: staffLoginSubject(payload), text: staffLoginText(payload), html: staffLoginHtml(payload) });
      return sent && "error" in sent && sent.error ? String(sent.error) : null;
    },
  });
  revalidatePath(`/students/${studentId}`, "layout");
  return { success: true, email, password, ...done };
}
