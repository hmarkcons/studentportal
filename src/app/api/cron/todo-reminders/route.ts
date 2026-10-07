import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkCronRequest } from "@/lib/cronAuth";
import { isEmailConfigured } from "@/lib/email";
import { sendReminders } from "@/lib/todoReminders";
import { deliversEmail } from "@/lib/notificationDelivery";

// Daily, at nine in Karachi (vercel.json): a reminder by email of each kind of
// thing still to do — documents to upload, an agreement to sign, follow-ups
// due, students waiting on a reply — each kind to each person at most once per
// its spell (src/lib/todoReminders.ts). ?dry=1 says what it would send, and
// needs the cron secret, since it names who.
export async function GET(request: NextRequest) {
  const dryRun = request.nextUrl.searchParams.get("dry") === "1";
  const auth = checkCronRequest(request, { dryRun });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  // A local server shares the live database: it would remind real people.
  if (!dryRun && !deliversEmail()) return NextResponse.json({ sent: 0, note: "not a deployment: reminders are emailed only from Vercel" });
  if (!dryRun && !isEmailConfigured()) return NextResponse.json({ error: "Email is not configured." }, { status: 500 });

  const result = await sendReminders(createAdminClient(), { dryRun });
  return NextResponse.json({ ...result, ...(auth.warning ? { warning: auth.warning } : {}) });
}
