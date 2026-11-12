import { getSiteUrl } from "@/lib/siteUrl";
import { deliversEmail } from "@/lib/notificationDelivery";

// Email campaign alerts to a Slack channel (Phase 6): a campaign waiting for
// approval, finished, or stopped by itself. Set SLACK_WEBHOOK_URL (an
// incoming-webhook address from Slack) in Vercel to switch it on; without it
// nothing is posted. Like the alert emails, only a deployment posts — a local
// server shares the live database and would announce its tests.

export function slackConfigured(): boolean {
  return /^https:\/\/hooks\.slack\.com\//.test(process.env.SLACK_WEBHOOK_URL?.trim() ?? "");
}

export async function slackAlert({ title, body, link }: { title: string; body: string; link: string }): Promise<void> {
  if (!slackConfigured() || !deliversEmail()) return;
  const href = /^https?:/i.test(link) ? link : `${getSiteUrl()}${link}`;
  try {
    await fetch(process.env.SLACK_WEBHOOK_URL!.trim(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `*${title}*\n${body}\n<${href}|Open in the portal>` }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // An alert that cannot be posted never stops the send it is about.
  }
}
