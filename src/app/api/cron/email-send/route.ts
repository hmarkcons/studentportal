import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkCronRequest } from "@/lib/cronAuth";
import { sendDueEmails } from "@/lib/emailCampaigns/sender";

// Every minute (vercel.json): starts email campaigns whose scheduled time has
// come and sends the queue, a batch at the configured speed, stopping with
// ten seconds to spare so a run never overlaps the next one's start.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = checkCronRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const summary = await sendDueEmails(createAdminClient(), { deadline: Date.now() + 45_000 });
  return NextResponse.json({ ok: true, ...summary });
}
