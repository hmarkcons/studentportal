import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { unsubscribeByToken } from "@/lib/emailCampaigns/subscription";

// One-click unsubscribe (RFC 8058): the address in every campaign email's
// List-Unsubscribe header, with List-Unsubscribe-Post: List-Unsubscribe=One-Click.
// A mail client POSTs here when the person presses its own "Unsubscribe"
// button; it must act at once and answer 200 — no redirect, no page.
//
// A GET (someone pasting the address into a browser) goes to the confirming page.
export async function POST(_request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const done = await unsubscribeByToken(createAdminClient(), token, "Unsubscribed with the mail app's one-click unsubscribe");
  return new NextResponse(done ? "Unsubscribed." : "Unknown link.", { status: done ? 200 : 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  return NextResponse.redirect(new URL(`/email/unsubscribe/${encodeURIComponent(token)}`, request.url));
}
