// A student's logins, sent to them: by email, or as a message to paste into
// WhatsApp.
//
// Two places on a student's page send them, each its own:
//
//   Registration & Portal Access   this portal's own login — the email or
//                                  Student ID, the password and where to sign
//                                  in — and nothing else;
//   Portal credentials             the logins the office keeps for them on
//                                  other sites (Gmail, the university and visa
//                                  portals, the scholarship portals): only the
//                                  ones ticked, none to begin with.
//
// The email and the copied message are built here from one list, so they
// never say different things.
//
// Pure, no imports, so the unit tests read it under plain Node.

/** One login as it is sent: what it is for, and what to type. */
export type StudentLogin = {
  /** The stored credential_type, which decides the label and the order. */
  credentialType: string;
  /** For a login kept against one application: its university. */
  university?: string | null;
  username: string;
  password: string;
};

/** The student's own login for this portal (portal.ts stores it so). */
export const PORTAL_LOGIN = "portal_login";
const SCHOLARSHIP_PREFIX = "scholarship_portal:";

/** The logins the section offers by name, in its order. */
const NAMED: Record<string, string> = {
  [PORTAL_LOGIN]: "HMARK Student Portal",
  gmail: "Gmail",
  university_portal: "University portal",
  visa_appointment_portal: "Visa appointment portal",
};
const ORDER = [PORTAL_LOGIN, "gmail", "university_portal", "visa_appointment_portal"];

/**
 * The logins Portal credentials always offers, saved or not. This portal's
 * own is not among them: it is managed — and sent — from Registration &
 * Portal Access, where its password is actually set. Saving over its copy in
 * Portal credentials changed the copy and not the password.
 */
export const SECTION_PRESETS = ["gmail", "university_portal", "visa_appointment_portal"] as const;

/** Whether a stored login belongs in Portal credentials: every one but this portal's own. */
export function inCredentialsSection(credentialType: string): boolean {
  return credentialType !== PORTAL_LOGIN;
}

/** What a login is called to the student. */
export function credentialLabel(credentialType: string, university?: string | null): string {
  let label: string;
  if (NAMED[credentialType]) label = NAMED[credentialType];
  else if (credentialType.startsWith(SCHOLARSHIP_PREFIX)) {
    label = `${credentialType.slice(SCHOLARSHIP_PREFIX.length).trim() || "Scholarship"} (scholarship portal)`;
  } else {
    const words = credentialType.replace(/_/g, " ").trim();
    label = words.charAt(0).toUpperCase() + words.slice(1);
  }
  return university ? `${label} — ${university}` : label;
}

/** This portal first, then the named ones in the section's order, then the rest by name. */
export function orderLogins(logins: readonly StudentLogin[]): StudentLogin[] {
  const rank = (l: StudentLogin) => {
    const at = ORDER.indexOf(l.credentialType);
    return at === -1 ? ORDER.length : at;
  };
  return [...logins].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      // A student-level login before the same kind kept against one application.
      Number(Boolean(a.university)) - Number(Boolean(b.university)) ||
      credentialLabel(a.credentialType, a.university).localeCompare(credentialLabel(b.credentialType, b.university))
  );
}

/** A login with nothing in it is not worth sending. */
export function hasSomething(login: StudentLogin): boolean {
  return Boolean(login.username.trim() || login.password.trim());
}

export type CredentialsMessageInput = {
  studentName: string;
  /** Where this portal is signed in to, for the HMARK login's block. */
  signInUrl: string;
  /** A student signs in with this as well as their email. */
  studentCode?: string | null;
  logins: readonly StudentLogin[];
};

type Block = { label: string; lines: { name: string; value: string }[] };

function blocks(input: CredentialsMessageInput): Block[] {
  return orderLogins(input.logins.filter(hasSomething)).map((login) => {
    const lines: { name: string; value: string }[] = [];
    if (login.credentialType === PORTAL_LOGIN) {
      lines.push({ name: "Sign in at", value: input.signInUrl });
      if (input.studentCode) lines.push({ name: "Student ID", value: input.studentCode });
      if (login.username) lines.push({ name: input.studentCode ? "or email" : "Email", value: login.username });
    } else if (login.username) {
      lines.push({ name: "Username", value: login.username });
    }
    if (login.password) lines.push({ name: "Password", value: login.password });
    return { label: credentialLabel(login.credentialType, login.university), lines };
  });
}

/** The labels of what is sent, in order: for the confirmation, and the note on the timeline. */
export function loginLabels(logins: readonly StudentLogin[]): string[] {
  return orderLogins(logins.filter(hasSomething)).map((l) => credentialLabel(l.credentialType, l.university));
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "there";

const KEEP_SAFE =
  "Please keep these to yourself: don't forward this or share it with anyone. If a login stops working, message your counsellor.";

/**
 * The message to paste into WhatsApp: each login under its name in *bold*,
 * which is how WhatsApp writes bold.
 */
export function credentialsWhatsapp(input: CredentialsMessageInput): string {
  const parts = [`Dear ${firstName(input.studentName)},`, "", "Here are your login details from HMARK Consultants."];
  for (const b of blocks(input)) {
    parts.push("", `*${b.label}*`, ...b.lines.map((l) => `${l.name}: ${l.value}`));
  }
  parts.push("", KEEP_SAFE, "", "HMARK Consultants");
  return parts.join("\n");
}

/** "Your HMARK Student Portal login" when that is all it carries, else what it is. */
export function credentialsEmailSubject(logins: readonly StudentLogin[] = []): string {
  const sent = logins.filter(hasSomething);
  if (sent.length === 1 && sent[0].credentialType === PORTAL_LOGIN) return "Your HMARK Student Portal login";
  return "Your login details from HMARK Consultants";
}

/** The email's plain text: the same as the message, without WhatsApp's asterisks. */
export function credentialsEmailText(input: CredentialsMessageInput): string {
  const parts = [`Dear ${input.studentName.trim() || "student"},`, "", "Here are your login details from HMARK Consultants."];
  for (const b of blocks(input)) {
    parts.push("", b.label, ...b.lines.map((l) => `  ${l.name}: ${l.value}`));
  }
  parts.push("", KEEP_SAFE, "", "HMARK Consultants");
  return parts.join("\n");
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// The house style of the login mail (staffLoginEmail.ts).
const INK = "#14151a";
const BODY = "#5f6068";
const FAINT = "#9b9ca3";
const HAIR = "#ebebe8";
const PAGE = "#f6f6f4";
const GREEN = "#157a5b";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

/** The email's HTML: one card per login, the values in a monospace face so 0 and O are told apart. */
export function credentialsEmailHtml(input: CredentialsMessageInput): string {
  const cards = blocks(input)
    .map((b) => {
      const rows = b.lines
        .map((l) => {
          const value =
            l.name === "Sign in at"
              ? `<a href="${esc(l.value)}" style="color:${GREEN};text-decoration:none">${esc(l.value)}</a>`
              : `<span style="font-family:${MONO};color:${INK}">${esc(l.value)}</span>`;
          return `<tr><td style="padding:3px 12px 3px 0;color:${BODY};font-size:13px;white-space:nowrap;vertical-align:top">${esc(l.name)}</td><td style="padding:3px 0;font-size:14px;word-break:break-all">${value}</td></tr>`;
        })
        .join("");
      return `<div style="border:1px solid ${HAIR};border-radius:10px;padding:14px 16px;margin:0 0 12px">
  <div style="font-weight:600;color:${INK};font-size:14px;margin:0 0 6px">${esc(b.label)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows}</table>
</div>`;
    })
    .join("\n");
  return `<!doctype html><html><body style="margin:0;background:${PAGE};font-family:${FONT}">
<div style="max-width:560px;margin:0 auto;padding:28px 16px">
<div style="background:#ffffff;border:1px solid ${HAIR};border-radius:14px;padding:26px 24px">
  <p style="margin:0 0 6px;color:${INK};font-size:16px;font-weight:600">Your login details</p>
  <p style="margin:0 0 18px;color:${BODY};font-size:14px;line-height:1.5">Dear ${esc(input.studentName.trim() || "student")}, here are your login details from HMARK Consultants.</p>
  ${cards}
  <p style="margin:16px 0 0;color:${BODY};font-size:13px;line-height:1.5">${esc(KEEP_SAFE)}</p>
</div>
<p style="margin:14px 0 0;text-align:center;color:${FAINT};font-size:12px">HMARK Consultants</p>
</div></body></html>`;
}

/** The internal note on the student's timeline: what went, how, to where — never a password. */
export function credentialsNote(how: "email" | "copy", labels: readonly string[], to?: string | null): string {
  const what = labels.join(", ");
  return how === "email"
    ? `Emailed the student their login details${to ? ` at ${to}` : ""}: ${what}.`
    : `Copied the student's login details as a message: ${what}.`;
}
