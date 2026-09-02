"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/permissions";

const REFUND_PERCENT: Record<string, number> = {
  no_admission: 100,
  visa_refusal: 50,
};

// Any registered student whose visa was refused for a private-university-
// track destination is entitled to a 50% consultancy refund, due within 90
// days of the refusal notice -- surface these automatically instead of
// requiring a manual entry. Idempotent: only inserts rows that don't already
// exist for a given application. Runs on every load of the Refunds page (not
// a background job) — returned errors surface as a banner there so a
// persistent failure (as opposed to a transient one, which self-heals on the
// next page load) doesn't silently drop a student's refund entitlement.
export async function syncVisaRefusalRefunds(): Promise<{ errors: string[] }> {
  const admin = createAdminClient();
  const errors: string[] = [];

  const { data: refusals } = await admin
    .from("visa_records")
    .select(
      "application_id, updated_at, application:applications(student_id, university:universities(destination:destinations(track)))"
    )
    .eq("outcome", "rejected");

  if (!refusals || refusals.length === 0) return { errors };

  function one<T>(v: T | T[] | null) {
    return Array.isArray(v) ? (v[0] ?? null) : v;
  }

  const privateApplicationIds = refusals
    .filter((r) => {
      const app = one(r.application as never) as { university?: unknown } | null;
      const uni = app ? (one(app.university as never) as { destination?: unknown } | null) : null;
      const dest = uni ? (one(uni.destination as never) as { track?: string } | null) : null;
      return dest?.track === "private";
    })
    .map((r) => ({ applicationId: r.application_id, refusalDate: r.updated_at }));

  if (privateApplicationIds.length === 0) return { errors };

  const { data: existing } = await admin
    .from("refund_requests")
    .select("application_id")
    .eq("trigger_type", "visa_refusal")
    .in(
      "application_id",
      privateApplicationIds.map((p) => p.applicationId)
    );
  const existingIds = new Set((existing ?? []).map((e) => e.application_id));

  const toCreate = privateApplicationIds.filter((p) => !existingIds.has(p.applicationId));
  if (toCreate.length === 0) return { errors };

  for (const { applicationId, refusalDate } of toCreate) {
    const { data: app } = await admin.from("applications").select("student_id").eq("id", applicationId).maybeSingle();
    if (!app) continue;

    const { data: invoice } = await admin
      .from("invoices")
      .select("consultancy_fee, currency")
      .eq("student_id", app.student_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const amount = invoice?.consultancy_fee != null ? Math.round(invoice.consultancy_fee * 0.5 * 100) / 100 : null;

    const { error: insertError } = await admin.from("refund_requests").insert({
      student_id: app.student_id,
      application_id: applicationId,
      trigger_type: "visa_refusal",
      refund_percent: 50,
      refusal_notice_date: String(refusalDate).slice(0, 10),
      reason: "Visa refusal — private-university destination (auto-detected, 50% consultancy refund)",
      amount,
      currency: invoice?.currency ?? null,
    });
    if (insertError) errors.push(`Application ${applicationId}: ${insertError.message}`);
  }

  return { errors };
}

export async function createStaffCommission(revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const denied = await requirePermission("finance.commissions.manage", "Only Finance/Super Admin can add commission records."); if (denied) return { error: denied.error };

  const staff_id = String(formData.get("staff_id") ?? "");
  const student_id = String(formData.get("student_id") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  const currency = String(formData.get("currency") ?? "EUR");
  const registration_date = String(formData.get("registration_date") ?? "") || null;
  const apply_credit_id = String(formData.get("apply_credit_id") ?? "") || null;

  if (!staff_id || !student_id || !amount) return { error: "Staff, student, and amount are required." };

  // Single security-definer RPC — the credit-consume and the commission
  // insert commit or fail together and the credit row is locked for the
  // duration (see migration 0090), closing a race where two concurrent
  // requests could both read the same credit as "available" and double-
  // apply its discount before either write landed.
  const { error } = await supabase.rpc("create_staff_commission", {
    p_staff_id: staff_id,
    p_student_id: student_id,
    p_amount: amount,
    p_currency: currency,
    p_registration_date: registration_date,
    p_apply_credit_id: apply_credit_id,
  });
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

// Marks a paid commission as a credit owed back by that staff member —
// used when the student it was paid for turns out to have no admission, or
// withdraws/goes ghost. The credit sits available until Finance applies it
// against a new commission for a different student under the same staff
// member (see createStaffCommission's apply_credit_id handling).
export async function carryForwardCommissionCredit(commissionId: string, revalidateTo: string) {
  const supabase = await createClient();
  const denied = await requirePermission("finance.commissions.manage", "Only Finance/Super Admin can adjust commissions."); if (denied) return { error: denied.error };

  const { data: commission } = await supabase
    .from("staff_commissions")
    .select("id, staff_id, amount, currency, status")
    .eq("id", commissionId)
    .maybeSingle();
  if (!commission) return { error: "Commission not found." };
  if (commission.status !== "paid") return { error: "Only a paid commission can be carried forward as a credit." };

  const { error } = await supabase.from("staff_commission_credits").insert({
    staff_id: commission.staff_id,
    source_commission_id: commission.id,
    amount: commission.amount,
    currency: commission.currency,
  });
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function deleteStaffCommission(id: string, revalidateTo: string) {
  const supabase = await createClient();
  const denied = await requirePermission("finance.commissions.manage", "Only Finance/Super Admin can delete commission records."); if (denied) return { error: denied.error };

  const { error } = await supabase.from("staff_commissions").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function createRefundRequest(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const denied = await requirePermission("finance.refunds.manage", "Only Super Admin can add refund records."); if (denied) return { error: denied.error };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const student_id = String(formData.get("student_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const trigger_type = String(formData.get("trigger_type") ?? "manual");
  const refusal_notice_date = String(formData.get("refusal_notice_date") ?? "").trim() || null;
  let amount = formData.get("amount") ? Number(formData.get("amount")) : null;

  if (!student_id || !reason) return { error: "Student and reason are required." };

  const refund_percent = REFUND_PERCENT[trigger_type] ?? null;
  let currency: string | null = null;

  if (refund_percent != null) {
    const { data: invoice } = await supabase
      .from("invoices")
      .select("consultancy_fee, currency")
      .eq("student_id", student_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    currency = invoice?.currency ?? null;
    if (amount == null && invoice?.consultancy_fee != null) {
      amount = Math.round(invoice.consultancy_fee * (refund_percent / 100) * 100) / 100;
    }
  }

  const { error } = await supabase.from("refund_requests").insert({
    student_id,
    reason,
    amount,
    currency,
    trigger_type,
    refund_percent,
    refusal_notice_date,
    requested_by: user?.id,
  });
  if (error) return { error: error.message };

  revalidatePath("/finance/refunds");
  return { success: true };
}

export async function deleteRefundRequest(id: string) {
  const supabase = await createClient();
  const denied = await requirePermission("finance.refunds.manage", "Only Super Admin can delete refund records."); if (denied) return { error: denied.error };

  const { error } = await supabase.from("refund_requests").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/finance/refunds");
  return { success: true };
}

export async function createPartnerCommission(revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const denied = await requirePermission("finance.commissions.manage", "Only Finance/Super Admin can add commission records."); if (denied) return { error: denied.error };

  const student_id = String(formData.get("student_id") ?? "");
  const application_id = String(formData.get("application_id") ?? "") || null;
  const expected_amount = formData.get("expected_amount") ? Number(formData.get("expected_amount")) : null;
  const currency = String(formData.get("currency") ?? "").trim() || "EUR";
  const rate_percent = formData.get("rate_percent") ? Number(formData.get("rate_percent")) : null;
  const fixed_amount = formData.get("fixed_amount") ? Number(formData.get("fixed_amount")) : null;
  const channel = String(formData.get("channel") ?? "") || null;

  if (!student_id) return { error: "Choose a student." };
  // documents_storage_commission_proof's storage policy inner-joins
  // applications via this column — a null application_id would make the
  // resulting row's payment-proof upload permanently unreachable by
  // anyone, including Finance/Super Admin.
  if (!application_id) return { error: "Choose the application this commission is tied to." };

  const { data: lead } = await supabase.from("leads").select("assigned_counselor_id").eq("id", student_id).maybeSingle();

  const { error } = await supabase.from("partner_commissions").insert({
    student_id,
    application_id,
    expected_amount,
    currency,
    rate_percent,
    fixed_amount,
    channel,
    assigned_counselor_id: lead?.assigned_counselor_id ?? null,
  });
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function deletePartnerCommission(id: string, revalidateTo: string) {
  const supabase = await createClient();
  const denied = await requirePermission("finance.partner_commissions.delete", "Only Super Admin can delete partner commission records."); if (denied) return { error: denied.error };

  const { error } = await supabase.from("partner_commissions").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function markStaffCommissionPaid(id: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const denied = await requirePermission("finance.commissions.manage", "Only Finance/Super Admin can mark commissions paid."); if (denied) return { error: denied.error };

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
  const denied = await requirePermission("finance.commissions.manage", "Only Finance/Super Admin can change commission status."); if (denied) return { error: denied.error };

  const { error } = await supabase.from("partner_commissions").update({ status }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function upsertStaffPayroll(staffId: string, payrollMonth: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const denied = await requirePermission("finance.commissions.manage", "Only Finance/Super Admin can update payroll."); if (denied) return { error: denied.error };

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
  const denied = await requirePermission("finance.commissions.manage", "Only Finance/Super Admin can edit commission records."); if (denied) return { error: denied.error };

  const amount = Number(formData.get("amount") ?? 0);
  const currency = String(formData.get("currency") ?? "").trim();
  const registration_date = String(formData.get("registration_date") ?? "") || null;
  const status = String(formData.get("status") ?? "");
  const payment_method = String(formData.get("payment_method") ?? "").trim() || null;

  if (!amount || !currency) return { error: "Amount and currency are required." };
  if (!["unpaid", "paid"].includes(status)) return { error: "Choose a valid status." };

  const { error } = await supabase
    .from("staff_commissions")
    .update({ amount, currency, registration_date, status, payment_method })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function uploadStaffCommissionProof(id: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const denied = await requirePermission("finance.commissions.manage", "Only Finance/Super Admin can upload proof."); if (denied) return { error: denied.error };

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
  const denied = await requirePermission("finance.commissions.manage", "Only Finance/Super Admin can edit partner commission records."); if (denied) return { error: denied.error };

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
  const denied = await requirePermission("finance.commissions.manage", "Only Finance/Super Admin can upload proof."); if (denied) return { error: denied.error };

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
  const denied = await requirePermission("finance.refunds.review", "Only Finance/Management/Super Admin can update refund status."); if (denied) return { error: denied.error };

  const { data: refund } = await supabase.from("refund_requests").select("eligibility_status").eq("id", id).maybeSingle();
  if (refund?.eligibility_status === "ineligible_reapplying" && (status === "approved" || status === "processed")) {
    return { error: "This student is marked ineligible for a refund (reapplying for a later intake)." };
  }

  const patch: Record<string, unknown> = { status };
  if (status === "approved") patch.approved_at = new Date().toISOString();
  if (status === "processed") patch.processed_at = new Date().toISOString();
  const { error } = await supabase.from("refund_requests").update(patch).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(revalidateTo);
  return { success: true };
}

export async function updateRefundEligibility(revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const denied = await requirePermission("finance.refunds.review", "Only Finance/Management/Super Admin can update refund eligibility."); if (denied) return { error: denied.error };

  const id = String(formData.get("id") ?? "");
  const eligibility_status = String(formData.get("eligibility_status") ?? "eligible");
  const next_intake_note = String(formData.get("next_intake_note") ?? "").trim() || null;
  const next_intake_country_id = String(formData.get("next_intake_country_id") ?? "").trim() || null;

  if (!id) return { error: "Missing refund record." };
  if (eligibility_status === "ineligible_reapplying" && !next_intake_country_id) {
    return { error: "Select the destination country for the next intake." };
  }

  const { error } = await supabase
    .from("refund_requests")
    .update({ eligibility_status, next_intake_note, next_intake_country_id })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}
