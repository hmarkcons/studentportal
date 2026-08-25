"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function markStaffCommissionPaid(id: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const file = formData.get("file") as File | null;
  let payment_proof_path: string | undefined;

  if (file && file.size > 0) {
    const path = `${id}/proof-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { upsert: true });
    if (uploadError) return { error: uploadError.message };
    payment_proof_path = path;
  }

  const { error } = await supabase
    .from("staff_commissions")
    .update({ status: "paid", ...(payment_proof_path ? { payment_proof_path } : {}) })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath(revalidateTo);
  return { success: true };
}

export async function updatePartnerCommissionStatus(id: string, revalidateTo: string, status: string) {
  const supabase = await createClient();
  await supabase.from("partner_commissions").update({ status }).eq("id", id);
  revalidatePath(revalidateTo);
}

export async function updateRefundStatus(id: string, revalidateTo: string, status: string) {
  const supabase = await createClient();
  const patch: Record<string, unknown> = { status };
  if (status === "approved") patch.approved_at = new Date().toISOString();
  if (status === "processed") patch.processed_at = new Date().toISOString();
  await supabase.from("refund_requests").update(patch).eq("id", id);
  revalidatePath(revalidateTo);
}
