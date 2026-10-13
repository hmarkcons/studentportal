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
};

export type MyLoginRow = {
  owner_type: string;
  owner_id: string;
  credential_type: string;
  university: string | null;
  plaintext: string | null;
};

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
