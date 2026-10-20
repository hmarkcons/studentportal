import { notificationEmail, type NotificationMail } from "@/lib/notificationText";
import { studentAlertEmail } from "@/lib/studentEmailTemplates";
import { loadEmailOffice } from "@/lib/emailOffice";
import { getSiteUrl } from "@/lib/siteUrl";

/**
 * An alert's email (0320) and a to-do reminder's: in the student's own style
 * for a student — the banner for what it is about, the office at the foot
 * (studentEmailTemplates) — and the plain one for staff and partners.
 */
export async function alertEmail(mail: NotificationMail & { kind?: string | null }): Promise<{ subject: string; text: string; html: string }> {
  if (mail.audience !== "student") return notificationEmail(mail);
  return studentAlertEmail({
    office: await loadEmailOffice(),
    siteUrl: getSiteUrl(),
    recipientName: mail.recipientName,
    title: mail.title,
    body: mail.body,
    url: mail.url,
    kind: mail.kind ?? null,
  });
}
