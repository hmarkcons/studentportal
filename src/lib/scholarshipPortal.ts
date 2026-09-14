// A student's logins for the scholarship portals they have to use.
//
// Not one login but several: the regional agency's own portal, Universitaly,
// sometimes the university's. They are the student's own accounts, so they
// live in encrypted_credentials against the student — the same store, the same
// encryption and the same read_credential/store_credential path as the visa
// appointment login, rather than a second secret store with its own rules.
//
// encrypted_credentials is keyed on (owner_type, owner_id, credential_type),
// so "several portals" is several credential types. The prefix is what tells a
// scholarship portal apart from the visa login and from this portal's own
// password.

export const SCHOLARSHIP_PORTAL_PREFIX = "scholarship_portal:";

/** The stored credential_type for a portal the office has named. */
export function scholarshipPortalType(label: string): string {
  return `${SCHOLARSHIP_PORTAL_PREFIX}${label.trim()}`;
}

/** The portal's name, or null when this credential is not a scholarship one. */
export function scholarshipPortalLabel(credentialType: string): string | null {
  if (!credentialType.startsWith(SCHOLARSHIP_PORTAL_PREFIX)) return null;
  const label = credentialType.slice(SCHOLARSHIP_PORTAL_PREFIX.length).trim();
  return label || null;
}

export type ScholarshipPortal = { credentialType: string; label: string };

/** The scholarship portals among everything stored for this student. */
export function scholarshipPortals(credentialTypes: string[]): ScholarshipPortal[] {
  return credentialTypes
    .map((credentialType) => {
      const label = scholarshipPortalLabel(credentialType);
      return label ? { credentialType, label } : null;
    })
    .filter((p): p is ScholarshipPortal => p !== null)
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Why this portal cannot be added, or null. */
export function portalLabelError(label: string, existingLabels: string[]): string | null {
  const trimmed = label.trim();
  if (!trimmed) return "Give the portal a name — DSU Toscana, Universitaly, whichever it is.";
  if (trimmed.length > 60) return "That name is too long — 60 characters is plenty.";
  // The prefix is delimited by the first colon, so a colon in the name would
  // make the label unreadable on the way back out.
  if (trimmed.includes(":")) return "A portal name cannot contain a colon.";
  if (existingLabels.some((e) => e.toLowerCase() === trimmed.toLowerCase())) {
    return `There is already a portal called ${trimmed}. Edit that one instead of adding a second.`;
  }
  return null;
}
