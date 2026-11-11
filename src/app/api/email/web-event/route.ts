import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordWebEvent, requestFacts, type WebEvent } from "@/lib/emailCampaigns/trackingServer";

// What /hmark-track.js on hmarkconsultants.com reports: a page view, or a
// conversion (an enquiry form sent, the WhatsApp button, …), from someone who
// arrived through a campaign's link (their hm_rid). Only HMARK's own website
// may call it. The body is sent as text/plain so the browser needs no
// preflight; it is JSON all the same.

const ALLOWED = /^https:\/\/([a-z0-9-]+\.)?hmarkconsultants\.com$/i;

function cors(origin: string | null): Record<string, string> {
  return origin && ALLOWED.test(origin) && !/^https:\/\/portal\./i.test(origin)
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" }
    : {};
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(request.headers.get("origin")) });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = cors(origin);
  // sendBeacon may omit Origin; the page's own address is then checked instead.
  let body: Record<string, unknown>;
  try {
    body = JSON.parse((await request.text()).slice(0, 4000));
  } catch {
    return new NextResponse(null, { status: 400, headers });
  }
  const url = String(body.url ?? "").slice(0, 1000);
  let site: URL;
  try {
    site = new URL(url);
  } catch {
    return new NextResponse(null, { status: 400, headers });
  }
  if (!ALLOWED.test(site.origin) || /^portal\./i.test(site.hostname) || (origin && !headers["Access-Control-Allow-Origin"])) {
    return new NextResponse(null, { status: 403, headers });
  }
  const type = body.type === "conversion" ? "conversion" : body.type === "page_view" ? "page_view" : null;
  const rid = String(body.rid ?? "");
  const sid = String(body.sid ?? "").slice(0, 64);
  const name = body.name == null ? null : String(body.name);
  if (!type || !/^[0-9a-f]{32}$/.test(rid) || !/^[A-Za-z0-9_-]{1,64}$/.test(sid) || (type === "conversion" && !/^[a-z0-9_]{1,40}$/.test(name ?? ""))) {
    return new NextResponse(null, { status: 400, headers });
  }
  const admin = createAdminClient();
  const { data: settings } = await admin.from("email_settings").select("conversion_events").eq("id", true).maybeSingle();
  const labels = Object.fromEntries(
    (Array.isArray(settings?.conversion_events) ? (settings!.conversion_events as { key?: string; label?: string }[]) : [])
      .filter((c) => c.key)
      .map((c) => [c.key as string, (c.label as string) ?? (c.key as string)])
  );
  const event: WebEvent = { rid, sid, type, name, url, ref: body.ref ? String(body.ref).slice(0, 1000) : null };
  await recordWebEvent(admin, event, requestFacts(request.headers), labels);
  return new NextResponse(null, { status: 204, headers });
}
