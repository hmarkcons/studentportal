// How a stored alert reads (0320) — in the bell, on the dashboard, and in its
// email. Pure, so the unit tests (scripts/notifications-test.mjs) read it
// under plain Node and the portal and the mailer cannot word it differently.

export type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  title_many: string | null;
  body: string | null;
  link: string | null;
  link_many: string | null;
  count: number;
  read_at: string | null;
  updated_at: string;
};

export type Audience = "staff" | "student" | "partner";

/** "New message from HMARK", or once several are grouped, "3 new messages from HMARK". */
export function notificationTitle(n: Pick<NotificationRow, "title" | "title_many" | "count">): string {
  if (n.count > 1 && n.title_many) return n.title_many.replace("{n}", n.count.toLocaleString("en-US"));
  return n.title;
}

/** Where it is dealt with: the one record, or the list once several are grouped. */
export function notificationHref(n: Pick<NotificationRow, "link" | "link_many" | "count">, audience: Audience): string {
  const link = n.count > 1 && n.link_many ? n.link_many : n.link;
  return link && link.startsWith("/") ? link : homeOf(audience);
}

/** Each portal's dashboard, where every alert is listed. */
export function homeOf(audience: Audience): string {
  return audience === "student" ? "/portal" : audience === "partner" ? "/partner" : "/dashboard";
}

/** A line of a message, never a wall of one. */
export function excerpt(text: string | null | undefined, max = 140): string | null {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  if (!flat) return null;
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", then the date. */
export function whenAgo(iso: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Karachi" });
}

/** What each kind is, for its icon and colour in the bell. */
export type NotificationTone = "message" | "good" | "attention" | "info" | "assigned";

export function notificationTone(kind: string): NotificationTone {
  switch (kind) {
    case "message":
    case "student_message":
    case "partner_message":
    case "ticket":
    case "ticket_reply":
      return "message";
    case "document_approved":
    case "payment":
      return "good";
    case "document_rejected":
    case "agreement":
    case "document_submitted":
      return "attention";
    case "lead_assigned":
    case "student_assigned":
    case "task_assigned":
      return "assigned";
    default:
      return "info";
  }
}

// ------------------------------------------------------------------ email

export type NotificationMail = {
  recipientName: string | null;
  title: string;
  body: string | null;
  url: string;
  audience: Audience;
};

function esc(s: string | null | undefined): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const firstName = (name: string | null) => (name ?? "").trim().split(/\s+/)[0] || null;

/** The email for one alert: its title as the subject, a line of it, and the way back in. */
export function notificationEmail(mail: NotificationMail): { subject: string; text: string; html: string } {
  const greeting = firstName(mail.recipientName) ? `Hi ${firstName(mail.recipientName)},` : "Hello,";
  const portal = mail.audience === "student" ? "your student portal" : mail.audience === "partner" ? "the partner portal" : "the HMARK portal";
  const lead = `${mail.title}.`;
  const body = excerpt(mail.body, 400);
  const button = mail.audience === "student" ? "Open your portal" : "Open in the portal";
  const footer = `You are getting this because of activity on ${portal}. It is also listed under the bell at the top of every page.`;
  const text = [greeting, "", lead, ...(body ? ["", body] : []), "", `${button}: ${mail.url}`, "", footer].join("\n");
  const html = `<!doctype html>
<html><body style="margin:0;background:#f6f6f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:32px 16px">
    <div style="background:#ffffff;border:1px solid #ebebe8;border-radius:12px;padding:28px">
      <p style="margin:0 0 12px;color:#14151a;font-size:16px">${esc(greeting)}</p>
      <p style="margin:0 0 12px;color:#14151a;font-size:15px;font-weight:600;line-height:1.45">${esc(lead)}</p>
      ${body ? `<p style="margin:0 0 16px;padding:12px 14px;background:#f6f6f4;border-radius:8px;color:#5f6068;font-size:14px;line-height:1.55">${esc(body)}</p>` : ""}
      <a href="${esc(mail.url)}" style="display:inline-block;margin-top:4px;background:#157a5b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px">${esc(button)}</a>
      <p style="margin:20px 0 0;color:#8a8b92;font-size:12px;line-height:1.5">${esc(footer)}</p>
    </div>
  </div>
</body></html>`;
  return { subject: mail.title, text, html };
}

// --------------------------------------------------------------- reminders

/**
 * Whether a reminder of something still to do is due again: never sent, or
 * sent longer ago than its spell. The daily run asks this per person and
 * kind, so a reminder is one email about one kind of thing, never a digest.
 */
export function reminderDue(lastSentIso: string | null | undefined, everyDays: number, now: number): boolean {
  if (!lastSentIso) return true;
  // A little under the spell, so a run at 9:00 the day it falls due is not
  // put off by one at 9:02 the time before.
  return now - new Date(lastSentIso).getTime() >= everyDays * 86_400_000 - 3 * 3_600_000;
}
