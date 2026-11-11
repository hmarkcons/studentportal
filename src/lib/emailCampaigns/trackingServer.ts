import type { SupabaseClient } from "@supabase/supabase-js";
import { recordEvent } from "./events";
import { clickDestination, isBotClick, isMachineOpen, parseUserAgent } from "./tracking";

// What the tracking addresses in a sent email do: the open pixel records an
// open, a link records a click and sends the person on, the website script
// records visits and conversions. Each finds the recipient by their private
// token and records through recordEvent, so every source counts the same way.

export type RequestFacts = { userAgent: string | null; country: string | null; city: string | null };

/** What Vercel says about where a request came from. */
export function requestFacts(headers: Headers): RequestFacts {
  let city = headers.get("x-vercel-ip-city");
  try {
    city = city ? decodeURIComponent(city) : null;
  } catch {
    // Left as sent.
  }
  return { userAgent: headers.get("user-agent"), country: headers.get("x-vercel-ip-country"), city };
}

type Recipient = { id: string; campaign_id: string; email: string; sent_at: string | null; status: string; lead_id: string | null };

async function recipientByToken(admin: SupabaseClient, token: string): Promise<Recipient | null> {
  const { data } = await admin
    .from("email_campaign_recipients")
    .select("id, campaign_id, email, sent_at, status, lead_id")
    .eq("token", token)
    .maybeSingle();
  return (data as Recipient | null) ?? null;
}

/** The open pixel was loaded. */
export async function recordOpen(admin: SupabaseClient, token: string, facts: RequestFacts): Promise<void> {
  const r = await recipientByToken(admin, token);
  if (!r || r.status !== "sent") return;
  const at = new Date();
  const { device, client } = parseUserAgent(facts.userAgent);
  await recordEvent(admin, {
    campaignId: r.campaign_id,
    recipientId: r.id,
    email: r.email,
    type: "opened",
    at,
    userAgent: facts.userAgent,
    country: facts.country,
    city: facts.city,
    device,
    client,
    machine: isMachineOpen({ ua: facts.userAgent, sentAt: r.sent_at, openedAt: at }),
  });
}

/**
 * Where a click on link `position` goes, read from the campaign's own links —
 * never from the request, so the address cannot be made to redirect anywhere
 * else. Null for a token or link the portal does not know.
 */
export async function clickTarget(
  admin: SupabaseClient,
  token: string,
  position: number
): Promise<{ url: string; recipient: Recipient; linkId: string; linkUrl: string } | null> {
  const r = await recipientByToken(admin, token);
  if (!r) return null;
  const [{ data: link }, { data: campaign }] = await Promise.all([
    admin.from("email_campaign_links").select("id, url").eq("campaign_id", r.campaign_id).eq("position", position).maybeSingle(),
    admin.from("email_campaigns").select("slug, add_utm").eq("id", r.campaign_id).maybeSingle(),
  ]);
  if (!link || !campaign) return null;
  return {
    url: clickDestination(link.url as string, { utm: Boolean(campaign.add_utm), slug: campaign.slug as string, recipientToken: token }),
    recipient: r,
    linkId: link.id as string,
    linkUrl: link.url as string,
  };
}

/** Records a click once the person is on their way. */
export async function recordClick(
  admin: SupabaseClient,
  target: { recipient: Recipient; linkId: string; linkUrl: string },
  facts: RequestFacts
): Promise<void> {
  const r = target.recipient;
  if (r.status !== "sent") return;
  const at = new Date();
  const { count } = await admin
    .from("email_events")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", r.id)
    .eq("type", "clicked")
    .gte("occurred_at", new Date(at.getTime() - 5000).toISOString());
  const { device, client } = parseUserAgent(facts.userAgent);
  await recordEvent(admin, {
    campaignId: r.campaign_id,
    recipientId: r.id,
    email: r.email,
    type: "clicked",
    at,
    linkId: target.linkId,
    url: target.linkUrl,
    userAgent: facts.userAgent,
    country: facts.country,
    city: facts.city,
    device,
    client,
    machine: isBotClick({ ua: facts.userAgent, sentAt: r.sent_at, clickedAt: at, clicksInLastFiveSeconds: count ?? 0 }),
  });
}

/** An unsubscribe from a campaign's link, counted against that campaign. */
export async function recordUnsubscribe(admin: SupabaseClient, recipientToken: string | null | undefined, email: string): Promise<void> {
  if (!recipientToken || !/^[0-9a-f]{32}$/.test(recipientToken)) return;
  const r = await recipientByToken(admin, recipientToken);
  if (!r || r.email !== email) return;
  const { data: already } = await admin.from("email_campaign_recipients").select("unsubscribed_at").eq("id", r.id).maybeSingle();
  if (already?.unsubscribed_at) return;
  await recordEvent(admin, { campaignId: r.campaign_id, recipientId: r.id, email: r.email, type: "unsubscribed" });
}

export type WebEvent = { rid: string; sid: string; type: "page_view" | "conversion"; name: string | null; url: string; ref: string | null };

/**
 * A page view or conversion on HMARK's website from someone who came through
 * a campaign's link. A conversion also credits the campaign on their lead
 * record, if they are a lead and nothing was credited before.
 */
export async function recordWebEvent(admin: SupabaseClient, e: WebEvent, facts: RequestFacts, labels: Record<string, string>): Promise<boolean> {
  const r = await recipientByToken(admin, e.rid);
  if (!r) return false;
  // A runaway script is not a hundred visits: at most a hundred events an hour per person.
  const { count } = await admin
    .from("email_events")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", r.id)
    .in("type", ["website_visit", "conversion"])
    .gte("occurred_at", new Date(Date.now() - 3_600_000).toISOString());
  if ((count ?? 0) >= 100) return false;
  const { device } = parseUserAgent(facts.userAgent);
  await recordEvent(admin, {
    campaignId: r.campaign_id,
    recipientId: r.id,
    email: r.email,
    type: e.type === "conversion" ? "conversion" : "website_visit",
    url: e.url,
    userAgent: facts.userAgent,
    country: facts.country,
    city: facts.city,
    device,
    meta: { session: e.sid, referrer: e.ref, ...(e.type === "conversion" ? { conversion: e.name, label: labels[e.name ?? ""] ?? e.name } : {}) },
  });
  if (e.type === "conversion" && r.lead_id) {
    await admin.from("leads").update({ source_email_campaign_id: r.campaign_id }).eq("id", r.lead_id).is("source_email_campaign_id", null);
  }
  return true;
}
