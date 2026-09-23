/**
 * The mail a staff member gets with their login.
 *
 * Sent when a Super Admin creates their account or issues new credentials, to
 * their official address — which is also the address they sign in with, so
 * the mail proves the one thing it has to: that this inbox is theirs.
 *
 * It carries the password itself, because the office chose that over a
 * set-your-own-password link, and staff cannot change their password in the
 * portal. So it says plainly that this is the password to keep, that it
 * should not be forwarded, and who to ask when it is lost — rather than the
 * usual "change it after you sign in", which here would send them looking for
 * a setting that does not exist.
 */

export type StaffLoginEmailData = {
  staffName: string;
  email: string;
  password: string;
  loginUrl: string;
  /** Who issued it, so a mail nobody expected can be checked with a person. */
  issuedBy: string | null;
  /** A first login, or a replacement for one they already had. */
  reason: "new_account" | "reissued";
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
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

export function staffLoginSubject(data: StaffLoginEmailData): string {
  return data.reason === "new_account" ? "Your HMARK portal login" : "Your new HMARK portal login";
}

function opening(data: StaffLoginEmailData): string {
  const by = data.issuedBy ? ` by ${data.issuedBy}` : "";
  return data.reason === "new_account"
    ? `An HMARK staff portal account has been created for you${by}. Here is how to sign in.`
    : `New login details have been issued for your HMARK staff portal account${by}. Your previous password no longer works, and you have been signed out of any device that was still signed in.`;
}

const KEEP_IT =
  "This is your password to keep — it will not change unless a Super Admin issues a new one. Don't forward this email or share the password. If you lose it, ask your Super Admin to issue new login details.";

export function staffLoginText(data: StaffLoginEmailData): string {
  return [
    `Hi ${data.staffName},`,
    "",
    opening(data),
    "",
    `Sign in at: ${data.loginUrl}`,
    `Email:      ${data.email}`,
    `Password:   ${data.password}`,
    "",
    KEEP_IT,
    "",
    "If you weren't expecting this, tell your Super Admin straight away.",
  ].join("\n");
}

export function staffLoginHtml(data: StaffLoginEmailData): string {
  const row = (label: string, value: string, mono = false) => `
    <tr>
      <td style="padding:6px 0;color:${FAINT};font-size:13px;width:90px;vertical-align:top">${esc(label)}</td>
      <td style="padding:6px 0;color:${INK};font-size:15px;${mono ? `font-family:${MONO};letter-spacing:0.5px;` : ""}word-break:break-all">${esc(value)}</td>
    </tr>`;

  return `<!doctype html>
<html><body style="margin:0;background:${PAGE};font-family:${FONT}">
  <div style="max-width:520px;margin:0 auto;padding:32px 16px">
    <div style="background:#ffffff;border:1px solid ${HAIR};border-radius:12px;padding:28px">
      <p style="margin:0 0 12px;color:${INK};font-size:16px">Hi ${esc(data.staffName)},</p>
      <p style="margin:0 0 20px;color:${BODY};font-size:14px;line-height:1.55">${esc(opening(data))}</p>
      <table role="presentation" style="border-collapse:collapse;width:100%;border-top:1px solid ${HAIR};border-bottom:1px solid ${HAIR};margin:0 0 20px">
        ${row("Email", data.email)}
        ${row("Password", data.password, true)}
      </table>
      <a href="${esc(data.loginUrl)}" style="display:inline-block;background:${GREEN};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px">Sign in</a>
      <p style="margin:20px 0 0;color:${BODY};font-size:13px;line-height:1.55">${esc(KEEP_IT)}</p>
      <p style="margin:12px 0 0;color:${FAINT};font-size:12px">If you weren't expecting this, tell your Super Admin straight away.</p>
    </div>
  </div>
</body></html>`;
}
