"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

  const { error } = await supabase.from("partner_university_accounts").insert({
    id: data.user.id,
    university_id,
    staff_name,
  });

  if (error) return { error: error.message };

  redirect("/");
}
