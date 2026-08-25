"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function generateInvoice(studentId: string, agreementId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const admin_charge = Number(formData.get("admin_charge") ?? 0);
  const consultancy_fee = Number(formData.get("consultancy_fee") ?? 0);
  const currency = String(formData.get("currency") ?? "EUR");
  const installmentCount = Number(formData.get("installment_count") ?? 1);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: invoice, error } = await supabase
    .from("invoices")
    .insert({ student_id: studentId, agreement_id: agreementId, admin_charge, consultancy_fee, currency, generated_by: user?.id })
    .select("id")
    .single();

  if (error) return { error: error.message };

  const total = admin_charge + consultancy_fee;
  const perInstallment = Math.round((total / installmentCount) * 100) / 100;
  const installments = Array.from({ length: installmentCount }, (_, i) => ({
    invoice_id: invoice.id,
    installment_no: i + 1,
    amount: i === installmentCount - 1 ? total - perInstallment * (installmentCount - 1) : perInstallment,
    status: "unpaid" as const,
  }));

  const { error: instError } = await supabase.from("invoice_installments").insert(installments);
  if (instError) return { error: instError.message };

  revalidatePath(`/students/${studentId}`);
  return { success: true };
}

export async function markInstallmentPaid(installmentId: string, studentId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const paid_date = String(formData.get("paid_date") ?? new Date().toISOString().slice(0, 10));

  const { error } = await supabase
    .from("invoice_installments")
    .update({ status: "paid", paid_date })
    .eq("id", installmentId);

  if (error) return { error: error.message };

  revalidatePath(`/students/${studentId}`);
  return { success: true };
}

export async function sendReceipt(invoiceId: string, studentId: string) {
  const supabase = await createClient();

  const { data: existing } = await supabase.from("receipts").select("id").eq("invoice_id", invoiceId).maybeSingle();

  if (existing) {
    await supabase.from("receipts").update({ sent_status: "sent", sent_at: new Date().toISOString() }).eq("id", existing.id);
  } else {
    await supabase.from("receipts").insert({ invoice_id: invoiceId, sent_status: "sent", sent_at: new Date().toISOString() });
  }
  await supabase.from("invoices").update({ sent_status: "sent", sent_at: new Date().toISOString() }).eq("id", invoiceId);

  revalidatePath(`/students/${studentId}`);
}
