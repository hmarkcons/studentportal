"use server";

import { revalidatePath } from "next/cache";
import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { uploadedFile } from "@/lib/stagedUpload";
import { validateDocumentFile } from "@/lib/documentUpload";
import { documentUrls } from "@/lib/storageUrls";
import {
  RECEIPTS_PER_PAYMENT,
  RECEIPT_COLUMN,
  RECEIPT_PERMISSION,
  RECEIPT_TABLE,
  RECEIPT_WHO,
  isReceiptKind,
  receiptPath,
  type ReceiptKind,
} from "@/lib/paymentReceipts";

export type PaymentReceipt = {
  id: string;
  fileName: string;
  sizeBytes: number | null;
  uploadedAt: string;
  uploadedBy: string | null;
  /** Signed for an hour; null if it could not be signed. */
  url: string | null;
};

type Row = {
  id: string;
  path: string;
  file_name: string;
  size_bytes: number | null;
  uploaded_at: string;
  uploader: { full_name: string } | { full_name: string }[] | null;
};

const SELECT = "id, path, file_name, size_bytes, uploaded_at, uploader:staff!payment_receipts_uploaded_by_fkey(full_name)";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

/**
 * Who is asking, and whether they may handle this kind of payment's receipts.
 * The database asks the same question again (can_manage_payment_receipts,
 * 0308) of every row and every file; this is so a refusal says why.
 */
async function authorise(kind: unknown) {
  if (!isReceiptKind(kind)) return { ok: false, error: "That is not a kind of payment receipts are kept for." } as const;
  const { supabase, staff } = await getStaffSession();
  if (!staff) return { ok: false, error: "You are signed out — reload the page." } as const;
  if (!(await hasPermission(RECEIPT_PERMISSION[kind]))) {
    return { ok: false, error: `Only ${RECEIPT_WHO[kind]} can handle these receipts.` } as const;
  }
  return { ok: true, supabase, staff, kind } as const;
}

async function withUrls(supabase: Awaited<ReturnType<typeof getStaffSession>>["supabase"], rows: Row[]): Promise<PaymentReceipt[]> {
  const urls = await documentUrls(supabase, rows.map((r) => r.path));
  return rows.map((r) => ({
    id: r.id,
    fileName: r.file_name,
    sizeBytes: r.size_bytes,
    uploadedAt: r.uploaded_at,
    uploadedBy: one(r.uploader)?.full_name ?? null,
    url: urls.get(r.path) ?? null,
  }));
}

/** Every receipt on one payment, oldest first, each with a link to open it. */
export async function listPaymentReceipts(kind: ReceiptKind, paymentId: string): Promise<{ receipts: PaymentReceipt[] } | { error: string }> {
  const auth = await authorise(kind);
  if (!auth.ok) return { error: auth.error };
  const { data, error } = await auth.supabase
    .from("payment_receipts")
    .select(SELECT)
    .eq(RECEIPT_COLUMN[auth.kind], paymentId)
    .order("uploaded_at")
    .returns<Row[]>();
  if (error) return { error: error.message };
  return { receipts: await withUrls(auth.supabase, data ?? []) };
}

/**
 * Adds one receipt to a payment. Several may be added, one at a time; none
 * changes the payment's status.
 */
export async function uploadPaymentReceipt(
  kind: ReceiptKind,
  paymentId: string,
  revalidateTo: string,
  formData: FormData
): Promise<{ success: true; receipt: PaymentReceipt } | { error: string }> {
  const auth = await authorise(kind);
  if (!auth.ok) return { error: auth.error };
  const { supabase, staff } = auth;

  const file = await uploadedFile(formData, "file");
  if (!file || file.size === 0) return { error: "Choose a file to upload." };
  const invalid = validateDocumentFile(file, "receipt");
  if (invalid) return { error: invalid };

  // The payment, read as the uploader: one they cannot see is not one they
  // can attach proof to.
  const [{ data: payment }, { count }] = await Promise.all([
    supabase.from(RECEIPT_TABLE[kind]).select("id").eq("id", paymentId).maybeSingle(),
    supabase.from("payment_receipts").select("id", { count: "exact", head: true }).eq(RECEIPT_COLUMN[kind], paymentId),
  ]);
  if (!payment) return { error: "That payment is not on file any more — reload the page." };
  if ((count ?? 0) >= RECEIPTS_PER_PAYMENT) {
    return { error: `This payment already has ${RECEIPTS_PER_PAYMENT} receipts. Remove one that is not needed first.` };
  }

  const path = receiptPath(kind, paymentId, file.name, crypto.randomUUID().slice(0, 8));
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (uploadError) return { error: `The file was not saved: ${uploadError.message}` };

  const { data: row, error } = await supabase
    .from("payment_receipts")
    .insert({
      kind,
      [RECEIPT_COLUMN[kind]]: paymentId,
      path,
      file_name: file.name.slice(0, 255) || "receipt",
      size_bytes: file.size,
      content_type: file.type || null,
      uploaded_by: staff.id,
    })
    .select(SELECT)
    .single<Row>();
  if (error || !row) {
    // Not left behind as a file nothing points at.
    await supabase.storage.from("documents").remove([path]);
    return { error: `The receipt was not saved: ${error?.message ?? "no row came back"}` };
  }

  revalidatePath(revalidateTo);
  const [receipt] = await withUrls(supabase, [row]);
  return { success: true, receipt };
}

/** Removes a receipt that was attached by mistake: its record, then its file. */
export async function removePaymentReceipt(
  kind: ReceiptKind,
  receiptId: string,
  revalidateTo: string
): Promise<{ success: true } | { error: string }> {
  const auth = await authorise(kind);
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  // An RLS-refused delete matches nothing and raises nothing, so what was
  // deleted is read back rather than assumed.
  const { data, error } = await supabase.from("payment_receipts").delete().eq("id", receiptId).eq("kind", kind).select("path");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "That receipt is not on file any more — reload the page." };
  await supabase.storage.from("documents").remove(data.map((r) => r.path as string));

  revalidatePath(revalidateTo);
  return { success: true };
}
