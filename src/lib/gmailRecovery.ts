// A student's Gmail recovery details (0332): the backup codes file Google
// gives, the recovery email and the recovery mobile number. Only a Super Admin
// and the student's processing officer may open them; everyone else who can
// see the student is told which parts are on file and nothing more.
//
// Pure, so it can be unit-tested under plain Node: no `@/` imports.
import type { SupabaseClient } from "@supabase/supabase-js";

/** What is on file, as anyone who can see the student is shown it. */
export type GmailRecoveryStatus = {
  hasEmail: boolean;
  hasPhone: boolean;
  hasCodes: boolean;
  updatedAt: string | null;
  updatedByName: string | null;
  /** A Super Admin, or this student's processing officer. */
  canOpen: boolean;
};

/** The details themselves, decrypted. */
export type GmailRecoveryDetails = {
  email: string | null;
  phone: string | null;
  codes: string | null;
  codesFileName: string | null;
};

/** Google's file is a few hundred bytes; anything this size is not it. */
export const BACKUP_CODES_MAX_BYTES = 8 * 1024;

export const BACKUP_CODES_ACCEPT = ".txt,text/plain";

const EMPTY: GmailRecoveryDetails = { email: null, phone: null, codes: null, codesFileName: null };

/** Why this upload cannot be the backup codes file, or null. */
export function backupCodesFileError(file: { name: string; size: number }): string | null {
  if (!/\.txt$/i.test(file.name)) return "Upload the backup codes as the .txt file Google gives.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > BACKUP_CODES_MAX_BYTES) return "That file is too large to be Google's backup codes file.";
  return null;
}

/**
 * Google's codes are eight digits, written "1234 5678" — older files run them
 * together. Counted so that the wrong text file is refused rather than kept,
 * and so staff can see how many the file held.
 */
const CODE = /(?<!\d)\d{4} ?\d{4}(?!\d)/g;

export function countBackupCodes(text: string): number {
  return text.match(CODE)?.length ?? 0;
}

/** The file's text tidied for keeping, or why it is not a backup codes file. */
export function parseBackupCodes(raw: string): { text: string; count: number } | { error: string } {
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
  if (!text) return { error: "That file is empty." };
  // A binary file renamed .txt: control characters other than tab and line breaks.
  const binary = Array.from(text).some((c) => {
    const n = c.charCodeAt(0);
    return n < 9 || (n > 13 && n < 32);
  });
  if (binary) return { error: "That is not a text file." };
  const count = countBackupCodes(text);
  if (count === 0) return { error: "No backup codes in that file — Google's are eight digits, like 1234 5678." };
  return { text, count };
}

/** A plain address check: one address, with an @ and a dot after it. */
export function recoveryEmailError(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(v)) return "Enter the recovery email as one address, like name@example.com.";
  return null;
}

/** What was stored, read back from read_gmail_recovery's JSON. */
export function parseRecoveryDetails(json: unknown): GmailRecoveryDetails {
  if (!json || typeof json !== "object") return { ...EMPTY };
  const o = json as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  return { email: text(o.email), phone: text(o.phone), codes: text(o.codes), codesFileName: text(o.codes_file_name) };
}

/** A blank field keeps what is on file; a new file replaces the codes. */
export function mergeRecovery(
  stored: GmailRecoveryDetails,
  submitted: { email?: string; phone?: string; codes?: { text: string; fileName: string } | null },
): GmailRecoveryDetails {
  const email = submitted.email?.trim() || stored.email;
  const phone = submitted.phone?.trim() || stored.phone;
  const codes = submitted.codes ? submitted.codes.text : stored.codes;
  const codesFileName = submitted.codes ? submitted.codes.fileName : stored.codesFileName;
  return { email, phone, codes, codesFileName };
}

export type RecoveryPart = "email" | "phone" | "codes";

export function withoutPart(stored: GmailRecoveryDetails, part: RecoveryPart): GmailRecoveryDetails {
  if (part === "codes") return { ...stored, codes: null, codesFileName: null };
  return { ...stored, [part]: null };
}

export const PART_LABELS: Record<RecoveryPart, string> = {
  email: "Recovery email",
  phone: "Recovery mobile",
  codes: "Backup codes",
};

export function partsOnFile(status: Pick<GmailRecoveryStatus, "hasEmail" | "hasPhone" | "hasCodes">): RecoveryPart[] {
  const parts: RecoveryPart[] = [];
  if (status.hasEmail) parts.push("email");
  if (status.hasPhone) parts.push("phone");
  if (status.hasCodes) parts.push("codes");
  return parts;
}

/** "Recovery email, recovery mobile and backup codes", or null for nothing. */
export function onFileSummary(status: Pick<GmailRecoveryStatus, "hasEmail" | "hasPhone" | "hasCodes">): string | null {
  const names = partsOnFile(status).map((p, i) => (i === 0 ? PART_LABELS[p] : PART_LABELS[p].toLowerCase()));
  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** The name the codes are downloaded under: the file's own, or a plain one. */
export function codesDownloadName(details: Pick<GmailRecoveryDetails, "codesFileName">): string {
  const name = details.codesFileName?.trim();
  return name && /\.txt$/i.test(name) ? name : "gmail-backup-codes.txt";
}

type StatusRow = {
  has_email: boolean;
  has_phone: boolean;
  has_codes: boolean;
  updated_at: string | null;
  updated_by_name: string | null;
  can_open: boolean;
};

export function statusFromRow(row: StatusRow | null | undefined): GmailRecoveryStatus | null {
  if (!row) return null;
  return {
    hasEmail: row.has_email,
    hasPhone: row.has_phone,
    hasCodes: row.has_codes,
    updatedAt: row.updated_at,
    updatedByName: row.updated_by_name,
    canOpen: row.can_open,
  };
}

/** What is on file for the student, or null when the viewer cannot see them. */
export async function loadGmailRecoveryStatus(supabase: SupabaseClient, studentId: string): Promise<GmailRecoveryStatus | null> {
  const { data, error } = await supabase.rpc("gmail_recovery_status", { p_student: studentId });
  if (error) return null;
  return statusFromRow((Array.isArray(data) ? data[0] : data) as StatusRow | null);
}
