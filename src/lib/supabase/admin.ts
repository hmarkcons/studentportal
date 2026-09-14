import { createClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS. Server-only; never import from a
// client component. Used solely for auth.admin.* calls (creating/resetting
// a student's portal login), which the anon/session client cannot do.
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
    // Never served from a cache. supabase-js runs on fetch, which Next.js
    // patches: two identical GETs in one render are answered once, and the
    // second caller gets the first one's response even if a write happened in
    // between. This client exists for read-after-write bookkeeping, where that
    // is precisely wrong — it is how every document on a re-registering
    // student was stamped with no intake, 0.6 seconds after the intake was
    // created. Callers should still prefer a write's return value over a
    // re-read; this stops the next person having to know that.
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}
