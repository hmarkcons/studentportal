// What a message may contain, and which channels the app can actually deliver.

/**
 * Channels the app can put a message into today.
 *
 * messages.channel also allows email, sms and whatsapp, and the thread reads
 * them back as though they were sent that way — but nothing in the app has a
 * gateway to send by any of them, so a row labelled "email" would claim an
 * email had gone out when none had. sendMessage takes the channel from its
 * caller, so a crafted request could have created exactly that. Until a
 * gateway exists these two are the honest set.
 */
export const SENDABLE_CHANNELS = ["inapp", "internal_note"] as const;

export type SendableChannel = (typeof SENDABLE_CHANNELS)[number];

export function isSendableChannel(channel: string): channel is SendableChannel {
  return (SENDABLE_CHANNELS as readonly string[]).includes(channel);
}

/**
 * Long enough for any real message, short enough that an accidental paste of a
 * whole document cannot be stored and then rendered into every thread view.
 */
export const MESSAGE_MAX_LENGTH = 5000;

export function messageBodyError(raw: FormDataEntryValue | string | null | undefined): string | null {
  const body = typeof raw === "string" ? raw.trim() : "";
  if (!body) return "Message can't be empty.";
  if (body.length > MESSAGE_MAX_LENGTH) {
    return `That message is ${body.length.toLocaleString("en-US")} characters — the limit is ${MESSAGE_MAX_LENGTH.toLocaleString("en-US")}. Send it as a document instead if it needs to be that long.`;
  }
  return null;
}

/**
 * How many students one broadcast may reach.
 *
 * Not a technical limit — a guard against a mis-click on "Select all" going out
 * to the entire student body. Well above any real cohort, and the form states
 * the count before sending.
 */
export const BROADCAST_MAX_RECIPIENTS = 500;

export function broadcastRecipientsError(count: number): string | null {
  if (count === 0) return "Select at least one student.";
  if (count > BROADCAST_MAX_RECIPIENTS) {
    return `That would message ${count.toLocaleString("en-US")} students at once, past the ${BROADCAST_MAX_RECIPIENTS.toLocaleString("en-US")} limit. Send it in smaller groups.`;
  }
  return null;
}
