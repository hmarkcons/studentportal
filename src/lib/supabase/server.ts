import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SESSION_ONLY_COOKIE, sessionOnlyCookieOptions } from "@/lib/sessionCookies";

/**
 * The signed-in user's client.
 *
 * `sessionOnly` is for the sign-in itself, which decides it from "Keep me
 * signed in" before the marker cookie exists; everywhere else it is read from
 * the marker, so a token refreshed in a server action stays a session cookie
 * for someone who asked not to be remembered (sessionCookies.ts).
 */
export async function createClient({ sessionOnly }: { sessionOnly?: boolean } = {}) {
  const cookieStore = await cookies();
  const shortLived = sessionOnly ?? Boolean(cookieStore.get(SESSION_ONLY_COOKIE));

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, shortLived ? sessionOnlyCookieOptions(options) : options)
            );
          } catch {
            // Called from a Server Component — a proxy running on every
            // request refreshes the session instead, so this is safe to ignore.
          }
        },
      },
    }
  );
}
