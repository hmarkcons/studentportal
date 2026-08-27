"use server";

import { createElement } from "react";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

const CURRENCY_SYMBOLS: Record<string, string> = { PKR: "₨", USD: "$", EUR: "€" };

const DEFAULT_TERMS =
  "Only upon refusal from the university, 100% of the paid consultancy charges only will be refundable. There is no refund on withdrawal or rejection from the embassy or on failing the admission test, or under any other condition. Refunds are processed within 90 working days of the refusal notice.";

export async function generateInvoice(studentId: string, agreementId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const admin_charge = Number(formData.get("admin_charge") ?? 0);
  const consultancy_fee = Number(formData.get("consultancy_fee") ?? 0);
  const currency = String(formData.get("currency") ?? "EUR");
  const installmentCount = Number(formData.get("installment_count") ?? 1);
  const intake = String(formData.get("intake") ?? "").trim() || null;
  const terms = String(formData.get("terms") ?? "").trim() || DEFAULT_TERMS;
  const invoice_number = String(formData.get("invoice_number") ?? "").trim() || null;
  const firstDueDate = String(formData.get("first_due_date") ?? "") || null;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: invoice, error } = await supabase
    .from("invoices")
    .insert({ student_id: studentId, agreement_id: agreementId, admin_charge, consultancy_fee, currency, intake, terms, invoice_number, generated_by: user?.id })
    .select("id")
    .single();

  if (error) return { error: error.message };

  const total = admin_charge + consultancy_fee;
  const perInstallment = Math.round((total / installmentCount) * 100) / 100;
  const installments = Array.from({ length: installmentCount }, (_, i) => {
    let due_date: string | null = null;
    if (firstDueDate) {
      const d = new Date(firstDueDate);
      d.setMonth(d.getMonth() + i);
      due_date = d.toISOString().slice(0, 10);
    }
    return {
      invoice_id: invoice.id,
      installment_no: i + 1,
      amount: i === installmentCount - 1 ? total - perInstallment * (installmentCount - 1) : perInstallment,
      status: "unpaid" as const,
      due_date,
    };
  });

  const { error: instError } = await supabase.from("invoice_installments").insert(installments);
  if (instError) return { error: instError.message };

  revalidatePath(`/students/${studentId}`);
  return { success: true };
}

async function requireFinance(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
  return staffRow?.role === "finance" || staffRow?.role === "super_admin";
}

async function requireSuperAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
  return staffRow?.role === "super_admin";
}

export async function updateInvoice(invoiceId: string, studentId: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  if (!(await requireFinance(supabase))) return { error: "Only Finance/Super Admin can edit invoices." };

  const admin_charge = Number(formData.get("admin_charge") ?? 0);
  const consultancy_fee = Number(formData.get("consultancy_fee") ?? 0);
  const currency = String(formData.get("currency") ?? "EUR");
  const intake = String(formData.get("intake") ?? "").trim() || null;
  const terms = String(formData.get("terms") ?? "").trim() || DEFAULT_TERMS;
  const invoice_number = String(formData.get("invoice_number") ?? "").trim() || null;

  const { error } = await supabase
    .from("invoices")
    .update({ admin_charge, consultancy_fee, currency, intake, terms, invoice_number })
    .eq("id", invoiceId);
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function deleteInvoice(invoiceId: string, studentId: string, revalidateTo: string) {
  const supabase = await createClient();
  if (!(await requireSuperAdmin(supabase))) return { error: "Only Super Admin can delete invoices." };

  const { data: invoice } = await supabase.from("invoices").select("pdf_path").eq("id", invoiceId).maybeSingle();

  const { error: instError } = await supabase.from("invoice_installments").delete().eq("invoice_id", invoiceId);
  if (instError) return { error: instError.message };

  await supabase.from("receipts").delete().eq("invoice_id", invoiceId);

  const { error } = await supabase.from("invoices").delete().eq("id", invoiceId);
  if (error) return { error: error.message };

  if (invoice?.pdf_path) {
    await supabase.storage.from("documents").remove([invoice.pdf_path]);
  }

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function updateInstallment(installmentId: string, studentId: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  if (!(await requireFinance(supabase))) return { error: "Only Finance/Super Admin can edit installments." };

  const amount = Number(formData.get("amount") ?? 0);
  const due_date = String(formData.get("due_date") ?? "") || null;
  const status = String(formData.get("status") ?? "unpaid");
  const payment_method = String(formData.get("payment_method") ?? "").trim() || null;
  const paid_date = String(formData.get("paid_date") ?? "") || null;

  const { error } = await supabase
    .from("invoice_installments")
    .update({ amount, due_date, status, payment_method, paid_date: status === "paid" ? paid_date ?? new Date().toISOString().slice(0, 10) : paid_date })
    .eq("id", installmentId);
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function markInstallmentPaid(installmentId: string, studentId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const paid_date = String(formData.get("paid_date") ?? new Date().toISOString().slice(0, 10));
  const payment_method = String(formData.get("payment_method") ?? "").trim() || null;

  const { error } = await supabase
    .from("invoice_installments")
    .update({ status: "paid", paid_date, payment_method })
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

// Shared by the interactive (staff-triggered) generateInvoicePdf below and
// the cron-triggered overdue-reminder path, which has no staff session and
// must pass in an admin (service-role) client instead.
export async function buildAndStoreInvoicePdf(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invoiceId: string,
  studentId: string
) {
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select(
      `id, invoice_number, intake, terms, admin_charge, consultancy_fee, currency, created_at,
       agreement:agreements(generated_by, template:agreement_templates(signatory_name, destination:destinations(display_name)))`
    )
    .eq("id", invoiceId)
    .single();

  if (invoiceError || !invoice) return { error: invoiceError?.message ?? "Invoice not found." };

  const { data: student } = await supabase.from("leads").select("full_name, contact_number, email").eq("id", studentId).maybeSingle();

  const { data: installments } = await supabase
    .from("invoice_installments")
    .select("installment_no, amount, status, due_date, paid_date, payment_method")
    .eq("invoice_id", invoiceId)
    .order("installment_no", { ascending: true });

  const agreement = one(invoice.agreement as never) as { generated_by?: string | null; template?: unknown } | null;
  const template = agreement?.template ? (one(agreement.template as never) as { signatory_name?: string | null; destination?: unknown } | null) : null;
  const destination = template?.destination ? (one(template.destination as never) as { display_name?: string | null } | null) : null;

  let counselorName: string | null = null;
  if (agreement?.generated_by) {
    const { data: staffRow } = await supabase.from("staff").select("full_name").eq("id", agreement.generated_by).maybeSingle();
    counselorName = staffRow?.full_name ?? null;
  }

  const subtotal = invoice.admin_charge + invoice.consultancy_fee;
  const amountPaid = (installments ?? []).filter((i) => i.status === "paid").reduce((sum, i) => sum + i.amount, 0);
  const balanceDue = Math.round((subtotal - amountPaid) * 100) / 100;
  const status: "paid" | "partially_paid" | "unpaid" = balanceDue <= 0 ? "paid" : amountPaid > 0 ? "partially_paid" : "unpaid";

  const invoiceNumber = invoice.invoice_number ?? `INV-${new Date(invoice.created_at).getFullYear()}-${invoiceId.slice(0, 6).toUpperCase()}`;
  const currencySymbol = CURRENCY_SYMBOLS[invoice.currency] ?? invoice.currency;

  const payments = (installments ?? []).map((i) => ({
    date:
      i.status === "paid" && i.paid_date
        ? new Date(i.paid_date).toLocaleDateString()
        : i.due_date
          ? new Date(i.due_date).toLocaleDateString()
          : "—",
    method: i.payment_method,
    amount: i.amount,
    status: (i.status === "paid" ? "paid" : "unpaid") as "paid" | "unpaid",
  }));

  const nextDue = (installments ?? []).find((i) => i.status !== "paid")?.due_date ?? null;

  const destinationLabel = destination?.display_name
    ? `${destination.display_name}${invoice.intake ? ` — Intake: ${invoice.intake}` : ""}`
    : "Consultancy fee";

  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { InvoiceDocument } = await import("@/lib/pdf/InvoiceDocument");

  // InvoiceDocument's root element is a <Document>, but react-pdf's
  // renderToBuffer type can't see through the wrapper component to verify
  // that structurally — safe to assert since we control the component.
  const element = createElement(InvoiceDocument, {
    data: {
      invoiceNumber,
      status,
      issuedDate: new Date(invoice.created_at).toLocaleDateString(),
      dueDate: nextDue ? new Date(nextDue).toLocaleDateString() : null,
      currencySymbol,
      studentName: student?.full_name ?? "—",
      studentPhone: student?.contact_number ?? null,
      studentEmail: student?.email ?? null,
      destination: destination?.display_name ?? null,
      intake: invoice.intake,
      counselor: counselorName,
      adminCharge: invoice.admin_charge,
      consultancyFee: invoice.consultancy_fee,
      destinationLabel,
      terms: invoice.terms,
      payments,
      subtotal,
      amountPaid,
      balanceDue,
      signatoryName: template?.signatory_name ?? null,
    },
  });

  const buffer = await renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);

  const path = `${studentId}/invoices/${invoiceId}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(path, buffer, { contentType: "application/pdf", upsert: true });
  if (uploadError) return { error: uploadError.message };

  const { error: updateError } = await supabase
    .from("invoices")
    .update({ pdf_path: path, invoice_number: invoiceNumber })
    .eq("id", invoiceId);
  if (updateError) return { error: updateError.message };

  return { success: true, pdfPath: path, invoiceNumber };
}

export async function generateInvoicePdf(invoiceId: string, studentId: string, revalidateTo: string) {
  const supabase = await createClient();
  const result = await buildAndStoreInvoicePdf(supabase, invoiceId, studentId);
  if ("error" in result) return { error: result.error };

  revalidatePath(revalidateTo);
  return { success: true };
}
