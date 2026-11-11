import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSnsUrl, parseSesEvent, verifySnsMessage, type SnsMessage } from "@/lib/emailCampaigns/providers/sesWebhook";
import { recordEvent } from "@/lib/emailCampaigns/events";
import { bounceReason } from "@/lib/emailCampaigns/sendingRules";

// Amazon SES → SNS → here: what became of each campaign email. Nothing is
// believed until Amazon's signature verifies (sesWebhook.ts); an unsigned or
// forged call is refused. The SNS subscription is confirmed automatically
// the first time. Set SES_SNS_TOPIC_ARN to accept only HMARK's own topic.

const certs = new Map<string, string>();
async function getCert(url: string): Promise<string> {
  const cached = certs.get(url);
  if (cached) return cached;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`certificate ${res.status}`);
  const pem = await res.text();
  certs.set(url, pem);
  return pem;
}

export async function POST(request: NextRequest) {
  let message: SnsMessage;
  try {
    message = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: "not JSON" }, { status: 400 });
  }
  const ok = await verifySnsMessage(message, getCert, process.env.SES_SNS_TOPIC_ARN || null);
  if (!ok) return NextResponse.json({ error: "signature" }, { status: 403 });

  if (message.Type === "SubscriptionConfirmation") {
    if (isSnsUrl(message.SubscribeURL)) await fetch(message.SubscribeURL!, { signal: AbortSignal.timeout(5000) }).catch(() => {});
    return NextResponse.json({ ok: true, confirmed: true });
  }
  if (message.Type !== "Notification") return NextResponse.json({ ok: true });

  const admin = createAdminClient();
  for (const e of parseSesEvent(message.Message)) {
    let query = admin.from("email_campaign_recipients").select("id, campaign_id, email").eq("provider_message_id", e.providerMessageId);
    if (e.recipient) query = query.eq("email", e.recipient);
    const { data: r } = await query.limit(1).maybeSingle();
    if (!r) continue;
    await recordEvent(admin, {
      campaignId: r.campaign_id as string,
      recipientId: r.id as string,
      email: r.email as string,
      type: e.type,
      at: new Date(e.occurredAt),
      providerEventId: e.providerEventId,
      bounceType: e.bounceType ?? null,
      bounceSubType: e.bounceSubType ?? null,
      diagnostic: e.diagnostic ?? null,
      reason: e.type === "hard_bounce" || e.type === "soft_bounce" ? bounceReason(e.bounceType, e.bounceSubType, e.diagnostic) : null,
    }).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
