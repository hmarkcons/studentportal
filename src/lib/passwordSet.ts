import "server-only";
import { createClient } from "@/lib/supabase/server";

// What every "set a password" action does once the password itself has
// changed — the staff, partner (actions/admin.ts) and student
// (actions/portal.ts) ones alike. Not in either action file: everything a
// "use server" file exports becomes an action anyone can call.

export type PasswordSetResult =
  | { error: string; success?: undefined }
  | { success: true; error?: undefined; email: string; password: string; emailed: boolean; warning?: string };

/** The auth server's refusal, said for the person who typed it. */
export function passwordRefusal(message: string): string {
  if (/weak|easy to guess|pwned|breach/i.test(message)) return "That password is on lists of leaked passwords — choose another, or generate one.";
  if (/same.*(old|previous|current)|different from the old/i.test(message)) return "That's already their password — choose a different one.";
  return message;
}

/**
 * Signs the Super Admin back in, after they changed their own password.
 *
 * The auth server ends every session a user has when an admin changes their
 * password — the one making the change included (measured: the access token
 * reads "Auth session missing" and the refresh token is gone). So setting your
 * own password from the Login panel signed you out of the page you set it on.
 * Signing in again with the new password, in the same request, writes a fresh
 * session to the cookies before the page reloads. Call it last: the steps
 * before it still run on the old token, which PostgREST honours until it
 * expires, and revoke_user_sessions would otherwise end the new session too.
 */
export async function staySignedIn(email: string, password: string): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? `Your password is set, but you'll need to sign in again with it (${error.message}).` : null;
}

/** Sign-out, kept copy and mail, after the password has changed. Warnings only. */
export async function finishPasswordSet(steps: {
  signOut: () => PromiseLike<{ error: { message: string } | null }>;
  keepCopy: () => PromiseLike<{ error: { message: string } | null }>;
  mail: () => Promise<string | null>;
}): Promise<{ emailed: boolean; warning?: string }> {
  const warnings: string[] = [];
  const { error: signOutError } = await steps.signOut();
  if (signOutError) warnings.push(`The new password works, but they may still be signed in elsewhere: ${signOutError.message}`);
  const { error: copyError } = await steps.keepCopy();
  if (copyError) warnings.push("A copy couldn't be kept, so Reveal won't show this password later — copy it down now.");
  const mailError = await steps.mail();
  if (mailError) warnings.push(`The email didn't go (${mailError}) — pass the password on yourself.`);
  return { emailed: !mailError, ...(warnings.length ? { warning: warnings.join(" ") } : {}) };
}

