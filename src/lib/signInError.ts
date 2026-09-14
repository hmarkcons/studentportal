/**
 * What to tell someone whose sign-in failed.
 *
 * Supabase returns several very different failures through one error object,
 * and the login page called all of them "Incorrect email or password." A user
 * who typed their password correctly then spends the afternoon resetting a
 * password that was never the problem — and because every sign-in on the
 * portal goes out through the host's shared address, the whole office shares
 * one rate-limit bucket: once it is hit, everybody is told their password is
 * wrong at the same time.
 *
 * Wrong credentials keep the vague wording on purpose. Saying which half was
 * wrong tells whoever is guessing whether an email address is registered here.
 */
export function signInErrorMessage(error: { status?: number; code?: string; message?: string } | null): string | null {
  if (!error) return null;

  const code = (error.code ?? "").toLowerCase();
  const message = (error.message ?? "").toLowerCase();
  const status = error.status;

  if (status === 429 || code.includes("rate_limit") || message.includes("rate limit")) {
    return "Too many sign-in attempts have been made recently. Wait a few minutes and try again — this is not about your password.";
  }
  if (code === "email_not_confirmed" || message.includes("not confirmed")) {
    return "This account has not been activated yet. Ask the office to activate it for you.";
  }
  if (code === "user_banned" || message.includes("banned")) {
    return "This account is suspended. Please contact the office.";
  }
  // No status at all is a fetch that never arrived, not a rejected password.
  if (status === undefined || status >= 500) {
    return "Sign-in is temporarily unavailable. Please try again in a moment.";
  }
  return "Incorrect email or password.";
}
