import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderForRecipient } from "@/lib/emailCampaigns/render";
import { recipientTokenOf } from "@/lib/emailCampaigns/tracking";
import { getSiteUrl } from "@/lib/siteUrl";
import type { MergeValues } from "@/lib/emailCampaigns/mergeTags";

// "View in browser": a sent email as its recipient got it, with no open pixel
// (reading it here is not an open). Public — the token is the proof — and
// served under a sandbox policy, so nothing in it can run.
export async function GET(_request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const token = recipientTokenOf((await ctx.params).token);
  const notFound = () => new Response("This email could not be found.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  if (!token) return notFound();
  const admin = createAdminClient();
  const { data: r } = await admin.from("email_campaign_recipients").select("id, campaign_id, email, merge_values").eq("token", token).maybeSingle();
  if (!r) return notFound();
  const [{ data: c }, { data: address }] = await Promise.all([
    admin.from("email_campaigns").select("prepared_html, prepared_text").eq("id", r.campaign_id).maybeSingle(),
    admin.from("email_contact_status").select("token").eq("email", r.email).maybeSingle(),
  ]);
  if (!c?.prepared_html) return notFound();
  const { html } = renderForRecipient({
    preparedHtml: c.prepared_html as string,
    text: (c.prepared_text as string) ?? "",
    values: (r.merge_values ?? {}) as MergeValues,
    links: { site: getSiteUrl(), recipientToken: token, addressToken: (address?.token as string) ?? "" },
    campaignId: r.campaign_id as string,
    recipientId: r.id as string,
    forWeb: true,
  });
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "sandbox allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation; script-src 'none'",
      "X-Robots-Tag": "noindex",
      "Cache-Control": "private, no-store",
    },
  });
}
