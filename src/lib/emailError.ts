// What a failed send says to the person who pressed Send. Pure —
// scripts/email-error-test.mjs.
//
// nodemailer's own message is the mail server's reply verbatim: "Invalid
// login: 535 Incorrect authentication data" reached Finance as the answer to
// "Send invoice", which says nothing about what to do. The cause there is
// never the invoice — it is the portal's own login to the mail server, the
// same for every email it sends — so it is said that way, with the fix.

type MailError = { code?: string; responseCode?: number; message?: string };

export function emailErrorMessage(err: unknown): string {
  const e = (err ?? {}) as MailError;
  const message = String(e.message ?? err ?? "");
  if (e.code === "EAUTH" || e.responseCode === 535 || /\b535\b|invalid login|authentication/i.test(message)) {
    return (
      "Nothing was sent: the mail server refused the portal's login (535). The password of the mailbox the portal " +
      "sends from has most likely been changed. A Super Admin needs to put the current one in SMTP_PASS in Vercel's " +
      "environment variables and redeploy; every email the portal sends is held up until then."
    );
  }
  if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS"].includes(e.code ?? "") || /timed? ?out|ECONNREFUSED|ENOTFOUND/i.test(message)) {
    return "Nothing was sent: the mail server could not be reached. Try again in a few minutes; if it keeps happening, check SMTP_HOST and SMTP_PORT.";
  }
  if (e.responseCode && e.responseCode >= 500 && /recipient|mailbox|address|user unknown/i.test(message)) {
    return `Nothing was sent: the mail server refused the address (${e.responseCode}). Check the email address on file.`;
  }
  return message || "Failed to send email.";
}
