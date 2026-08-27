"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { generateInvoicePdf, buildAndStoreInvoicePdf } from "@/lib/actions/invoices";

async function requireProcessingOrAbove(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
  return ["super_admin", "finance", "processing"].includes(staffRow?.role ?? "");
}

// ---- Fee / product catalog -------------------------------------------------

export async function createFeeProduct(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  if (!(await requireProcessingOrAbove(supabase))) return { error: "You don't have permission to manage the fee catalog." };

  const name = String(formData.get("name") ?? "").trim();
  const default_amount = formData.get("default_amount") ? Number(formData.get("default_amount")) : null;
  const default_currency = String(formData.get("default_currency") ?? "EUR");
  if (!name) return { error: "Name is required." };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("fee_products").insert({ name, default_amount, default_currency, created_by: user?.id });
  if (error) return { error: error.message };

  revalidatePath("/finance/consultancy-fee");
  revalidateTag("fee-products", { expire: 0 });
  return { success: true };
}

export async function updateFeeProduct(productId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  if (!(await requireProcessingOrAbove(supabase))) return { error: "You don't have permission to manage the fee catalog." };

  const name = String(formData.get("name") ?? "").trim();
  const default_amount = formData.get("default_amount") ? Number(formData.get("default_amount")) : null;
  const default_currency = String(formData.get("default_currency") ?? "EUR");
  if (!name) return { error: "Name is required." };

  const { error } = await supabase.from("fee_products").update({ name, default_amount, default_currency }).eq("id", productId);
  if (error) return { error: error.message };

  revalidatePath("/finance/consultancy-fee");
  revalidateTag("fee-products", { expire: 0 });
  return { success: true };
}

export async function deleteFeeProduct(productId: string) {
  const supabase = await createClient();
  if (!(await requireProcessingOrAbove(supabase))) return { error: "You don't have permission to manage the fee catalog." };

  const { error } = await supabase.from("fee_products").delete().eq("id", productId);
  if (error) return { error: error.message };

  revalidatePath("/finance/consultancy-fee");
  revalidateTag("fee-products", { expire: 0 });
  return { success: true };
}

// ---- Invoice line items (extra products beyond admin + consultancy fee) ---

export async function addLineItem(invoiceId: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  if (!(await requireProcessingOrAbove(supabase))) return { error: "You don't have permission to edit invoices." };

  const product_id = String(formData.get("product_id") ?? "") || null;
  const name = String(formData.get("name") ?? "").trim();
  const amount = Number(formData.get("amount") ?? 0);
  if (!name || !amount) return { error: "Name and amount are required." };

  const { error } = await supabase.from("invoice_line_items").insert({ invoice_id: invoiceId, product_id, name, amount });
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function deleteLineItem(lineItemId: string, revalidateTo: string) {
  const supabase = await createClient();
  if (!(await requireProcessingOrAbove(supabase))) return { error: "You don't have permission to edit invoices." };

  const { error } = await supabase.from("invoice_line_items").delete().eq("id", lineItemId);
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

// ---- Administrative fee payment tracking -----------------------------------

export async function updateAdminFeeStatus(invoiceId: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  if (!(await requireProcessingOrAbove(supabase))) return { error: "You don't have permission to edit invoices." };

  const admin_fee_status = String(formData.get("admin_fee_status") ?? "unpaid");
  const admin_fee_paid_date = String(formData.get("admin_fee_paid_date") ?? "") || (admin_fee_status === "paid" ? new Date().toISOString().slice(0, 10) : null);
  const admin_fee_payment_method = String(formData.get("admin_fee_payment_method") ?? "").trim() || null;

  const { error } = await supabase
    .from("invoices")
    .update({ admin_fee_status, admin_fee_paid_date, admin_fee_payment_method })
    .eq("id", invoiceId);
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

// ---- Email -----------------------------------------------------------------

export async function sendInvoiceEmail(invoiceId: string, studentId: string, revalidateTo: string) {
  const supabase = await createClient();
  if (!(await requireProcessingOrAbove(supabase))) return { error: "You don't have permission to send invoices." };

  const { data: student } = await supabase.from("leads").select("full_name, email").eq("id", studentId).maybeSingle();
  if (!student?.email) return { error: "This student has no email address on file." };

  if (!isEmailConfigured()) return { error: "Email isn't configured yet. Set SMTP_HOST / SMTP_USER / SMTP_PASS in the environment." };

  const pdfResult = await generateInvoicePdf(invoiceId, studentId, revalidateTo);
  if (pdfResult && "error" in pdfResult) return { error: pdfResult.error };

  const { data: invoice } = await supabase.from("invoices").select("pdf_path, invoice_number").eq("id", invoiceId).maybeSingle();
  if (!invoice?.pdf_path) return { error: "Could not generate the invoice PDF." };

  const { data: file, error: downloadError } = await supabase.storage.from("documents").download(invoice.pdf_path);
  if (downloadError || !file) return { error: downloadError?.message ?? "Could not read the generated PDF." };
  const buffer = Buffer.from(await file.arrayBuffer());

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const result = await sendEmail({
    to: student.email,
    subject: `Invoice ${invoice.invoice_number ?? ""} — HMARK Consultants`,
    text: `Dear ${student.full_name},\n\nPlease find attached your invoice from HMARK Consultants.\n\nRegards,\nHMARK Consultants`,
    attachments: [{ filename: `${invoice.invoice_number ?? "invoice"}.pdf`, content: buffer, contentType: "application/pdf" }],
  });

  await supabase.from("invoice_email_log").insert({
    invoice_id: invoiceId,
    kind: "invoice",
    sent_to: student.email,
    status: result.error ? "failed" : "sent",
    error: result.error ?? null,
    sent_by: user?.id,
  });

  if (result.error) return { error: result.error };

  revalidatePath(revalidateTo);
  return { success: true };
}

// Called by the daily cron route (see src/app/api/cron/overdue-invoices) —
// sends one reminder per overdue invoice, throttled to at most once per 24h.
export async function sendOverdueReminderIfDue(invoiceId: string, studentId: string) {
  // No staff session in a cron context — use the service-role client so RLS
  // (which gates everything on has_role()/staff_can_view_student()) doesn't
  // silently block every query.
  const supabase = createAdminClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select("pdf_path, invoice_number, last_reminder_sent_at")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice) return { error: "Invoice not found." };

  if (invoice.last_reminder_sent_at) {
    const hoursSince = (Date.now() - new Date(invoice.last_reminder_sent_at).getTime()) / 36e5;
    if (hoursSince < 24) return { skipped: true };
  }

  const { data: student } = await supabase.from("leads").select("full_name, email").eq("id", studentId).maybeSingle();
  if (!student?.email) return { skipped: true };
  if (!isEmailConfigured()) return { skipped: true };

  const pdfResult = await buildAndStoreInvoicePdf(supabase, invoiceId, studentId);
  if (pdfResult.error) return { error: pdfResult.error };

  const { data: file } = await supabase.storage.from("documents").download(pdfResult.pdfPath!);
  const buffer = file ? Buffer.from(await file.arrayBuffer()) : null;

  const result = await sendEmail({
    to: student.email,
    subject: `Payment overdue — Invoice ${pdfResult.invoiceNumber ?? ""} — HMARK Consultants`,
    text: `Dear ${student.full_name},\n\nThis is a reminder that one or more installments on your invoice are now overdue. Please arrange payment at your earliest convenience.\n\nRegards,\nHMARK Consultants`,
    attachments: buffer ? [{ filename: `${pdfResult.invoiceNumber ?? "invoice"}.pdf`, content: buffer, contentType: "application/pdf" }] : undefined,
  });

  await supabase.from("invoice_email_log").insert({
    invoice_id: invoiceId,
    kind: "overdue_reminder",
    sent_to: student.email,
    status: result.error ? "failed" : "sent",
    error: result.error ?? null,
  });

  if (!result.error) {
    await supabase.from("invoices").update({ last_reminder_sent_at: new Date().toISOString() }).eq("id", invoiceId);
  }

  return result.error ? { error: result.error } : { success: true };
}
