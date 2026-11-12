import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkCronRequest } from "@/lib/cronAuth";
import { runSunsetDaily } from "@/lib/emailCampaigns/sunset";

// Daily, at 03:30 Karachi (vercel.json): the sunset policy's automatic mode
// (0362) — stops emailing whoever stayed silent after a re-engagement email
// once the grace period is over, then starts the next round if anyone has
// gone silent since. In "confirm" mode it does nothing: staff take each step
// from Audience › Sunset.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const auth = checkCronRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const summary = await runSunsetDaily(createAdminClient());
  return NextResponse.json({ ok: true, ...summary });
}
