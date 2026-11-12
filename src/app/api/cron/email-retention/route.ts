import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkCronRequest } from "@/lib/cronAuth";

// Daily, at 03:15 Karachi (vercel.json): clears the browser string and city
// of every open and click older than Settings › Sending › "keep for … months"
// (0361). The counts, device, mail app and country stay, so every report
// still adds up; 0 months keeps everything.
export async function GET(request: NextRequest) {
  const auth = checkCronRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = createAdminClient();
  const { data: settings } = await admin.from("email_settings").select("retention_months").eq("id", true).maybeSingle();
  const months = Number(settings?.retention_months ?? 12);
  const { data, error } = await admin.rpc("email_purge_event_details", { p_months: months });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const row = ((data ?? []) as { events?: number; recipients?: number }[])[0] ?? {};
  return NextResponse.json({ ok: true, months, events: Number(row.events ?? 0), recipients: Number(row.recipients ?? 0) });
}
