import { after, NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recipientTokenOf } from "@/lib/emailCampaigns/tracking";
import { clickTarget, recordClick, requestFacts } from "@/lib/emailCampaigns/trackingServer";

// A tracked link: /api/email/c/<recipient token>?l=<link number>. Sends the
// person to the URL the campaign stored for that number (with its UTM tags),
// then records the click. An unknown token or link goes to HMARK's website —
// never to an address taken from the request, so this cannot be used to
// redirect anyone anywhere.
const FALLBACK = "https://hmarkconsultants.com/";

export async function GET(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const token = recipientTokenOf((await ctx.params).token);
  const position = Number(request.nextUrl.searchParams.get("l"));
  if (!token || !Number.isInteger(position) || position < 1) return NextResponse.redirect(FALLBACK, 302);
  const admin = createAdminClient();
  const target = await clickTarget(admin, token, position);
  if (!target) return NextResponse.redirect(FALLBACK, 302);
  const facts = requestFacts(request.headers);
  after(() => recordClick(createAdminClient(), target, facts).catch(() => {}));
  const res = NextResponse.redirect(target.url, 302);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
