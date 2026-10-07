// Emails each stored alert (0320) to its person: once, a couple of minutes
// after it happened, unless they have read it in the portal meanwhile.
//
// The database hands out the alerts due an email (claim_notification_emails),
// one sender at a time, so two of these running at once — a page view and the
// cron — never send the same one twice. Run after a page is served (after()
// in each portal's layout) and by the cron, so an alert raised at night still
// goes out without anyone opening the portal.

import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { getSiteUrl } from "@/lib/siteUrl";
import { notificationEmail, notificationHref, notificationTitle, type Audience } from "@/lib/notificationText";

type Claimed = {
  id: string;
  kind: string;
  title: string;
  title_many: string | null;
  body: string | null;
  link: string | null;
  link_many: string | null;
  count: number;
  email: string | null;
  recipient_name: string | null;
  audience: Audience;
};

/**
 * Only a deployment sends. A local server shares the live database, so it
 * would otherwise email real people about real alerts, with links to
 * localhost. NOTIFY_EMAILS=yes overrides it, for a deliberate test.
 */
export function deliversEmail(): boolean {
  return process.env.VERCEL === "1" || process.env.NOTIFY_EMAILS === "yes";
}

export async function deliverNotificationEmails({ limit = 20, quietMinutes = 2 }: { limit?: number; quietMinutes?: number } = {}) {
  if (!deliversEmail()) return { sent: 0, failed: 0, note: "not a deployment: alerts are emailed only from Vercel" };
  if (!isEmailConfigured()) return { sent: 0, failed: 0, note: "email is not configured" };
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_notification_emails", { p_limit: limit, p_quiet: `${quietMinutes} minutes` });
  if (error) return { sent: 0, failed: 0, note: error.message };

  let sent = 0;
  let failed = 0;
  for (const row of (data ?? []) as Claimed[]) {
    const title = notificationTitle(row);
    const result = row.email
      ? await sendEmail({
          to: row.email,
          ...notificationEmail({
            recipientName: row.recipient_name,
            title,
            body: row.count > 1 ? null : row.body,
            url: `${getSiteUrl()}${notificationHref(row, row.audience)}`,
            audience: row.audience,
          }),
        })
      : { error: "No email address on file." };
    if ("success" in result) sent++;
    else failed++;
    await admin
      .from("notifications")
      .update({
        email_state: "success" in result ? "sent" : "failed",
        emailed_at: new Date().toISOString(),
        email_error: "error" in result ? result.error : null,
      })
      .eq("id", row.id);
  }
  return { sent, failed };
}

/** When this server last looked, so a busy minute of page views asks once. */
let lastLooked = 0;

/**
 * Sends what is due once the page has been served — the person waits for
 * nothing. At most once every 45 seconds per server.
 */
export function deliverNotificationEmailsSoon() {
  if (!deliversEmail()) return;
  const now = Date.now();
  if (now - lastLooked < 45_000) return;
  lastLooked = now;
  after(async () => {
    try {
      await deliverNotificationEmails();
    } catch (e) {
      console.error("notification emails:", e instanceof Error ? e.message : e);
    }
  });
}
