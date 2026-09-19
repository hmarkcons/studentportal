"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isEmailConfigured } from "@/lib/email";
import { buildAndSendInvoiceEmail } from "@/lib/actions/invoices";
import { requirePermission } from "@/lib/auth/permissions";
import { shouldSendOverdueReminder } from "@/lib/overdueReminder";

// These used to go through a hand-rolled requireProcessingOrAbove, which was
// wrong twice over.
//
// It read staff.role — the primary one shown in lists — while selecting
// "role, roles", so a colleague whose SECOND role is finance was refused and
// nobody would have found out until it happened to them. staff.roles is the
// authority, which is what requirePermission goes through.
//
// And it granted processing, while invoices.ts and every invoice control in
// the UI gate on finance.invoices.manage, which does not. Two halves of the
// same surface disagreed about who may touch an invoice; the half users can
// actually reach is this one. See migration 0255 for the database side.

// ---- Fee / product catalog -------------------------------------------------

export async function createFeeProduct(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const denied = await requirePermission("finance.invoices.manage", "You don't have permission to manage the fee catalog.");
  if (denied) return { error: denied.error };

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
  const denied = await requirePermission("finance.invoices.manage", "You don't have permission to manage the fee catalog.");
  if (denied) return { error: denied.error };

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
  const denied = await requirePermission("finance.invoices.manage", "You don't have permission to manage the fee catalog.");
  if (denied) return { error: denied.error };

  const { error } = await supabase.from("fee_products").delete().eq("id", productId);
  if (error) return { error: error.message };

  revalidatePath("/finance/consultancy-fee");
  revalidateTag("fee-products", { expire: 0 });
  return { success: true };
}

// ---- Invoice line items (extra products beyond admin + consultancy fee) ---

export async function addLineItem(invoiceId: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const denied = await requirePermission("finance.invoices.manage", "You don't have permission to edit invoices.");
  if (denied) return { error: denied.error };

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
  const denied = await requirePermission("finance.invoices.manage", "You don't have permission to edit invoices.");
  if (denied) return { error: denied.error };

  const { error } = await supabase.from("invoice_line_items").delete().eq("id", lineItemId);
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

// ---- Administrative fee payment tracking -----------------------------------

export async function updateAdminFeeStatus(invoiceId: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const denied = await requirePermission("finance.invoices.manage", "You don't have permission to edit invoices.");
  if (denied) return { error: denied.error };

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
  const denied = await requirePermission("finance.invoices.manage", "You don't have permission to send invoices.");
  if (denied) return { error: denied.error };

  const { data: student } = await supabase.from("leads").select("full_name, email").eq("id", studentId).maybeSingle();
  if (!student?.email) return { error: "This student has no email address on file." };

  if (!isEmailConfigured()) return { error: "Email isn't configured yet. Set SMTP_HOST / SMTP_USER / SMTP_PASS in the environment." };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Delegates to the one shared implementation, so this sends the same
  // link-format email as the Invoice Generator. It previously attached the
  // PDF, so which kind of email a student received depended on where staff
  // happened to click.
  const result = await buildAndSendInvoiceEmail(supabase, invoiceId, studentId, "invoice");

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

  // The interval rule lives in overdueReminder.ts so it can be tested without
  // a database and without sending mail.
  if (!shouldSendOverdueReminder(invoice.last_reminder_sent_at)) return { skipped: true };

  const { data: student } = await supabase.from("leads").select("full_name, email").eq("id", studentId).maybeSingle();
  if (!student?.email) return { skipped: true };
  if (!isEmailConfigured()) return { skipped: true };

  // The same link-format email as everywhere else, reframed as a reminder.
  // This used to attach the PDF, contradicting the rule that a receipt is
  // reached through a button rather than an attachment.
  const result = await buildAndSendInvoiceEmail(supabase, invoiceId, studentId, "overdue");

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
