import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = { id: string; email: string | null };

/**
 * Who is signed in, for a page, a layout, or a helper they call.
 *
 * Read from the session's own token, verified here against the project's
 * signing key (getClaims — ES256, the key cached for ten minutes across
 * requests), not asked of the auth server again. The proxy has already asked
 * it, for this very request, with getUser — which is what ends a revoked
 * session everywhere — so a second round trip to Sydney for the same answer
 * was one of the waves every page waited on. Server actions that change data
 * keep their own getUser.
 *
 * Cached per request, so a layout and its page share one answer.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
});
