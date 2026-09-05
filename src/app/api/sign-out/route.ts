import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// A plain Route Handler, not a Server Action — see SignOutButton.tsx for why:
// this keeps sign-out out of the Server Actions bundle entirely, so it can
// never collide with another page's own action reference.
export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.json({ success: true });
}
