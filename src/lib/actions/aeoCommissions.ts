"use server";

import { revalidatePath } from "next/cache";
import { getStaffSession } from "@/lib/auth/session";
import { parseCsvWithHeader, readCsvFile } from "@/lib/csv";
import { MAX_UPLOAD_BYTES, fileSizeError } from "@/lib/fileSize";
import { uploadedFile } from "@/lib/stagedUpload";
import { fileDigest, importIntent } from "@/lib/importIntent";
import { emptyReport, finishReport, type ImportResult } from "@/lib/importMerge";
import { keyedRow, looksLikeAeoSheet, planAeoImport, readForm, type AeoRecord, type SheetKey } from "@/lib/aeoCommissions";
import { loadAeoRecords, seesAeo } from "@/lib/aeoLoad";

// AEO Pakistan's commission record (0335). Super Admin and Finance only: the
// table's policies say so, and each action checks first so that a refusal
// reads as one rather than as nothing having matched.

const PAGE = "/finance/aeo-pakistan";
const DENIED = "Only a Super Admin or the account officer (Finance) can change the AEO Pakistan record.";

type Result = { error: string } | { success: true; message?: string };

type Supabase = Awaited<ReturnType<typeof getStaffSession>>["supabase"];

async function gate(): Promise<{ error: string } | { supabase: Supabase }> {
  const { supabase, staff } = await getStaffSession();
  if (!staff || !seesAeo(staff)) return { error: DENIED };
  return { supabase };
}

/** Postgres's words for a challan already on file, in ours. */
function saidOf(message: string, challan: string): string {
  if (/aeo_ielts_commissions_challan|duplicate key/i.test(message)) return `Challan ${challan} is already on file — find it in the table and edit it there.`;
  return message;
}

/** Adds a registration, or saves the one given. */
export async function saveAeoRecord(id: string | null, formData: FormData): Promise<Result> {
  const allowed = await gate();
  if ("error" in allowed) return allowed;
  const read = readForm((name) => String(formData.get(name) ?? ""));
  if ("error" in read) return { error: read.error };

  const { supabase } = allowed;
  if (id) {
    const { data, error } = await supabase.from("aeo_ielts_commissions").update(read.values).eq("id", id).select("id");
    if (error) return { error: saidOf(error.message, read.values.challan_number) };
    if (!data?.length) return { error: "That record is no longer there — reload the page." };
  } else {
    let values = read.values;
    if (values.sr_no === null) {
      // Numbered after the highest on file, as the office numbers them.
      const { data: top } = await supabase.from("aeo_ielts_commissions").select("sr_no").order("sr_no", { ascending: false, nullsFirst: false }).limit(1);
      values = { ...values, sr_no: ((top?.[0]?.sr_no as number | null) ?? 0) + 1 };
    }
    const { data, error } = await supabase.from("aeo_ielts_commissions").insert(values).select("id");
    if (error) return { error: saidOf(error.message, values.challan_number) };
    if (!data?.length) return { error: DENIED };
  }
  revalidatePath(PAGE);
  return { success: true };
}

const uuids = (ids: readonly string[]) => [...new Set(ids)].filter((id) => /^[0-9a-f-]{36}$/i.test(id));

export async function deleteAeoRecords(ids: string[]): Promise<Result> {
  const allowed = await gate();
  if ("error" in allowed) return allowed;
  const wanted = uuids(ids);
  if (wanted.length === 0) return { error: "Choose the records to delete." };
  const { data, error } = await allowed.supabase.from("aeo_ielts_commissions").delete().in("id", wanted).select("id");
  if (error) return { error: error.message };
  revalidatePath(PAGE);
  // A Super Admin can bring them back from the audit log (0322).
  return { success: true, message: `${data?.length ?? 0} deleted.` };
}

/** Marks the records paid on one date with one reference — a single transfer often covers several. */
export async function markAeoPaid(ids: string[], paidOn: string, reference: string): Promise<Result> {
  const allowed = await gate();
  if ("error" in allowed) return allowed;
  const wanted = uuids(ids);
  if (wanted.length === 0) return { error: "Choose the records AEO has paid." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return { error: "Enter the date AEO paid." };
  const ref = reference.trim();
  if (ref.length > 120) return { error: "The reference is longer than 120 characters." };
  const { data, error } = await allowed.supabase
    .from("aeo_ielts_commissions")
    .update({ payment_status: "paid", paid_on: paidOn, payment_reference: ref || null })
    .in("id", wanted)
    .select("id");
  if (error) return { error: error.message };
  revalidatePath(PAGE);
  return { success: true, message: `${data?.length ?? 0} marked paid.` };
}

export async function markAeoUnpaid(ids: string[]): Promise<Result> {
  const allowed = await gate();
  if ("error" in allowed) return allowed;
  const wanted = uuids(ids);
  if (wanted.length === 0) return { error: "Choose the records to mark unpaid." };
  const { data, error } = await allowed.supabase
    .from("aeo_ielts_commissions")
    .update({ payment_status: "unpaid", paid_on: null, payment_reference: null })
    .in("id", wanted)
    .select("id");
  if (error) return { error: error.message };
  revalidatePath(PAGE);
  return { success: true, message: `${data?.length ?? 0} marked unpaid.` };
}

/** The uploaded sheet's rows, keyed by the table's own column names. */
async function readSheet(file: File | null): Promise<{ cells: Partial<Record<SheetKey, string>>[]; digest: string } | { error: string }> {
  if (file) {
    const tooLarge = fileSizeError(file.size, MAX_UPLOAD_BYTES, "file");
    if (tooLarge) return { error: tooLarge };
  }
  if (!file || file.size === 0) return { error: "Choose the spreadsheet first — .xlsx or .csv." };

  const { isXlsx, parseXlsxSheets } = await import("@/lib/spreadsheet");
  let rows: Record<string, string>[];
  if (isXlsx(file)) {
    // Whichever sheet is the register: the office's own workbook has one,
    // an export also carries the hidden list its dropdown reads.
    const sheets = await parseXlsxSheets(file);
    const sheet = sheets.find((s) => looksLikeAeoSheet(s.headers));
    if (!sheet) return { error: "No sheet in that workbook has a Candidate's Name and a Challan Number column." };
    rows = sheet.rows;
  } else {
    // Not file.text(): Excel saves CSV in Windows-1252 (src/lib/csv.ts).
    rows = parseCsvWithHeader(await readCsvFile(file));
    if (rows.length && !looksLikeAeoSheet(Object.keys(rows[0]))) return { error: "That file has no Candidate's Name and Challan Number columns." };
  }
  if (rows.length === 0) return { error: "The file has no rows under its headers." };
  return { cells: rows.map(keyedRow), digest: fileDigest(await file.arrayBuffer()) };
}

/**
 * Imports the office's sheet, or an export of this one — previewed first, as
 * every import is (PreviewedImport). Matched by challan number: the same
 * challan updates its row, a new one is added, and a blank cell changes
 * nothing.
 */
export async function importAeoCommissions(_prev: ImportResult | undefined, formData: FormData): Promise<ImportResult> {
  const allowed = await gate();
  if ("error" in allowed) return { error: allowed.error };
  const { supabase } = allowed;

  const read = await readSheet(await uploadedFile(formData, "file"));
  if ("error" in read) return { error: read.error };
  const intent = importIntent(formData, read.digest, [], "This is not the file that was previewed. Preview it again, then apply.");
  if ("error" in intent) return { error: intent.error };

  let stored: AeoRecord[];
  try {
    stored = await loadAeoRecords(supabase);
  } catch (error) {
    return { error: `Could not read the record: ${(error as Error).message}` };
  }

  const plan = planAeoImport(read.cells, stored);
  if (plan.empty && plan.problems.length === 0) return { error: "No row has a candidate's name and a challan number — is this the AEO sheet?" };

  const report = emptyReport([{ one: "registration", many: "registrations" }]);
  const tally = report.tallies![0];
  report.problems.push(...plan.problems);
  tally.unchanged = plan.unchanged;

  if (intent.dryRun) {
    tally.added = plan.creates.length;
    report.additions.push(...plan.additions);
    tally.updated = plan.updates.length;
    for (const u of plan.updates) report.changes.push(...u.lines);
    return finishReport(report, "preview", intent.fingerprint);
  }

  if (plan.creates.length > 0) {
    // One statement, every row the same shape (planAeoImport): all or nothing.
    const { data, error } = await supabase.from("aeo_ielts_commissions").insert(plan.creates).select("id");
    if (error || (data?.length ?? 0) !== plan.creates.length) {
      report.failures.push(
        `Could not add ${plan.creates.length} registration${plan.creates.length === 1 ? "" : "s"}: ${error?.message ?? "the database refused them"}`,
      );
    } else {
      tally.added = plan.creates.length;
      report.additions.push(...plan.additions);
    }
  }
  for (const u of plan.updates) {
    const { data, error } = await supabase.from("aeo_ielts_commissions").update(u.values).eq("id", u.id).select("id");
    if (error || !data?.length) {
      report.failures.push(`Challan ${u.challan}: ${error ? saidOf(error.message, u.challan) : "no longer there"}`);
      continue;
    }
    tally.updated += 1;
    report.changes.push(...u.lines);
  }

  revalidatePath(PAGE);
  return finishReport(report, "applied", intent.fingerprint);
}
