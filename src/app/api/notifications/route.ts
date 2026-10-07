import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadBellFeed } from "@/lib/notificationFeed";

// The bell's feed (NotificationBell): the signed-in person's to-dos and news.
// A route rather than a server action, because the bell asks every minute or
// two and a server action would queue the person's own saves behind it.

export async function GET() {
  const feed = await loadBellFeed();
  if (!feed) return NextResponse.json({ error: "Signed out." }, { status: 401 });
  return NextResponse.json(feed, { headers: { "Cache-Control": "no-store" } });
}

/** Marks the caller's own alerts read: `ids`, or every one when none are named. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const body = (await request.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? body.ids.filter((i): i is string => typeof i === "string" && /^[0-9a-f-]{36}$/i.test(i)) : null;
  const { data, error } = await supabase.rpc("mark_notifications_read", { p_ids: ids && ids.length ? ids : null });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ marked: data ?? 0 });
}
