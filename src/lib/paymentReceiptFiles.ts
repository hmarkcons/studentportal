import { removeStorageFiles } from "@/lib/fileTrash";
import { createAdminClient } from "@/lib/supabase/admin";
import { readAllIn } from "@/lib/catalogueReads";
import { RECEIPT_COLUMN, type ReceiptKind } from "@/lib/paymentReceipts";

// The files behind payment receipts (0308), for whatever deletes a payment.
//
// Deleting an instalment, a commission, a refund or a referral cascades its
// payment_receipts rows away, but not the files: those sit under
// payment-receipts/<kind>/<payment id>/, which no student's folder includes,
// so removeStoragePrefix on a deleted student never reaches them. Each
// deletion reads its receipts' paths first, then removes the files once the
// rows are gone — after, never before, so a delete that fails leaves the
// proof in place.
//
// Through the admin client: whoever may delete a student need not be someone
// who may see a refund's receipts, and the files have to go regardless.

type Admin = ReturnType<typeof createAdminClient>;

async function pathsFor(admin: Admin, kind: ReceiptKind, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await readAllIn(ids, (chunk, from, to) =>
    admin.from("payment_receipts").select("id, path").in(RECEIPT_COLUMN[kind], chunk).order("id").range(from, to).returns<{ id: string; path: string }[]>()
  );
  return rows.map((r) => r.path);
}

/** The receipt files on these payments. */
export async function receiptFilesFor(kind: ReceiptKind, ids: string[]): Promise<string[]> {
  return pathsFor(createAdminClient(), kind, ids);
}

/** The receipt files on an invoice's instalments. */
export async function receiptFilesForInvoice(invoiceId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("invoice_installments").select("id").eq("invoice_id", invoiceId);
  return pathsFor(admin, "installment", (data ?? []).map((r) => r.id as string));
}

/** Every receipt file on a student's payments: instalments, refunds, commissions and referrals. */
export async function receiptFilesForStudent(studentId: string): Promise<string[]> {
  const admin = createAdminClient();
  const [{ data: invoices }, { data: refunds }, { data: commissions }, { data: referrals }] = await Promise.all([
    admin.from("invoices").select("id").eq("student_id", studentId),
    admin.from("refund_requests").select("id").eq("student_id", studentId),
    admin.from("staff_commissions").select("id").eq("student_id", studentId),
    admin.from("referrals").select("id").eq("lead_id", studentId),
  ]);
  const invoiceIds = (invoices ?? []).map((r) => r.id as string);
  const installments =
    invoiceIds.length > 0 ? ((await admin.from("invoice_installments").select("id").in("invoice_id", invoiceIds)).data ?? []) : [];
  const ids = (rows: { id: unknown }[] | null) => (rows ?? []).map((r) => r.id as string);
  const lists = await Promise.all([
    pathsFor(admin, "installment", ids(installments)),
    pathsFor(admin, "refund", ids(refunds)),
    pathsFor(admin, "staff_commission", ids(commissions)),
    pathsFor(admin, "referral", ids(referrals)),
  ]);
  return lists.flat();
}

/** Removes the files, a hundred at a time. Best effort: a file left behind is clutter, not a fault. */
export async function removeReceiptFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const admin = createAdminClient();
  for (let i = 0; i < paths.length; i += 100) {
    await removeStorageFiles(admin, "documents", paths.slice(i, i + 100));
  }
}
