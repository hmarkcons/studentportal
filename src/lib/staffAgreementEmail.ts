/**
 * The three mails a staff agreement sends, each to the one person who has to
 * act next:
 *
 *   sent      → the staff member: there is an agreement waiting for you to sign
 *   returned  → whoever issued it: they have signed and returned it; verify it
 *   sentBack  → the staff member: the copy you returned was not accepted, why
 *
 * Nothing in them is the agreement itself, and none of them states pay: the
 * link goes to the portal, where the reader has to be signed in as the right
 * person to see anything. A forwarded mail discloses nothing.
 *
 * Pure, so it is unit-tested (scripts/staff-agreement-email-test.mjs).
 */

export type StaffAgreementMail =
  | { kind: "sent"; staffName: string; title: string; url: string; issuedBy: string | null }
  | { kind: "returned"; recipientName: string; staffName: string; title: string; url: string }
  | { kind: "sentBack"; staffName: string; title: string; url: string; note: string };

function esc(s: string | null | undefined): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const INK = "#14151a";
const BODY = "#5f6068";
const HAIR = "#ebebe8";
const PAGE = "#f6f6f4";
const GREEN = "#157a5b";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function staffAgreementSubject(mail: StaffAgreementMail): string {
  switch (mail.kind) {
    case "sent":
      return `Please sign: ${mail.title}`;
    case "returned":
      return `Signed and returned: ${mail.title} — ${mail.staffName}`;
    case "sentBack":
      return `Sent back for another signed copy: ${mail.title}`;
  }
}

function lines(mail: StaffAgreementMail): { greeting: string; body: string[]; button: string } {
  switch (mail.kind) {
    case "sent":
      return {
        greeting: `Hi ${mail.staffName},`,
        body: [
          `Your agreement "${mail.title}" is ready${mail.issuedBy ? `, sent by ${mail.issuedBy}` : ""}.`,
          "Open it in the portal, download and read it, sign it, and upload the signed copy there. It will be checked and you'll be told if anything needs another look.",
        ],
        button: "Open my agreement",
      };
    case "returned":
      return {
        greeting: `Hi ${mail.recipientName},`,
        body: [
          `${mail.staffName} has signed and returned "${mail.title}".`,
          "Check the signed copy and verify it, or send it back with a note saying what needs fixing.",
        ],
        button: "Review it",
      };
    case "sentBack":
      return {
        greeting: `Hi ${mail.staffName},`,
        body: [
          `The signed copy you returned of "${mail.title}" was sent back:`,
          `“${mail.note}”`,
          "Please upload a corrected signed copy in the portal.",
        ],
        button: "Open my agreement",
      };
  }
}

export function staffAgreementText(mail: StaffAgreementMail): string {
  const { greeting, body } = lines(mail);
  return [greeting, "", ...body.flatMap((line) => [line, ""]), mail.url].join("\n");
}

export function staffAgreementHtml(mail: StaffAgreementMail): string {
  const { greeting, body, button } = lines(mail);
  return `<!doctype html>
<html><body style="margin:0;background:${PAGE};font-family:${FONT}">
  <div style="max-width:520px;margin:0 auto;padding:32px 16px">
    <div style="background:#ffffff;border:1px solid ${HAIR};border-radius:12px;padding:28px">
      <p style="margin:0 0 12px;color:${INK};font-size:16px">${esc(greeting)}</p>
      ${body.map((line) => `<p style="margin:0 0 12px;color:${BODY};font-size:14px;line-height:1.55">${esc(line)}</p>`).join("\n      ")}
      <a href="${esc(mail.url)}" style="display:inline-block;margin-top:8px;background:${GREEN};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px">${esc(button)}</a>
    </div>
  </div>
</body></html>`;
}
