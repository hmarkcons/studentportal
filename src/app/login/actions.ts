"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signIn(_prevState: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Incorrect email or password." };
  }

  // Only ever redirect to a same-origin relative path (e.g. back to a
  // scanned QR check-in link) — never follow an absolute/protocol-relative
  // "next" value, which would be an open redirect.
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}
