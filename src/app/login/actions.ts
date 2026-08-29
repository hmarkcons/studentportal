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

  redirect(safeNextPath(next));
}

// Only ever redirect to a same-origin relative path (e.g. back to a
// scanned QR check-in link) — never follow an absolute/protocol-relative
// "next" value, which would be an open redirect. A plain
// `next.startsWith("/") && !next.startsWith("//")` check is NOT enough:
// browsers normalize a leading "/\" the same way as "//" per the WHATWG
// URL spec (treating it as a new authority for http/https), so
// `/\evil.com` would pass that check yet still navigate off-site.
// Parsing with URL and comparing the resolved origin catches this and any
// other such normalization quirk in one check, and reconstructing the
// path from the parsed result (rather than trusting the raw string)
// neutralizes whatever the parser already normalized away.
function safeNextPath(next: string): string {
  try {
    const url = new URL(next, "http://same-origin.invalid");
    if (url.origin !== "http://same-origin.invalid") return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
