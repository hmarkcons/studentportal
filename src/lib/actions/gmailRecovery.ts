"use server";

import { createClient } from "@/lib/supabase/server";
import { decodeCsvBytes } from "@/lib/csv";
import { phoneError } from "@/lib/phoneNumber";
import {
  backupCodesFileError,
  loadGmailRecoveryStatus,
  mergeRecovery,
  parseBackupCodes,
  parseRecoveryDetails,
  recoveryEmailError,
  withoutPart,
  type GmailRecoveryDetails,
  type GmailRecoveryStatus,
  type RecoveryPart,
} from "@/lib/gmailRecovery";

// A student's Gmail recovery details (0332). The database decides who may
// read and write them — a Super Admin or the student's processing officer —
// and says so in its error, which is passed on as it is.
//
// None of these revalidate: nothing else on the page changes, and a
// revalidation would make staff wait for the whole student page. Each answers
// with what is now on file, and the block shows that.

type Result = { error: string } | { status: GmailRecoveryStatus | null; details: GmailRecoveryDetails | null };

async function readStored(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studentId: string,
): Promise<{ error: string } | { stored: GmailRecoveryDetails }> {
  const { data, error } = await supabase.rpc("read_gmail_recovery", { p_student: studentId });
  if (error) return { error: error.message };
  return { stored: parseRecoveryDetails(data) };
}

async function store(supabase: Awaited<ReturnType<typeof createClient>>, studentId: string, d: GmailRecoveryDetails): Promise<Result> {
  const { error } = await supabase.rpc("store_gmail_recovery", {
    p_student: studentId,
    p_email: d.email,
    p_phone: d.phone,
    p_codes: d.codes,
    p_codes_file_name: d.codesFileName,
  });
  if (error) return { error: error.message };
  const status = await loadGmailRecoveryStatus(supabase, studentId);
  return { status, details: d.email || d.phone || d.codes ? d : null };
}

/** Saves the recovery email, the mobile and the backup codes file; a field left blank keeps what is on file. */
export async function saveGmailRecovery(studentId: string, formData: FormData): Promise<Result> {
  const email = String(formData.get("recovery_email") ?? "").trim();
  const phone = String(formData.get("recovery_phone") ?? "").trim();
  const file = formData.get("backup_codes");

  const emailProblem = recoveryEmailError(email);
  if (emailProblem) return { error: emailProblem };
  const phoneProblem = phoneError(phone, "recovery mobile number");
  if (phoneProblem) return { error: phoneProblem };

  let codes: { text: string; fileName: string } | null = null;
  if (file instanceof File && file.size > 0) {
    const fileProblem = backupCodesFileError(file);
    if (fileProblem) return { error: fileProblem };
    // Not file.text(): a file saved on Windows may not be UTF-8 (src/lib/csv.ts).
    const parsed = parseBackupCodes(decodeCsvBytes(await file.arrayBuffer()));
    if ("error" in parsed) return { error: parsed.error };
    codes = { text: parsed.text, fileName: file.name.slice(0, 200) };
  }
  if (!email && !phone && !codes) return { error: "Enter the recovery email or mobile, or choose the backup codes file." };

  const supabase = await createClient();
  const current = await readStored(supabase, studentId);
  if ("error" in current) return { error: current.error };
  return store(supabase, studentId, mergeRecovery(current.stored, { email, phone, codes }));
}

/** The details, decrypted, for a Super Admin or the student's processing officer. */
export async function revealGmailRecovery(studentId: string): Promise<{ error: string } | { details: GmailRecoveryDetails }> {
  const supabase = await createClient();
  const current = await readStored(supabase, studentId);
  if ("error" in current) return { error: current.error };
  return { details: current.stored };
}

/** Removes one part; removing the last leaves nothing on file. */
export async function removeGmailRecoveryPart(studentId: string, part: RecoveryPart): Promise<Result> {
  if (part !== "email" && part !== "phone" && part !== "codes") return { error: "Nothing to remove." };
  const supabase = await createClient();
  const current = await readStored(supabase, studentId);
  if ("error" in current) return { error: current.error };
  return store(supabase, studentId, withoutPart(current.stored, part));
}
