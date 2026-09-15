/**
 * The mail a counselor gets when a student becomes theirs.
 *
 * Written as a task, not a notification. "You have a new student" tells
 * somebody to go and look something up; this one carries the student's number,
 * how to reach them, what is owed first and by when, and a link straight to
 * their page — so the counselor can act on it from the inbox at eight in the
 * morning without opening the portal to find out whether it matters yet.
 *
 * Deliberately says nothing about the fee. The office asked for the work, not
 * the billing, and a fee quoted in a mail that is forwarded is a fee quoted
 * out of context.
 */

export type NoticeRole = "counselor" | "processing" | "management";

export type RegistrationNoticeData = {
  /** Who this copy is addressed to, and why they are getting it. */
  recipientName: string;
  role: NoticeRole;
  /** Set when the student was moved to them rather than newly registered. */
  reassigned?: boolean;

  studentName: string;
  studentCode: string | null;
  country: string | null;
  intake: string | null;
  studentPhone: string | null;
  studentEmail: string | null;

  counselorName: string | null;
  processingOfficerName: string | null;

  /** What is owed first, nearest deadline first. */
  firstActions: { label: string; due: string | null }[];
  /** How many more requirements there are beyond the ones listed. */
  moreActions: number;

  studentUrl: string;
};

function esc(s: string | null | undefined): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const INK = "#14151a";
const BODY = "#5f6068";
const FAINT = "#9b9ca3";
const HAIR = "#ebebe8";
const PAGE = "#f6f6f4";
const GREEN = "#157a5b";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** What the subject has to say for someone scanning forty unread mails. */
export function noticeSubject(data: RegistrationNoticeData): string {
  const who = data.studentCode ? `${data.studentName} · ${data.studentCode}` : data.studentName;
  const where = data.country ? ` — ${data.country}` : "";
  if (data.reassigned) return `Reassigned to you: ${who}${where}`;
  if (data.role === "management") return `Registered: ${who}${where}`;
  return `New student assigned to you: ${who}${where}`;
}

/**
 * The opening line, which differs by who is reading.
 *
 * Management is being kept informed; the counselor and the processing officer
 * are being given something to do, and should not have to work out which.
 */
export function noticeOpening(data: RegistrationNoticeData): string {
  const name = data.studentName;
  if (data.role === "management") {
    return `${name} has registered${data.country ? ` for ${data.country}` : ""}. This is a copy for your records.`;
  }
  if (data.reassigned) {
    return `${name} has been reassigned to you${data.country ? ` for ${data.country}` : ""}. Everything already on file stays with them.`;
  }
  if (data.role === "processing") {
    return `${name} has registered${data.country ? ` for ${data.country}` : ""} and processing is yours.`;
  }
  return `${name} has registered${data.country ? ` for ${data.country}` : ""} and is now your student.`;
}

export function buildRegistrationNotice(data: RegistrationNoticeData) {
  const subject = noticeSubject(data);
  const opening = noticeOpening(data);

  const facts: [string, string][] = [];
  if (data.studentCode) facts.push(["Student ID", data.studentCode]);
  if (data.country) facts.push(["Country", data.country]);
  if (data.intake) facts.push(["Intake", data.intake]);
  if (data.studentPhone) facts.push(["Phone", data.studentPhone]);
  if (data.studentEmail) facts.push(["Email", data.studentEmail]);
  // Each says who the other is, so neither has to ask.
  if (data.role !== "counselor" && data.counselorName) facts.push(["Counselor", data.counselorName]);
  if (data.role !== "processing" && data.processingOfficerName) facts.push(["Processing", data.processingOfficerName]);

  const actionLine = (a: { label: string; due: string | null }) => (a.due ? `${a.label} — by ${a.due}` : a.label);

  // ------------------------------------------------------------ plain text
  const text = [
    `Dear ${data.recipientName},`,
    ``,
    opening,
    ``,
    ...facts.map(([k, v]) => `  ${k}: ${v}`),
    ``,
    ...(data.firstActions.length > 0
      ? [
          data.role === "management" ? `Outstanding:` : `What they owe first:`,
          ...data.firstActions.map((a) => `  - ${actionLine(a)}`),
          ...(data.moreActions > 0 ? [`  ...and ${data.moreActions} more on their Documents tab.`] : []),
          ``,
        ]
      : [`Nothing is outstanding on their checklist yet.`, ``]),
    `Open their file: ${data.studentUrl}`,
    ``,
    `— HMARK Student Portal`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  // ------------------------------------------------------------------ html
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(subject)}</title></head>
<body style="margin:0;padding:24px 12px;background:${PAGE};font-family:${FONT};color:${BODY};">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid ${HAIR};border-radius:10px;">
    <tr><td style="padding:24px 24px 8px;">
      <p style="margin:0 0 14px;font-size:15px;color:${INK};">Dear ${esc(data.recipientName)},</p>
      <p style="margin:0 0 18px;font-size:14px;line-height:1.55;">${esc(opening)}</p>

      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid ${HAIR};">
        ${facts
          .map(
            ([k, v]) => `<tr>
          <td style="padding:7px 0;font-size:12px;color:${FAINT};width:110px;vertical-align:top;">${esc(k)}</td>
          <td style="padding:7px 0;font-size:13px;color:${INK};">${esc(v)}</td></tr>`
          )
          .join("")}
      </table>
    </td></tr>

    <tr><td style="padding:4px 24px 8px;">
      ${
        data.firstActions.length > 0
          ? `<p style="margin:14px 0 8px;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:${FAINT};">
              ${data.role === "management" ? "Outstanding" : "What they owe first"}
             </p>
             <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
             ${data.firstActions
               .map(
                 (a) => `<tr>
                 <td style="padding:5px 0;font-size:13px;color:${INK};">${esc(a.label)}</td>
                 <td style="padding:5px 0;font-size:12px;color:${a.due ? GREEN : FAINT};text-align:right;white-space:nowrap;">${a.due ? `by ${esc(a.due)}` : "no date set"}</td>
               </tr>`
               )
               .join("")}
             </table>
             ${data.moreActions > 0 ? `<p style="margin:8px 0 0;font-size:12px;color:${FAINT};">…and ${data.moreActions} more on their Documents tab.</p>` : ""}`
          : `<p style="margin:14px 0 0;font-size:13px;color:${BODY};">Nothing is outstanding on their checklist yet.</p>`
      }
    </td></tr>

    <tr><td style="padding:18px 24px 26px;">
      <a href="${esc(data.studentUrl)}" style="display:inline-block;background:${GREEN};color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:7px;">Open their file</a>
    </td></tr>

    <tr><td style="padding:0 24px 22px;border-top:1px solid ${HAIR};">
      <p style="margin:14px 0 0;font-size:11px;color:${FAINT};">HMARK Student Portal</p>
    </td></tr>
  </table>
</body></html>`;

  return { subject, text, html };
}
