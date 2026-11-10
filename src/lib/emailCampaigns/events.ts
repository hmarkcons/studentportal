import type { SupabaseClient } from "@supabase/supabase-js";
import { SOFT_BOUNCE_LIMIT } from "./sendingRules";

// Recording what happened to a campaign email — from the open pixel, a click,
// the website script, the sending service's webhook, or the practice
// simulator — in one place, so each source has the same effect:
//
//   * an email_events row (one per provider event id, so a webhook delivered
//     twice is kept once);
//   * the recipient's counts, in one statement (email_apply_event, 0357);
//   * the address's state: a hard bounce or a spam complaint puts it on the
//     do-not-email list at once; three soft bounces across campaigns do too;
//     a person opening or clicking marks it engaged.
//
// A simulated event (a practice campaign's made-up activity) never touches an
// address's real state.

export type EventType =
  | "sent"
  | "failed"
  | "delivered"
  | "delivery_delayed"
  | "soft_bounce"
  | "hard_bounce"
  | "rejected"
  | "complaint"
  | "opened"
  | "clicked"
  | "unsubscribed"
  | "website_visit"
  | "conversion";

export type EventInput = {
  campaignId: string;
  recipientId: string;
  email: string;
  type: EventType;
  at?: Date;
  linkId?: string | null;
  url?: string | null;
  userAgent?: string | null;
  country?: string | null;
  city?: string | null;
  device?: string | null;
  client?: string | null;
  machine?: boolean;
  bounceType?: string | null;
  bounceSubType?: string | null;
  diagnostic?: string | null;
  /** In words — "Mailbox full" — for a bounce. */
  reason?: string | null;
  providerEventId?: string | null;
  simulated?: boolean;
  meta?: Record<string, unknown>;
};

const COUNTED: EventType[] = ["delivered", "opened", "clicked", "soft_bounce", "hard_bounce", "complaint", "unsubscribed", "website_visit", "conversion"];

/** Records one event and applies it. False when it was a repeat of one already recorded. */
export async function recordEvent(admin: SupabaseClient, e: EventInput): Promise<boolean> {
  const at = e.at ?? new Date();
  const { error } = await admin.from("email_events").insert({
    campaign_id: e.campaignId,
    recipient_id: e.recipientId,
    type: e.type,
    occurred_at: at.toISOString(),
    link_id: e.linkId ?? null,
    url: e.url ?? null,
    user_agent: e.userAgent ? e.userAgent.slice(0, 500) : null,
    ip_country: e.country ?? null,
    ip_city: e.city ?? null,
    device: e.device ?? null,
    client: e.client ?? null,
    is_machine: Boolean(e.machine),
    bounce_type: e.bounceType ?? null,
    bounce_subtype: e.bounceSubType ?? null,
    diagnostic: e.diagnostic ? e.diagnostic.slice(0, 1000) : e.reason ?? null,
    provider_event_id: e.providerEventId ?? null,
    simulated: Boolean(e.simulated),
    meta: e.meta ?? {},
  });
  if (error) {
    if (error.code === "23505") return false; // this event was recorded already
    throw new Error(error.message);
  }
  if (COUNTED.includes(e.type)) {
    await admin.rpc("email_apply_event", {
      p_recipient_id: e.recipientId,
      p_type: e.type,
      p_at: at.toISOString(),
      p_machine: Boolean(e.machine),
      p_device: e.device ?? null,
      p_client: e.client ?? null,
      p_country: e.country ?? null,
      p_city: e.city ?? null,
      p_reason: e.reason ?? null,
    });
  }
  if (!e.simulated) await applyToAddress(admin, e, at);
  return true;
}

async function setStatus(admin: SupabaseClient, email: string, status: string, reason: string, at: Date, onlyFrom: string[]) {
  const { data } = await admin.from("email_contact_status").select("status").eq("email", email).maybeSingle();
  if (!data) {
    await admin.from("email_contact_status").insert({ email, status, status_reason: reason, status_changed_at: at.toISOString() });
  } else if (onlyFrom.includes(data.status as string)) {
    await admin.from("email_contact_status").update({ status, status_reason: reason, status_changed_at: at.toISOString() }).eq("email", email);
  }
}

async function applyToAddress(admin: SupabaseClient, e: EventInput, at: Date) {
  switch (e.type) {
    case "hard_bounce":
      await setStatus(admin, e.email, "bounced", e.reason ?? "Bounced", at, ["subscribed", "suppressed", "invalid"]);
      return;
    case "soft_bounce": {
      const { data } = await admin.from("email_contact_status").select("soft_bounce_count, status").eq("email", e.email).maybeSingle();
      const count = (data?.soft_bounce_count as number | undefined ?? 0) + 1;
      if (!data) await admin.from("email_contact_status").insert({ email: e.email, soft_bounce_count: count });
      else await admin.from("email_contact_status").update({ soft_bounce_count: count }).eq("email", e.email);
      if (count >= SOFT_BOUNCE_LIMIT) {
        await setStatus(admin, e.email, "bounced", `Bounced ${count} times (${e.reason ?? "temporary problems"})`, at, ["subscribed"]);
      }
      return;
    }
    case "complaint":
      await setStatus(admin, e.email, "complained", "Marked a campaign email as spam", at, ["subscribed", "suppressed", "unsubscribed", "bounced", "invalid"]);
      return;
    case "opened":
    case "clicked":
    case "website_visit":
    case "conversion":
      if (!e.machine) await admin.from("email_contact_status").update({ last_engaged_at: at.toISOString() }).eq("email", e.email);
      return;
    default:
      return;
  }
}
