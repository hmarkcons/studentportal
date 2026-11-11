/** How each campaign status reads, and its colour. */
export const STATUS: Record<string, { label: string; tone: "neutral" | "warning" | "info" | "success" | "danger" | "primary" }> = {
  draft: { label: "Draft", tone: "neutral" },
  pending_approval: { label: "Waiting for approval", tone: "warning" },
  scheduled: { label: "Scheduled", tone: "info" },
  sending: { label: "Sending", tone: "primary" },
  paused: { label: "Paused", tone: "warning" },
  sent: { label: "Sent", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
};
