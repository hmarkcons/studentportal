// The one shape every email sending service is driven through, so the portal
// can switch service without touching the campaigns (the brief's adapter).
// Amazon SES is the one recommended; Resend is the alternative. Neither is
// connected yet — the office buys the service later and adds its keys — and
// until then `getCampaignProvider` returns null and nothing bulk is sent.

export type ProviderId = "ses" | "resend";

export type OutgoingEmail = {
  to: string;
  from: string;
  replyTo?: string | null;
  subject: string;
  html: string;
  text: string;
  /** List-Unsubscribe, List-Unsubscribe-Post, X-HMARK-Campaign-ID, X-HMARK-Recipient-ID. */
  headers?: Record<string, string>;
};

/** What a service reports about a message, in the portal's own terms. */
export type NormalizedEvent = {
  providerMessageId: string;
  /** The service's id for this event, so a repeated delivery of it is recorded once. */
  providerEventId: string;
  type: "sent" | "delivered" | "delivery_delayed" | "soft_bounce" | "hard_bounce" | "rejected" | "complaint";
  occurredAt: string;
  recipient: string;
  bounceType?: string | null;
  bounceSubType?: string | null;
  diagnostic?: string | null;
};

export interface EmailProvider {
  id: ProviderId;
  label: string;
  /** Whether every key it needs is set. */
  isConfigured(): boolean;
  /** Sends one message; the service's id for it. */
  sendOne(message: OutgoingEmail): Promise<{ providerMessageId: string }>;
  /** Reads a webhook call after checking its signature; throws on an unsigned or forged one. */
  parseWebhook(request: Request): Promise<NormalizedEvent[]>;
}
