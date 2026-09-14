// The message a student gets when they have stopped.
//
// Kept apart from the sending so the wording can be filled, checked and
// tested without a database or a mail server, and so the Setup screen, the
// draft on the student's page and the email all produce the same text.

export type ReengagementKind = "ghost" | "withdrawn";

export type ReengagementTemplates = {
  ghost_subject: string;
  ghost_body: string;
  withdrawn_subject: string;
  withdrawn_body: string;
};

/** What the office may drop into its own wording. */
export const REENGAGEMENT_PLACEHOLDERS = ["{name}", "{counsellor}"] as const;

/** Which of the two applies, or null for a student who has not stopped. */
export function reengagementKind(registrationStatus: string | null | undefined): ReengagementKind | null {
  if (registrationStatus === "ghost") return "ghost";
  if (registrationStatus === "withdrawn") return "withdrawn";
  return null;
}

/** First name only — the whole point is that it reads like a person wrote it. */
function firstName(fullName: string | null | undefined): string {
  const trimmed = (fullName ?? "").trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0];
}

/**
 * Fills {name} and {counsellor} into text the office wrote.
 *
 * The cleanup afterwards is the point. Once the wording is editable the
 * sentence around a placeholder is not ours to control, and somebody will
 * write "Hello {name}," for a student whose name we do not have — which then
 * reads "Hello ," on a real person's screen.
 *
 * So an empty value takes its own punctuation with it, and a line left empty
 * collapses rather than leaving a gap in the middle of a letter.
 */
export function fillReengagement(text: string, values: { name?: string | null; counsellor?: string | null }): string {
  const name = firstName(values.name);
  const counsellor = (values.counsellor ?? "").trim();

  let out = (text ?? "").replace(/\{name\}/g, name).replace(/\{counsellor\}/g, counsellor);

  if (!name || !counsellor) {
    out = out
      // "Hello ," and "If anything changes, , we have" — the comma that
      // introduced the missing value goes with it.
      .replace(/([A-Za-z])\s+,/g, "$1,")
      .replace(/,\s*,/g, ",")
      .replace(/\s+([.,!?])/g, "$1")
      // "Hello," on its own line, with nobody to greet.
      .replace(/^Hello,\s*$/gm, "Hello,")
      .replace(/[ \t]{2,}/g, " ");

    // A line that held nothing but a placeholder is now blank in the middle of
    // the letter. Three or more newlines collapse to the paragraph break the
    // office actually wrote.
    out = out.replace(/\n{3,}/g, "\n\n");
  }

  return out.trim();
}

export type ReengagementDraft = {
  kind: ReengagementKind;
  subject: string;
  body: string;
};

/**
 * The draft for this student, ready to be read and sent.
 *
 * Returns null when there is nothing to send — a registered student, or a
 * database with no wording stored, in which case the screen says so rather
 * than offering an empty message to send to somebody.
 */
export function buildReengagementDraft(
  registrationStatus: string | null | undefined,
  student: { full_name?: string | null },
  counsellorName: string | null | undefined,
  templates: ReengagementTemplates | null
): ReengagementDraft | null {
  const kind = reengagementKind(registrationStatus);
  if (!kind || !templates) return null;

  const subject = kind === "ghost" ? templates.ghost_subject : templates.withdrawn_subject;
  const body = kind === "ghost" ? templates.ghost_body : templates.withdrawn_body;
  if (!subject?.trim() || !body?.trim()) return null;

  const values = { name: student.full_name, counsellor: counsellorName };
  return {
    kind,
    subject: fillReengagement(subject, values),
    body: fillReengagement(body, values),
  };
}

/**
 * A wa.me link for the counsellor to open, when there is a usable number.
 *
 * Pakistani numbers are stored as they are typed — 0300-1234567,
 * +92 300 1234567, 03001234567 — and wa.me needs digits with a country code
 * and no leading zero. A number it cannot make sense of returns null rather
 * than a link that opens WhatsApp on a wrong number.
 */
export function whatsappLink(contactNumber: string | null | undefined, message: string): string | null {
  const digits = (contactNumber ?? "").replace(/\D/g, "");
  if (!digits) return null;

  let international: string;
  if (digits.startsWith("92") && digits.length === 12) international = digits;
  else if (digits.startsWith("0") && digits.length === 11) international = `92${digits.slice(1)}`;
  else if (digits.length === 10) international = `92${digits}`;
  else return null;

  return `https://wa.me/${international}?text=${encodeURIComponent(message)}`;
}
