"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signInErrorMessage, WRONG_CREDENTIALS } from "@/lib/signInError";
import { isStudentIdentifier, normaliseStudentId } from "@/lib/loginScreen";
import { SESSION_ONLY_COOKIE } from "@/lib/sessionCookies";

/**
 * The login email behind a Student ID, or null.
 *
 * Looked up with the service role and never sent back to the browser: the
 * Student ID is printed on things a student hands around, and turning one into
 * an email address for anyone who asks would be a directory of students. The
 * email is the sign-in account's own, which is not always the one on the
 * lead — a counsellor can create the portal login under a different address.
 */
async function emailForStudentId(identifier: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: lead } = await admin
    .from("leads")
    .select("auth_user_id")
    .eq("student_code", normaliseStudentId(identifier))
    .not("auth_user_id", "is", null)
    .maybeSingle();
  if (!lead?.auth_user_id) return null;
  const { data } = await admin.auth.admin.getUserById(lead.auth_user_id as string);
  return data.user?.email ?? null;
}

export async function signIn(_prevState: unknown, formData: FormData) {
  // "email" is the field's name for the checks and password managers that
  // look for it; on the Student tab it holds a Student ID as often as not.
  const identifier = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");
  const remember = formData.get("remember") === "on";
  const byStudentId = isStudentIdentifier(identifier);
  // One answer whether the ID exists or the password is wrong, so the page
  // cannot be used to find out which Student IDs are real.
  const refused = byStudentId ? "That Student ID or password isn't right." : "Incorrect email or password.";

  if (!identifier || !password) return { error: "Enter your details and your password." };

  const email = byStudentId ? await emailForStudentId(identifier) : identifier;
  if (!email) return { error: refused };

  // Decided before signing in, because the session cookies are written by the
  // sign-in itself: without "Keep me signed in" they carry no expiry and go
  // when the browser closes (sessionCookies.ts).
  const cookieStore = await cookies();
  if (remember) cookieStore.delete(SESSION_ONLY_COOKIE);
  else cookieStore.set(SESSION_ONLY_COOKIE, "1", { path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production", httpOnly: false });

  const supabase = await createClient({ sessionOnly: !remember });
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Logged server-side because the message the user gets is deliberately
    // vague, and "incorrect password" for what was actually a rate limit is
    // otherwise invisible to anyone trying to work out why nobody can log in.
    console.error("[signIn] failed", { status: error.status, code: error.code, message: error.message, byStudentId });
    // Wrong credentials on a Student ID get the words an unknown Student ID
    // gets, or the difference between the two would say which IDs are real.
    const said = signInErrorMessage(error);
    return { error: !said || said === WRONG_CREDENTIALS ? refused : said };
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
