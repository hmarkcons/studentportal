"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function requireSuperAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
  return staffRow?.role === "super_admin";
}

export async function createStaffCommission(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  if (!(await requireSuperAdmin(supabase))) return { error: "Only Super Admin can add commission records." };

  const staff_id = String(formData.get("staff_id") ?? "");
  const student_id = String(formData.get("student_id") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  const currency = String(formData.get("currency") ?? "EUR");

  if (!staff_id || !student_id || !amount) return { error: "Staff, student, and amount are required." };

  const { error } = await supabase.from("staff_commissions").insert({ staff_id, student_id, amount, currency });
  if (error) return { error: error.message };

  revalidatePath("/finance/commissions");
  return { success: true };
}

export async function deleteStaffCommission(id: string) {
  const supabase = await createClient();
  if (!(await requireSuperAdmin(supabase))) return { error: "Only Super Admin can delete commission records." };

  const { error } = await supabase.from("staff_commissions").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/finance/commissions");
  return { success: true };
}

export async function createRefundRequest(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  if (!(await requireSuperAdmin(supabase))) return { error: "Only Super Admin can add refund records." };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const student_id = String(formData.get("student_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const amount = formData.get("amount") ? Number(formData.get("amount")) : null;

  if (!student_id || !reason) return { error: "Student and reason are required." };

  const { error } = await supabase.from("refund_requests").insert({ student_id, reason, amount, requested_by: user?.id });
  if (error) return { error: error.message };

  revalidatePath("/finance/refunds");
  return { success: true };
}

export async function deleteRefundRequest(id: string) {
  const supabase = await createClient();
  if (!(await requireSuperAdmin(supabase))) return { error: "Only Super Admin can delete refund records." };

  const { error } = await supabase.from("refund_requests").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/finance/refunds");
  return { success: true };
}

export async function deletePartnerCommission(id: string, revalidateTo: string) {
  const supabase = await createClient();
  if (!(await requireSuperAdmin(supabase))) return { error: "Only Super Admin can delete partner commission records." };

  const { error } = await supabase.from("partner_commissions").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

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
