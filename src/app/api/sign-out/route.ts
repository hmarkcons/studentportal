import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { SESSION_ONLY_COOKIE } from "@/lib/sessionCookies";

// A plain Route Handler, not a Server Action — see SignOutButton.tsx for why:
// this keeps sign-out out of the Server Actions bundle entirely, so it can
// never collide with another page's own action reference.
export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // The "not kept signed in" marker belongs to the session just ended.
  (await cookies()).delete(SESSION_ONLY_COOKIE);
  return NextResponse.json({ success: true });
}
