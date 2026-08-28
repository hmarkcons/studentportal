const COLOR_HEX: Record<string, string> = {
  red: "#ef4444",
  orange: "#f97316",
  yellow: "#eab308",
  green: "#22c55e",
  teal: "#14b8a6",
  blue: "#3b82f6",
  purple: "#a855f7",
  pink: "#ec4899",
  gray: "#9ca3af",
};

const KIND_DEFAULT_HEX: Record<string, string> = {
  task: "#f59e0b",
  personal: "#14b8a6",
};

const PRIORITY_LABEL: Record<string, string> = {
  urgent: "Urgent",
  medium: "Medium priority",
  low: "Low priority",
};

export type ReminderEmailItem = {
  title: string;
  kind: "task" | "personal";
  dueDate: string;
  isOverdue: boolean;
  allDay: boolean;
  time: string | null;
  priority: string;
  notes: string | null;
  color: string | null;
  studentName?: string | null;
};

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function buildCalendarReminderEmail(recipientName: string, items: ReminderEmailItem[]) {
  const subject =
    items.length === 1
      ? `Reminder: "${items[0].title}" is still pending — HMARK CRM`
      : `You have ${items.length} pending reminders — HMARK CRM`;

  const textLines = [
    `Hi ${recipientName},`,
    "",
    "These items are still pending in the HMARK CRM calendar:",
    "",
    ...items.map((i) => {
      const when = i.allDay ? formatDate(i.dueDate) : `${formatDate(i.dueDate)} at ${i.time ?? ""}`;
      const overdue = i.isOverdue ? " (overdue)" : "";
      const student = i.studentName ? ` — ${i.studentName}` : "";
      return `- ${i.title}${student} — due ${when}${overdue} — ${PRIORITY_LABEL[i.priority] ?? i.priority}`;
    }),
    "",
    "This reminder repeats daily until each item is marked complete in the calendar.",
    "",
    "Regards,",
    "HMARK Consultants",
  ];
  const text = textLines.join("\n");

  const rows = items
    .map((i) => {
      const stripColor = i.color ? (COLOR_HEX[i.color] ?? KIND_DEFAULT_HEX[i.kind]) : KIND_DEFAULT_HEX[i.kind];
      const when = i.allDay ? formatDate(i.dueDate) : `${formatDate(i.dueDate)} · ${i.time ?? ""}`;
      const overdueChip = i.isOverdue
        ? `<span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;background:#fee2e2;color:#b91c1c;font-size:11px;font-weight:600;">OVERDUE</span>`
        : "";
      const kindLabel = i.kind === "task" ? "Student task" : "Personal reminder";
      const studentLine = i.studentName
        ? `<div style="margin-top:2px;font-size:13px;color:#6b7280;">${i.studentName}</div>`
        : "";
      const notesLine = i.notes
        ? `<div style="margin-top:6px;font-size:13px;color:#6b7280;line-height:1.5;">${i.notes}</div>`
        : "";
      return `
        <tr>
          <td style="padding:0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:12px;">
              <tr>
                <td width="4" style="background:${stripColor};border-radius:4px 0 0 4px;"></td>
                <td style="padding:12px 14px;background:#f9fafb;border-radius:0 4px 4px 0;">
                  <div style="font-size:11px;letter-spacing:0.04em;text-transform:uppercase;color:#9ca3af;font-weight:600;">${kindLabel} · ${PRIORITY_LABEL[i.priority] ?? i.priority}</div>
                  <div style="margin-top:4px;font-size:15px;font-weight:600;color:#111827;">${i.title}${overdueChip}</div>
                  ${studentLine}
                  <div style="margin-top:6px;font-size:13px;color:#374151;">Due ${when}</div>
                  ${notesLine}
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    })
    .join("");

  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
            <tr>
              <td style="background:#0f766e;padding:20px 28px;">
                <div style="font-size:18px;font-weight:700;color:#ffffff;">HMARK Consultants</div>
                <div style="font-size:13px;color:#ccfbf1;margin-top:2px;">Daily reminder — ${items.length} pending item${items.length === 1 ? "" : "s"}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px 8px 28px;">
                <p style="margin:0 0 16px 0;font-size:14px;color:#374151;">Hi ${recipientName},</p>
                <p style="margin:0 0 18px 0;font-size:14px;color:#374151;">These are still pending in your HMARK CRM calendar:</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                  ${rows}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 24px 28px;">
                <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
                  This reminder repeats daily until each item is marked complete in the calendar. Regards,<br />HMARK Consultants
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}
