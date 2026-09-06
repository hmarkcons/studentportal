import type { DeadlineBucket, DeadlineRow } from "@/lib/deadlineReminders";

const KIND_LABEL: Record<DeadlineRow["kind"], string> = {
  program: "Application deadline",
  task: "Task due",
  document: "Document due",
};

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function daysAway(dueDate: string, todayStr: string): number {
  const [y1, m1, d1] = todayStr.split("-").map(Number);
  const [y2, m2, d2] = dueDate.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

function whenLabel(dueDate: string, todayStr: string): string {
  const n = daysAway(dueDate, todayStr);
  if (n <= 0) return "today";
  if (n === 1) return "tomorrow";
  return `in ${n} days`;
}

export function buildDeadlineReminderEmail(bucket: DeadlineBucket, todayStr: string) {
  const { name, items } = bucket;
  const count = items.length;
  const soonest = items[0];
  const subject =
    count === 1
      ? `Deadline ${whenLabel(soonest.dueDate, todayStr)}: ${soonest.title} — ${soonest.studentName}`
      : `${count} upcoming deadlines — next one ${whenLabel(soonest.dueDate, todayStr)}`;

  const lines = items.map(
    (i) => `• ${formatDate(i.dueDate)} (${whenLabel(i.dueDate, todayStr)}) — ${KIND_LABEL[i.kind]}: ${i.title} — ${i.studentName}`
  );
  const text = [`Hi ${name},`, "", "Upcoming deadlines you're responsible for:", "", ...lines, "", "— HMARK CRM"].join("\n");

  const rows = items
    .map(
      (i) => `<tr>
        <td style="padding:6px 12px 6px 0;white-space:nowrap;color:#111">${formatDate(i.dueDate)}</td>
        <td style="padding:6px 12px 6px 0;white-space:nowrap;color:#b45309">${whenLabel(i.dueDate, todayStr)}</td>
        <td style="padding:6px 12px 6px 0;color:#6b7280">${KIND_LABEL[i.kind]}</td>
        <td style="padding:6px 12px 6px 0;color:#111">${i.title}</td>
        <td style="padding:6px 0;color:#111">${i.studentName}</td>
      </tr>`
    )
    .join("");

  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;color:#111">
    <p>Hi ${name},</p>
    <p>Upcoming deadlines you're responsible for:</p>
    <table style="border-collapse:collapse;font-size:13px">${rows}</table>
    <p style="color:#6b7280;font-size:12px">— HMARK CRM</p>
  </div>`;

  return { subject, text, html };
}
