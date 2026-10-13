// The logins the office keeps for a registered student, as the student sees
// them on their own pages (0333): the username, the password and the page it
// signs in to, shown as they are — no Reveal — and never changed there.
//
// my_logins() returns every one kept for the signed-in student, their own and
// each kept against one of their applications, decrypted in one call. This
// portal's own login is not among them, and the Gmail recovery details (0332)
// are another table that never reaches a student.
//
// Pure apart from the loader, which takes the client it is given, so the unit
// tests import it directly (scripts/student-logins-test.mjs).
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseStoredLogin } from "./portalLink.ts";
import { PORTAL_LOGIN, credentialLabel, orderLogins } from "./studentCredentials.ts";
import { scholarshipPortalLabel } from "./scholarshipPortal.ts";

export type MyLogin = {
  ownerType: "student" | "application";
  /** The student, or the application it is kept against. */
  ownerId: string;
  credentialType: string;
  /** For a login kept against one application: its university. */
  university: string | null;
  /** What it is called to the student: "Gmail", "University portal — Roma Tre University". */
  label: string;
  username: string;
  password: string;
  link: string | null;
  /** What kind of account it is, which decides its group, icon and colour on the Logins page. */
  kind: LoginKind;
  /** When HMARK last changed it (0334). */
  updatedAt: string | null;
};

export type MyLoginRow = {
  owner_type: string;
  owner_id: string;
  credential_type: string;
  university: string | null;
  plaintext: string | null;
  updated_at?: string | null;
};

export type LoginKind = "email" | "university" | "visa" | "scholarship" | "other";

/** The kind of account a login is for, from what it is stored as. */
export function loginKind(login: { credentialType: string; ownerType: string }): LoginKind {
  const t = login.credentialType;
  if (scholarshipPortalLabel(t)) return "scholarship";
  if (login.ownerType === "application" || t === "university_portal" || /universit/i.test(t)) return "university";
  if (t === "gmail" || /mail|outlook|yahoo/i.test(t)) return "email";
  if (/vfs|appointment|visa/i.test(t)) return "visa";
  return "other";
}

/**
 * The Logins page's groups, in its order, each in the colour of the menu
 * section it belongs to (NavIcon): the email account first, as the one every
 * other account sends its resets to.
 */
export const LOGIN_GROUPS: readonly { kind: LoginKind; title: string; blurb: string; accent: 1 | 2 | 3 | 4 | 5 }[] = [
  { kind: "email", title: "Email", blurb: "Your email account — every portal sends its codes and resets here.", accent: 1 },
  { kind: "university", title: "Universities", blurb: "Where your applications are made and followed.", accent: 2 },
  { kind: "visa", title: "Visa", blurb: "For booking and following your visa appointment.", accent: 5 },
  { kind: "scholarship", title: "Scholarships", blurb: "The regional and national scholarship portals.", accent: 4 },
  { kind: "other", title: "Other accounts", blurb: "Anything else HMARK keeps for you.", accent: 3 },
];

export type LoginGroup = (typeof LOGIN_GROUPS)[number] & { logins: MyLogin[] };

/** The logins by group, in the page's order; a group with none is left out. */
export function groupLogins(logins: readonly MyLogin[]): LoginGroup[] {
  return LOGIN_GROUPS.map((g) => ({ ...g, logins: logins.filter((l) => l.kind === g.kind) })).filter((g) => g.logins.length > 0);
}

export function loginAccent(kind: LoginKind): 1 | 2 | 3 | 4 | 5 {
  return LOGIN_GROUPS.find((g) => g.kind === kind)?.accent ?? 3;
}

/**
 * What a login's card is headed, and the line under it: where the group or
 * the card already says what kind it is, the name that tells two apart —
 * "University of Pisa" over "University portal", "DSU Toscana" over
 * "Scholarship portal" — and otherwise its name as Portal credentials gives it.
 */
export function loginHeading(login: Pick<MyLogin, "ownerType" | "credentialType" | "university" | "label">): { title: string; caption: string | null } {
  if (login.ownerType === "application" && login.university) return { title: login.university, caption: credentialLabel(login.credentialType) };
  const portal = scholarshipPortalLabel(login.credentialType);
  if (portal) return { title: portal, caption: "Scholarship portal" };
  return { title: login.label, caption: null };
}

/** How many the Dashboard shows before "View all". */
export const DASHBOARD_LOGINS = 2;

/** The Dashboard's share: the first two, in Portal credentials' order, and the rest by name only. */
export function dashboardLogins(logins: readonly MyLogin[], limit = DASHBOARD_LOGINS): { shown: MyLogin[]; more: MyLogin[] } {
  return { shown: logins.slice(0, limit), more: logins.slice(limit) };
}

/** Where a login is on the Logins page, so the Dashboard can link straight to it. */
export function loginAnchor(login: Pick<MyLogin, "ownerId" | "credentialType">): string {
  const slug = login.credentialType
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `login-${login.ownerId.slice(0, 8)}-${slug || "account"}`;
}

/** Rows from my_logins(), read, named and put in the order Portal credentials uses; empty ones left out. */
export function loginsFromRows(rows: readonly MyLoginRow[] | null | undefined): MyLogin[] {
  const logins: MyLogin[] = [];
  for (const row of rows ?? []) {
    if (row.credential_type === PORTAL_LOGIN) continue;
    if (row.owner_type !== "student" && row.owner_type !== "application") continue;
    const stored = parseStoredLogin(row.plaintext);
    if (!stored.username.trim() && !stored.password.trim() && !stored.link) continue;
    const university = row.owner_type === "application" ? row.university?.trim() || "your university" : null;
    logins.push({
      ownerType: row.owner_type,
      ownerId: row.owner_id,
      credentialType: row.credential_type,
      university,
      label: credentialLabel(row.credential_type, university),
      username: stored.username,
      password: stored.password,
      link: stored.link,
      kind: loginKind({ credentialType: row.credential_type, ownerType: row.owner_type }),
      updatedAt: row.updated_at ?? null,
    });
  }
  return orderLogins(logins);
}

/**
 * The visa appointment login: the preset first, then anything typed by hand
 * before it existed — an older visa_portal or vfs_login is not stranded.
 */
export function visaAppointmentLogin(logins: readonly MyLogin[]): MyLogin | null {
  const own = logins.filter((l) => l.ownerType === "student");
  return own.find((l) => l.credentialType === "visa_appointment_portal") ?? own.find((l) => /vfs|appointment|visa/i.test(l.credentialType)) ?? null;
}

/** The scholarship portals, each under the portal's own name. */
export function scholarshipLogins(logins: readonly MyLogin[]): MyLogin[] {
  return logins
    .filter((l) => l.ownerType === "student" && scholarshipPortalLabel(l.credentialType))
    .map((l) => ({ ...l, label: scholarshipPortalLabel(l.credentialType) ?? l.label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** The logins kept against one application — its university portal. */
export function applicationLogins(logins: readonly MyLogin[], applicationId: string): MyLogin[] {
  return logins.filter((l) => l.ownerType === "application" && l.ownerId === applicationId);
}

/** Every login kept for the signed-in student; none on any error, as if none were saved. */
export async function loadMyLogins(supabase: SupabaseClient): Promise<MyLogin[]> {
  const { data, error } = await supabase.rpc("my_logins");
  if (error) return [];
  return loginsFromRows(data as MyLoginRow[] | null);
}
