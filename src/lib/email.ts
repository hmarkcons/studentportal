import nodemailer from "nodemailer";

// SMTP send helper (Gmail / Google Workspace or any standard SMTP account).
// Configure via env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.
// For Gmail/Workspace, SMTP_HOST=smtp.gmail.com, SMTP_PORT=465, SMTP_USER is
// the sending address, SMTP_PASS is a 16-character Google App Password (not
// the account password — requires 2-Step Verification enabled on the account).
export function isEmailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/**
 * Money correspondence goes out as the accounts mailbox rather than support,
 * so a student replying about an invoice reaches the people who can answer.
 * Authenticated with the same SMTP credentials — only the From differs.
 */
export function accountsFrom(): string {
  return process.env.SMTP_FROM_ACCOUNTS?.trim() || process.env.SMTP_FROM || process.env.SMTP_USER || "";
}

export async function sendEmail({
  to,
  subject,
  text,
  html,
  attachments,
  from,
  replyTo,
}: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
  /** Overrides SMTP_FROM for this message (see accountsFrom). */
  from?: string;
  replyTo?: string;
}) {
  if (!isEmailConfigured()) {
    return { error: "Email isn't configured yet — set SMTP_HOST, SMTP_USER, and SMTP_PASS in the environment." };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: Number(process.env.SMTP_PORT ?? 465) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  try {
    await transporter.sendMail({
      from: from || process.env.SMTP_FROM || process.env.SMTP_USER,
      // Replies follow the sender unless told otherwise, so a student
      // answering an invoice reaches accounts rather than support.
      replyTo: replyTo || from || undefined,
      to,
      subject,
      text,
      html,
      attachments,
    });
    return { success: true as const };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to send email." };
  }
}
