/**
 * The mails leave sends, each to the one person who acts next:
 *
 *   requested  → each approver: a request is waiting for you
 *   approved   → the staff member: yes — and how many of the days are paid
 *   rejected   → the staff member: no, and why
 *   recorded   → the staff member: leave was entered for you (they phoned in sick)
 *
 * The approved mail says plainly when some days are unpaid and why — no
 * certificate, or past the allowance — because that is a deduction on their
 * next payslip, and they should hear it now rather than find it then.
 *
 * Pure, so it is unit-tested (scripts/leave-email-test.mjs).
 */

export type LeaveMail =
  | { kind: "requested"; recipientName: string; staffName: string; leaveLabel: string; dates: string; days: number; url: string; shortNotice: boolean }
  | { kind: "approved"; staffName: string; leaveLabel: string; dates: string; paid: number; unpaid: number; unpaidReason: "certificate" | "allowance" | null; remaining: number; url: string }
  | { kind: "rejected"; staffName: string; leaveLabel: string; dates: string; note: string; url: string }
  | { kind: "recorded"; staffName: string; leaveLabel: string; dates: string; paid: number; unpaid: number; recordedBy: string | null; url: string };

function esc(s: string | null | undefined): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function leaveSubject(mail: LeaveMail): string {
  switch (mail.kind) {
    case "requested":
      return `Leave request: ${mail.staffName}, ${mail.dates}`;
    case "approved":
      return `Leave approved: ${mail.dates}`;
    case "rejected":
      return `Leave not approved: ${mail.dates}`;
    case "recorded":
      return `Leave recorded for you: ${mail.dates}`;
  }
}

function unpaidLine(unpaid: number, reason: "certificate" | "allowance" | null): string | null {
  if (unpaid === 0) return null;
  const why =
    reason === "certificate"
      ? "sick and emergency leave is paid only with a medical certificate"
      : "they are past your paid leave allowance";
  return `${plural(unpaid, "day")} will be unpaid, because ${why}, and deducted from your salary.`;
}

function lines(mail: LeaveMail): { greeting: string; body: string[]; button: string } {
  switch (mail.kind) {
    case "requested":
      return {
        greeting: `Hi ${mail.recipientName},`,
        body: [
          `${mail.staffName} has asked for ${mail.leaveLabel.toLowerCase()}: ${mail.dates} (${plural(mail.days, "working day")}).`,
          ...(mail.shortNotice ? ["It gives less than the month's notice planned leave needs."] : []),
          "Approve or reject it in the portal.",
        ],
        button: "Review the request",
      };
    case "approved":
      return {
        greeting: `Hi ${mail.staffName},`,
        body: [
          `Your ${mail.leaveLabel.toLowerCase()} for ${mail.dates} is approved.`,
          `${plural(mail.paid, "day")} paid from your allowance.`,
          ...(unpaidLine(mail.unpaid, mail.unpaidReason) ? [unpaidLine(mail.unpaid, mail.unpaidReason)!] : []),
          `You have ${plural(mail.remaining, "paid day")} left this leave year.`,
        ],
        button: "See my leave",
      };
    case "rejected":
      return {
        greeting: `Hi ${mail.staffName},`,
        body: [`Your ${mail.leaveLabel.toLowerCase()} for ${mail.dates} was not approved:`, `“${mail.note}”`],
        button: "See my leave",
      };
    case "recorded":
      return {
        greeting: `Hi ${mail.staffName},`,
        body: [
          `${mail.recordedBy ?? "HR"} has recorded ${mail.leaveLabel.toLowerCase()} for you: ${mail.dates}.`,
          `${plural(mail.paid, "day")} paid${mail.unpaid ? `, ${plural(mail.unpaid, "day")} unpaid` : ""}.`,
        ],
        button: "See my leave",
      };
  }
}

export function leaveText(mail: LeaveMail): string {
  const { greeting, body } = lines(mail);
  return [greeting, "", ...body.flatMap((l) => [l, ""]), mail.url].join("\n");
}

export function leaveHtml(mail: LeaveMail): string {
  const { greeting, body, button } = lines(mail);
  return `<!doctype html>
<html><body style="margin:0;background:#f6f6f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:32px 16px">
    <div style="background:#ffffff;border:1px solid #ebebe8;border-radius:12px;padding:28px">
      <p style="margin:0 0 12px;color:#14151a;font-size:16px">${esc(greeting)}</p>
      ${body.map((l) => `<p style="margin:0 0 12px;color:#5f6068;font-size:14px;line-height:1.55">${esc(l)}</p>`).join("\n      ")}
      <a href="${esc(mail.url)}" style="display:inline-block;margin-top:8px;background:#157a5b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px">${esc(button)}</a>
    </div>
  </div>
</body></html>`;
}

/** "3 Oct 2026" or "3–7 Oct 2026" or "30 Sep – 2 Oct 2026". */
export function formatLeaveRange(start: string, end: string): string {
  const fmt = (d: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
  if (start === end) return fmt(start, { day: "numeric", month: "short", year: "numeric" });
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  if (sameMonth) return `${fmt(start, { day: "numeric" })}–${fmt(end, { day: "numeric", month: "short", year: "numeric" })}`;
  if (sameYear) return `${fmt(start, { day: "numeric", month: "short" })} – ${fmt(end, { day: "numeric", month: "short", year: "numeric" })}`;
  return `${fmt(start, { day: "numeric", month: "short", year: "numeric" })} – ${fmt(end, { day: "numeric", month: "short", year: "numeric" })}`;
}
