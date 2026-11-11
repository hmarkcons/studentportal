// Amazon SES reports what became of each email — delivered, bounced, marked
// as spam, rejected — through its configuration set's event publishing to an
// SNS topic, which posts here. Every message is checked against Amazon's
// signature before anything in it is believed: the certificate must come from
// an SNS host over https, and the signed text must verify with it.
//
// The certificate fetch is passed in, so the unit tests run without a network.
// No portal imports.

import { createVerify } from "node:crypto";
import type { NormalizedEvent } from "./types.ts";

export type SnsMessage = {
  Type: "Notification" | "SubscriptionConfirmation" | "UnsubscribeConfirmation" | string;
  MessageId: string;
  TopicArn: string;
  Subject?: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  SubscribeURL?: string;
  Token?: string;
};

const SNS_HOST = /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/;

/** Whether an address is one of Amazon SNS's own, over https. */
export function isSnsUrl(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && SNS_HOST.test(u.hostname);
  } catch {
    return false;
  }
}

/** The text Amazon signed, in the order SNS documents for each message type. */
export function snsStringToSign(m: SnsMessage): string {
  const keys =
    m.Type === "Notification"
      ? ["Message", "MessageId", ...(m.Subject !== undefined ? ["Subject"] : []), "Timestamp", "TopicArn", "Type"]
      : ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"];
  return keys.map((k) => `${k}\n${(m as Record<string, unknown>)[k] ?? ""}\n`).join("");
}

/**
 * Whether an SNS message is Amazon's: its certificate comes from an SNS host
 * and its signature verifies. `getCert` fetches the PEM (cached by the caller).
 */
export async function verifySnsMessage(m: SnsMessage, getCert: (url: string) => Promise<string>, expectedTopicArn?: string | null): Promise<boolean> {
  if (!m || typeof m !== "object" || !m.Signature || !m.SigningCertURL) return false;
  if (!["1", "2"].includes(String(m.SignatureVersion))) return false;
  if (!isSnsUrl(m.SigningCertURL)) return false;
  if (expectedTopicArn && m.TopicArn !== expectedTopicArn) return false;
  let pem: string;
  try {
    pem = await getCert(m.SigningCertURL);
  } catch {
    return false;
  }
  try {
    const verifier = createVerify(String(m.SignatureVersion) === "2" ? "RSA-SHA256" : "RSA-SHA1");
    verifier.update(snsStringToSign(m), "utf8");
    return verifier.verify(pem, m.Signature, "base64");
  } catch {
    return false;
  }
}

type SesEvent = {
  eventType?: string;
  notificationType?: string;
  mail?: { messageId?: string; timestamp?: string; headers?: { name: string; value: string }[] };
  bounce?: { bounceType?: string; bounceSubType?: string; timestamp?: string; feedbackId?: string; bouncedRecipients?: { emailAddress?: string; diagnosticCode?: string }[] };
  complaint?: { timestamp?: string; feedbackId?: string; complainedRecipients?: { emailAddress?: string }[] };
  delivery?: { timestamp?: string; recipients?: string[] };
  deliveryDelay?: { timestamp?: string; delayType?: string; delayedRecipients?: { emailAddress?: string; diagnosticCode?: string }[] };
  reject?: { reason?: string };
  failure?: { errorMessage?: string };
};

/** An SES event (event publishing, or the older notifications) in the portal's own terms. */
export function parseSesEvent(messageJson: string): NormalizedEvent[] {
  let e: SesEvent;
  try {
    e = JSON.parse(messageJson);
  } catch {
    return [];
  }
  const kind = String(e.eventType ?? e.notificationType ?? "");
  const messageId = e.mail?.messageId;
  if (!messageId) return [];
  const at = (t?: string) => t ?? e.mail?.timestamp ?? new Date().toISOString();
  const lower = (s?: string) => String(s ?? "").trim().toLowerCase();
  switch (kind) {
    case "Delivery":
      return (e.delivery?.recipients ?? [""]).map((rcpt) => ({
        providerMessageId: messageId,
        providerEventId: `${messageId}:delivered:${lower(rcpt)}`,
        type: "delivered",
        occurredAt: at(e.delivery?.timestamp),
        recipient: lower(rcpt),
      }));
    case "Bounce": {
      const hard = String(e.bounce?.bounceType ?? "").toLowerCase() === "permanent";
      return (e.bounce?.bouncedRecipients ?? []).map((b) => ({
        providerMessageId: messageId,
        providerEventId: `${e.bounce?.feedbackId ?? messageId}:${lower(b.emailAddress)}`,
        type: hard ? "hard_bounce" : "soft_bounce",
        occurredAt: at(e.bounce?.timestamp),
        recipient: lower(b.emailAddress),
        bounceType: e.bounce?.bounceType ?? null,
        bounceSubType: e.bounce?.bounceSubType ?? null,
        diagnostic: b.diagnosticCode ?? null,
      }));
    }
    case "Complaint":
      return (e.complaint?.complainedRecipients ?? []).map((c) => ({
        providerMessageId: messageId,
        providerEventId: `${e.complaint?.feedbackId ?? messageId}:${lower(c.emailAddress)}`,
        type: "complaint",
        occurredAt: at(e.complaint?.timestamp),
        recipient: lower(c.emailAddress),
      }));
    case "DeliveryDelay":
      return (e.deliveryDelay?.delayedRecipients ?? []).map((d) => ({
        providerMessageId: messageId,
        providerEventId: `${messageId}:delayed:${lower(d.emailAddress)}:${e.deliveryDelay?.timestamp ?? ""}`,
        type: "delivery_delayed",
        occurredAt: at(e.deliveryDelay?.timestamp),
        recipient: lower(d.emailAddress),
        diagnostic: d.diagnosticCode ?? e.deliveryDelay?.delayType ?? null,
      }));
    case "Reject":
    case "Rendering Failure":
    case "RenderingFailure":
      return [
        {
          providerMessageId: messageId,
          providerEventId: `${messageId}:rejected`,
          type: "rejected",
          occurredAt: at(),
          recipient: "",
          diagnostic: e.reject?.reason ?? e.failure?.errorMessage ?? null,
        },
      ];
    default:
      // Send, Open, Click: the portal records these itself.
      return [];
  }
}
