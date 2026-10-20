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
  /** The page it signs in to (src/lib/portalLink.ts), sent as "Sign in here". */
  link?: string | null;
};

/** What the link line of a login is called, in the email and the message. */
export const SIGN_IN_HERE = "Sign in here";

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
export function orderLogins<T extends StudentLogin>(logins: readonly T[]): T[] {
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
    // This portal's own page is "Sign in at", above; every other login's is its saved link.
    if (login.credentialType !== PORTAL_LOGIN && login.link) lines.push({ name: SIGN_IN_HERE, value: login.link });
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

/** The internal note on the student's timeline: what went, how, to where — never a password. */
export function credentialsNote(how: "email" | "copy", labels: readonly string[], to?: string | null): string {
  const what = labels.join(", ");
  return how === "email"
    ? `Emailed the student their login details${to ? ` at ${to}` : ""}: ${what}.`
    : `Copied the student's login details as a message: ${what}.`;
}
