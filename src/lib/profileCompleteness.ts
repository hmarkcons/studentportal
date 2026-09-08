// What is still missing from a student's profile, and whether their passport
// is usable.
//
// The Academics section already showed a completeness checklist for
// qualifications; the rest of the profile had none, so a student filling it in
// had no way to know what was still outstanding — which is the only reason
// they are on that page.
//
// The list is deliberately what a visa application actually needs, not every
// column that exists. Nagging about a field nobody uses teaches people to
// ignore the whole checklist.

import { dateOfBirthError } from "./dateOfBirth.ts";

export type ProfileGroup = "personal" | "passport" | "sponsor";

export type ProfileCheck = { label: string; met: boolean; group: ProfileGroup };

export type ProfileInput = {
  contact_number?: string | null;
  date_of_birth?: string | null;
  address?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_number?: string | null;
  passport_number?: string | null;
  passport_expiry?: string | null;
  cnic?: string | null;
  financial_sponsor_name?: string | null;
  financial_sponsor_relation?: string | null;
  financial_details?: { sponsor_contact_number?: string | null } | null;
};

const filled = (v: string | null | undefined) => Boolean(v && String(v).trim());

export function profileChecklist(input: ProfileInput): ProfileCheck[] {
  return [
    { group: "personal", label: "Contact number", met: filled(input.contact_number) },
    // Not just "filled": four registered students have a date of birth a few
    // days after their own record was created, because the picker was left
    // near today and submitted. A ticked box for a date that cannot be right
    // is worse than an empty one, since it tells the student to stop looking.
    { group: "personal", label: "Date of birth", met: filled(input.date_of_birth) && !dateOfBirthError(input.date_of_birth) },
    { group: "personal", label: "Home address", met: filled(input.address) },
    { group: "personal", label: "Emergency contact name", met: filled(input.emergency_contact_name) },
    { group: "personal", label: "Emergency contact number", met: filled(input.emergency_contact_number) },
    { group: "passport", label: "Passport number", met: filled(input.passport_number) },
    { group: "passport", label: "Passport expiry date", met: filled(input.passport_expiry) },
    { group: "passport", label: "CNIC / B-Form number", met: filled(input.cnic) },
    { group: "sponsor", label: "Sponsor name", met: filled(input.financial_sponsor_name) },
    { group: "sponsor", label: "Sponsor relation", met: filled(input.financial_sponsor_relation) },
    { group: "sponsor", label: "Sponsor contact number", met: filled(input.financial_details?.sponsor_contact_number) },
  ];
}

export function countMissing(checks: ProfileCheck[]): number {
  return checks.filter((c) => !c.met).length;
}

export const PROFILE_GROUP_LABELS: Record<ProfileGroup, string> = {
  personal: "Personal details",
  passport: "Passport & identity",
  sponsor: "Financial sponsor",
};

export type PassportState = "missing" | "expired" | "expiring" | "ok";

export type PassportStatus = {
  state: PassportState;
  expiry: string | null;
  /** Whole days until expiry; negative once past. Null when no date is held. */
  daysLeft: number | null;
};

/**
 * Most student visas require six months' passport validity beyond entry, so
 * "expires in five months" is a problem to raise now rather than a date to
 * note. Compared in UTC against the stored date-only value.
 */
export const PASSPORT_MIN_MONTHS = 6;
const EXPIRING_WINDOW_DAYS = PASSPORT_MIN_MONTHS * 30;

export function passportStatus(expiry: string | null | undefined): PassportStatus {
  if (!filled(expiry) || !/^\d{4}-\d{2}-\d{2}$/.test(String(expiry).trim())) {
    return { state: "missing", expiry: null, daysLeft: null };
  }
  const value = String(expiry).trim();
  const [y, m, d] = value.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d);
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysLeft = Math.round((target - today) / 86_400_000);

  if (daysLeft < 0) return { state: "expired", expiry: value, daysLeft };
  if (daysLeft <= EXPIRING_WINDOW_DAYS) return { state: "expiring", expiry: value, daysLeft };
  return { state: "ok", expiry: value, daysLeft };
}
