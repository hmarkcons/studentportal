// What a support ticket may contain, and what a reply does to the ticket.
//
// The limits are the same numbers as the database constraints in 0156, so a
// student is told what is wrong in the form rather than being handed a
// constraint violation — and a request that goes around the form still hits the
// floor.

/** Long enough for a real subject, short enough for the staff queue to show. */
export const TICKET_SUBJECT_MAX = 200;

/**
 * Same ceiling as a message body (see messages.ts). A ticket had no limit at
 * all: a 200,000-character paste was accepted by the database and then read
 * back and rendered in full on every visit.
 */
export const TICKET_BODY_MAX = 5000;

const count = (n: number) => n.toLocaleString("en-US");

export function ticketSubjectError(raw: FormDataEntryValue | string | null | undefined): string | null {
  const subject = typeof raw === "string" ? raw.trim() : "";
  if (!subject) return "Give the ticket a subject.";
  if (subject.length > TICKET_SUBJECT_MAX) {
    return `That subject is ${count(subject.length)} characters — keep it under ${count(TICKET_SUBJECT_MAX)}. The detail belongs in the message.`;
  }
  return null;
}

export function ticketBodyError(
  raw: FormDataEntryValue | string | null | undefined,
  what: "message" | "reply" = "message"
): string | null {
  const body = typeof raw === "string" ? raw.trim() : "";
  if (!body) return what === "reply" ? "Message can't be empty." : "Tell us what you need help with.";
  if (body.length > TICKET_BODY_MAX) {
    return `That ${what} is ${count(body.length)} characters — the limit is ${count(TICKET_BODY_MAX)}. Attach a document instead if it needs to be that long.`;
  }
  return null;
}

/**
 * What replying does to the ticket's status.
 *
 * The rule the trigger in 0156 enforces, kept here so it can be read and
 * tested without a database: a student replying to a resolved ticket reopens
 * it — otherwise nothing flags it as waiting on anyone and the student sits
 * waiting on an answer nobody has been asked for — and the first staff reply
 * moves an untouched ticket to "in progress", because a reply means someone is
 * on it.
 */
export function statusAfterReply(status: string, authorType: "staff" | "student"): string {
  if (authorType === "student" && status === "resolved") return "open";
  if (authorType === "staff" && status === "open") return "in_progress";
  return status;
}
