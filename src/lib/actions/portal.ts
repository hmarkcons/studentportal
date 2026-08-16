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

  revalidatePath(`/students/${studentId}`);
  return { success: true, email: student.email, password };
}

export async function resetStudentPortalPassword(studentId: string, _prevState: unknown, _formData: FormData) {
  const supabase = await createClient();

  const { data: student, error } = await supabase
    .from("students")
    .select("id, auth_user_id")
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

  revalidatePath(`/students/${studentId}`);
  return { success: true, password };
}
