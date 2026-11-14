import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkCronRequest } from "@/lib/cronAuth";
import { runJourneys } from "@/lib/emailCampaigns/journeyEngine";

// Every ten minutes (vercel.json): each switched-on automation (0364) takes in
// whoever its trigger now starts for and queues the emails that have fallen
// due; the every-minute sender sends them.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const auth = checkCronRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const summary = await runJourneys(createAdminClient());
  return NextResponse.json({ ok: true, ...summary });
}
