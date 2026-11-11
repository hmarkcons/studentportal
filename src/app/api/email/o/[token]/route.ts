import { after, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PIXEL_GIF, recipientTokenOf } from "@/lib/emailCampaigns/tracking";
import { recordOpen, requestFacts } from "@/lib/emailCampaigns/trackingServer";

// The open pixel: /api/email/o/<recipient token>.gif. Answers at once with a
// transparent 1×1 GIF that must never be cached, and records the open after
// the answer has gone, so a mail client is never kept waiting.
export async function GET(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const token = recipientTokenOf((await ctx.params).token);
  if (token) {
    const facts = requestFacts(request.headers);
    after(() => recordOpen(createAdminClient(), token, facts).catch(() => {}));
  }
  return new Response(PIXEL_GIF, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
