import { NextRequest, NextResponse } from "next/server";
import { checkCronRequest } from "@/lib/cronAuth";
import { sendCalendarReminders } from "@/lib/calendarUpcoming";

// Daily (vercel.json), at nine in the morning in Karachi: everyone is emailed
// what is on their calendar tomorrow — interviews, instalments due, follow-ups,
// documents to upload, deadlines, events they were invited to
// (src/lib/calendarUpcoming.ts). The hour-before reminders go from the
// ten-minute run, /api/cron/notifications.
//
// ?mode=soon runs the hour-before reminders on their own; ?dry=1 says who
// would be written to about what, and sends nothing (it needs CRON_SECRET).
export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const dryRun = params.get("dry") === "1";
  const auth = checkCronRequest(request, { dryRun });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const mode = params.get("mode") === "soon" ? "soon" : "tomorrow";
  const result = await sendCalendarReminders(mode, { dryRun });
  return NextResponse.json({ ...result, ...(auth.warning ? { warning: auth.warning } : {}) });
}
