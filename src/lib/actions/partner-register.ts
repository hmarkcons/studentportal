"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function registerPartnerAccount(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const staff_name = String(formData.get("staff_name") ?? "").trim();
  const university_id = String(formData.get("university_id") ?? "");

  if (!email || !password || !staff_name || !university_id) {
    return { error: "All fields are required." };
  }

  const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
  if (signUpError || !data.user) {
    return { error: signUpError?.message ?? "Could not create the account." };
  }

  // If email confirmation is required, signUp() returns no session — the
  // anon-key client has no auth.uid(), so the RLS-checked insert below would
  // be rejected. Use the service-role client for this one insert instead;
  // data.user.id is already a verified real signUp result at this point.
  const admin = createAdminClient();
  const { error } = await admin.from("partner_university_accounts").insert({
    id: data.user.id,
    university_id,
    staff_name,
  });

  if (error) {
    await admin.auth.admin.deleteUser(data.user.id).catch(() => {});
    return { error: error.message };
  }

  if (!data.session) {
    return {
      success: "Account created. Check your email to confirm your address, then sign in — HMARK will review and approve your access.",
    };
  }

  redirect("/");
}
