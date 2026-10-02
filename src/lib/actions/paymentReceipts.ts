"use server";

import { revalidatePath } from "next/cache";
import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { hasRole } from "@/lib/auth/roles";
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
  /** False once another receipt has replaced it (0309): it is then an earlier version. */
  isCurrent: boolean;
  /** The receipt this one replaced, if it replaced one. */
  replaces: string | null;
};

type Row = {
  id: string;
  path: string;
  file_name: string;
  size_bytes: number | null;
  uploaded_at: string;
  is_current: boolean;
  replaces: string | null;
  uploader: { full_name: string } | { full_name: string }[] | null;
};

const SELECT =
  "id, path, file_name, size_bytes, uploaded_at, is_current, replaces, uploader:staff!payment_receipts_uploaded_by_fkey(full_name)";

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
    isCurrent: r.is_current,
    replaces: r.replaces,
  }));
}

/**
 * Every receipt on one payment, current and earlier, oldest first, each with
 * a link to open it — and whether the viewer may delete them (0309: a Super
 * Admin only).
 */
export async function listPaymentReceipts(
  kind: ReceiptKind,
  paymentId: string
): Promise<{ receipts: PaymentReceipt[]; canDelete: boolean } | { error: string }> {
  const auth = await authorise(kind);
  if (!auth.ok) return { error: auth.error };
  const { data, error } = await auth.supabase
    .from("payment_receipts")
    .select(SELECT)
    .eq(RECEIPT_COLUMN[auth.kind], paymentId)
    .order("uploaded_at")
    .returns<Row[]>();
  if (error) return { error: error.message };
  return { receipts: await withUrls(auth.supabase, data ?? []), canDelete: hasRole(auth.staff, "super_admin") };
}

/**
 * Adds a receipt to a payment — or, given `replacesId`, uploads one in place
 * of that receipt, which then stays on file as an earlier version (0309).
 * None of it changes the payment's status.
 */
export async function uploadPaymentReceipt(
  kind: ReceiptKind,
  paymentId: string,
  revalidateTo: string,
  formData: FormData,
  replacesId: string | null = null
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
    return { error: `This payment already has ${RECEIPTS_PER_PAYMENT} receipts, earlier versions included. Ask a Super Admin to delete one that is not needed.` };
  }

  const path = receiptPath(kind, paymentId, file.name, crypto.randomUUID().slice(0, 8));
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (uploadError) return { error: `The file was not saved: ${uploadError.message}` };

  // The database checks the receipt being replaced is this payment's and is
  // still current (payment_receipts_before_insert), and words its refusal.
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
      replaces: replacesId,
    })
    .select(SELECT)
    .single<Row>();
  if (error || !row) {
    // Not left behind as a file nothing points at. The uploader cannot delete
    // files (a Super Admin only, 0309), so this is done past RLS.
    const { createAdminClient } = await import("@/lib/supabase/admin");
    await createAdminClient().storage.from("documents").remove([path]);
    const raced = error?.code === "23505";
    return {
      error: raced
        ? "That receipt has just been replaced by someone else — reload to see the new one."
        : `The receipt was not saved: ${error?.message ?? "no row came back"}`,
    };
  }

  revalidatePath(revalidateTo);
  const [receipt] = await withUrls(supabase, [row]);
  return { success: true, receipt };
}

/**
 * Deletes a receipt — current or earlier — and its file. A Super Admin's
 * alone (0309), at any time. Deleting a replacement makes the receipt it
 * replaced current again.
 */
export async function removePaymentReceipt(
  kind: ReceiptKind,
  receiptId: string,
  revalidateTo: string
): Promise<{ success: true } | { error: string }> {
  const auth = await authorise(kind);
  if (!auth.ok) return { error: auth.error };
  const { supabase, staff } = auth;
  if (!hasRole(staff, "super_admin")) return { error: "Only a Super Admin can delete a receipt. Upload a replacement instead — the old one is kept as an earlier version." };

  // An RLS-refused delete matches nothing and raises nothing, so what was
  // deleted is read back rather than assumed.
  const { data, error } = await supabase.from("payment_receipts").delete().eq("id", receiptId).eq("kind", kind).select("path");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "That receipt is not on file any more — reload the page." };
  await supabase.storage.from("documents").remove(data.map((r) => r.path as string));

  revalidatePath(revalidateTo);
  return { success: true };
}
