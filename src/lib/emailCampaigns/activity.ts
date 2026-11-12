import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/currentUser";

// Who did what in Email campaigns (0361): sends, approvals, exports, lists
// and tasks made from reports, settings changed. Written through the service
// role (the table takes no insert from a session) and never allowed to fail
// the action it records — a log that could stop a send would be worse than a
// gap in the log.

export type EmailActivity =
  | "campaign_sent"
  | "campaign_scheduled"
  | "campaign_submitted"
  | "campaign_approved"
  | "campaign_sent_back"
  | "campaign_paused"
  | "campaign_resumed"
  | "campaign_cancelled"
  | "campaign_unscheduled"
  | "campaign_deleted"
  | "campaign_duplicated"
  | "resend_created"
  | "test_sent"
  | "simulated"
  | "simulation_cleared"
  | "recipients_exported"
  | "report_pdf"
  | "dashboard_exported"
  | "list_made"
  | "follow_up_tasks"
  | "settings_changed"
  | "block_saved"
  | "block_deleted"
  | "sunset_suppressed"
  | "sunset_campaign";

export const ACTIVITY_LABELS: Record<EmailActivity, string> = {
  campaign_sent: "Sent a campaign",
  campaign_scheduled: "Scheduled a campaign",
  campaign_submitted: "Sent a campaign for approval",
  campaign_approved: "Approved a campaign",
  campaign_sent_back: "Sent a campaign back",
  campaign_paused: "Paused a campaign",
  campaign_resumed: "Resumed a campaign",
  campaign_cancelled: "Cancelled a campaign",
  campaign_unscheduled: "Took a campaign back to draft",
  campaign_deleted: "Deleted a draft",
  campaign_duplicated: "Duplicated a campaign",
  resend_created: "Made a resend to non-openers",
  test_sent: "Sent a test email",
  simulated: "Simulated activity",
  simulation_cleared: "Cleared simulated activity",
  recipients_exported: "Exported recipients",
  report_pdf: "Downloaded a report PDF",
  dashboard_exported: "Exported the campaigns table",
  list_made: "Made a list from a report",
  follow_up_tasks: "Gave follow-up tasks",
  settings_changed: "Changed the email settings",
  block_saved: "Saved a content block",
  block_deleted: "Deleted a content block",
  sunset_suppressed: "Stopped emailing silent people",
  sunset_campaign: "Made a re-engagement campaign",
};

export async function logEmailActivity(
  action: EmailActivity,
  { campaignId = null, summary = "", detail = {}, staffId }: { campaignId?: string | null; summary?: string; detail?: Record<string, unknown>; staffId?: string | null } = {}
): Promise<void> {
  try {
    const who = staffId === undefined ? ((await getCurrentUser())?.id ?? null) : staffId;
    await createAdminClient()
      .from("email_activity_log")
      .insert({ staff_id: who, action, campaign_id: campaignId, summary: summary.slice(0, 500), detail });
  } catch {
    // Never fails what it records.
  }
}
