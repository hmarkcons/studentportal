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

async function requireFinance(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
  return staffRow?.role === "finance" || staffRow?.role === "super_admin";
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

export async function upsertStaffPayroll(staffId: string, payrollMonth: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  if (!(await requireFinance(supabase))) return { error: "Only Finance/Super Admin can update payroll." };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const basic_salary = Number(formData.get("basic_salary") ?? 0);
  const allowances = Number(formData.get("allowances") ?? 0);
  const total_commission = Number(formData.get("total_commission") ?? 0);
  const overtime = Number(formData.get("overtime") ?? 0);
  const deduction_absent = Number(formData.get("deduction_absent") ?? 0);
  const deduction_late = Number(formData.get("deduction_late") ?? 0);
  const deduction_other = Number(formData.get("deduction_other") ?? 0);
  const tax = Number(formData.get("tax") ?? 0);
  const payment_status = String(formData.get("payment_status") ?? "pending");

  const { error } = await supabase.from("staff_payroll").upsert(
    {
      staff_id: staffId,
      payroll_month: payrollMonth,
      basic_salary,
      allowances,
      total_commission,
      overtime,
      deduction_absent,
      deduction_late,
      deduction_other,
      tax,
      payment_status,
      updated_by: user?.id,
    },
    { onConflict: "staff_id,payroll_month" }
  );
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function updateStaffCommission(id: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  if (!(await requireFinance(supabase))) return { error: "Only Finance/Super Admin can edit commission records." };

  const amount = Number(formData.get("amount") ?? 0);
  const currency = String(formData.get("currency") ?? "").trim();
  const registration_date = String(formData.get("registration_date") ?? "") || null;
  const status = String(formData.get("status") ?? "");

  if (!amount || !currency) return { error: "Amount and currency are required." };
  if (!["unpaid", "paid"].includes(status)) return { error: "Choose a valid status." };

  const { error } = await supabase
    .from("staff_commissions")
    .update({ amount, currency, registration_date, status })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function uploadStaffCommissionProof(id: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  if (!(await requireFinance(supabase))) return { error: "Only Finance/Super Admin can upload proof." };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Choose a file to upload." };

  const path = `${id}/proof-${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { upsert: true });
  if (uploadError) return { error: uploadError.message };

  const { error } = await supabase.from("staff_commissions").update({ payment_proof_path: path }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function updatePartnerCommission(id: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  if (!(await requireFinance(supabase))) return { error: "Only Finance/Super Admin can edit partner commission records." };

  const paid_fee = formData.get("paid_fee") ? Number(formData.get("paid_fee")) : null;
  const fee_payment_date = String(formData.get("fee_payment_date") ?? "") || null;
  const rate_percent = formData.get("rate_percent") ? Number(formData.get("rate_percent")) : null;
  const fixed_amount = formData.get("fixed_amount") ? Number(formData.get("fixed_amount")) : null;
  const currency = String(formData.get("currency") ?? "").trim() || "EUR";
  const expected_amount = formData.get("expected_amount") ? Number(formData.get("expected_amount")) : null;
  const channel = String(formData.get("channel") ?? "") || null;
  const wallet_platform = String(formData.get("wallet_platform") ?? "").trim() || null;
  const received_date = String(formData.get("received_date") ?? "") || null;
  const hmark_bank_account = String(formData.get("hmark_bank_account") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "");

  const validStatuses = ["not_yet_due", "pending", "received", "partially_received", "overdue", "disputed"];
  if (!validStatuses.includes(status)) return { error: "Choose a valid status." };

  const { error } = await supabase
    .from("partner_commissions")
    .update({
      paid_fee,
      fee_payment_date,
      rate_percent,
      fixed_amount,
      currency,
      expected_amount,
      channel,
      wallet_platform,
      received_date,
      hmark_bank_account,
      status,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function uploadPartnerCommissionProof(id: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  if (!(await requireFinance(supabase))) return { error: "Only Finance/Super Admin can upload proof." };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Choose a file to upload." };

  const path = `${id}/proof-${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { upsert: true });
  if (uploadError) return { error: uploadError.message };

  const { error } = await supabase.from("partner_commissions").update({ payment_proof_path: path }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function updateRefundStatus(id: string, revalidateTo: string, status: string) {
  const supabase = await createClient();
  const patch: Record<string, unknown> = { status };
  if (status === "approved") patch.approved_at = new Date().toISOString();
  if (status === "processed") patch.processed_at = new Date().toISOString();
  await supabase.from("refund_requests").update(patch).eq("id", id);
  revalidatePath(revalidateTo);
}
