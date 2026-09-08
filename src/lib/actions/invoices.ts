"use server";

import { createElement } from "react";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { formatDateOnly } from "@/lib/formatDate";
import { requirePermission } from "@/lib/auth/permissions";
import { computeInvoiceMath, splitIntoInstallments, SRB_TAX_RATE, conversionNote } from "@/lib/invoiceMath";
import { buildInvoiceEmail } from "@/lib/invoiceEmail";
import { sendEmail, accountsFrom } from "@/lib/email";
import { getSiteUrl } from "@/lib/siteUrl";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

// PDF-safe currency prefixes. The base PDF fonts cover WinAnsi, which has €
// and $ but NOT ₨ (U+20A8) — using it printed a stray glyph instead of a
// currency on every PKR invoice, i.e. the whole private-university track.
// The ISO code is unambiguous and always renders.
const CURRENCY_SYMBOLS: Record<string, string> = { PKR: "PKR ", USD: "$", EUR: "€" };

const LONG_DATE: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric" };

// Date.setMonth() overflows past month-end for short target months (e.g. 31
// Jan + 1 month rolls over to 3 March, not the intended end of February) —
// done entirely in UTC, independent of `date.setMonth`, so it's also immune
// to the timezone-dependent day-shift that mixing a UTC-parsed date string
// with local-time Date methods would otherwise introduce.
function addMonthsClampedUTC(dateStr: string, months: number): string {
  const [y, m, day] = dateStr.split("-").map(Number);
  const totalMonths = m - 1 + months;
  const targetYear = y + Math.floor(totalMonths / 12);
  const targetMonthIndex = ((totalMonths % 12) + 12) % 12;
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, daysInTargetMonth);
  return new Date(Date.UTC(targetYear, targetMonthIndex, targetDay)).toISOString().slice(0, 10);
}

const DEFAULT_TERMS =
  "Only upon refusal from the university, 100% of the paid consultancy charges only will be refundable. There is no refund on withdrawal or rejection from the embassy or on failing the admission test, or under any other condition. Refunds are processed within 90 working days of the refusal notice.";

export async function generateInvoice(studentId: string, agreementId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  // A student may have no agreement yet — the invoice is still valid, just
  // unlinked. An empty string here reaches Postgres as an invalid uuid and the
  // whole generation fails, so normalise it to null.
  const agreement_id = agreementId?.trim() ? agreementId.trim() : null;

  const admin_charge = Number(formData.get("admin_charge") ?? 0);
  const consultancy_fee = Number(formData.get("consultancy_fee") ?? 0);
  const currency = String(formData.get("currency") ?? "EUR");
  const installmentCount = Number(formData.get("installment_count") ?? 1);
  const intake = String(formData.get("intake") ?? "").trim() || null;
  const terms = String(formData.get("terms") ?? "").trim() || DEFAULT_TERMS;
  const invoice_number = String(formData.get("invoice_number") ?? "").trim() || null;
  const firstDueDate = String(formData.get("first_due_date") ?? "") || null;
  const installment_plan = String(formData.get("installment_plan") ?? "").trim() || null;

  // An installment with no due date never counts as overdue (see
  // computeInvoiceStatus) — that's not just a missing display detail, it
  // means the daily overdue-invoices cron never reminds the student and no
  // report ever flags it, silently, forever.
  if (!firstDueDate) return { error: "First installment due date is required." };

  const discount_amount = Number(formData.get("discount_amount") ?? 0);
  const discount_reason = String(formData.get("discount_reason") ?? "").trim() || null;
  if (discount_amount > consultancy_fee) {
    return { error: "Discount cannot exceed the consultancy fee." };
  }

  // Discount off the fee, SRB tax on what remains, then the admin charge — the
  // same computation the generator previews and the PDF prints.
  const math = computeInvoiceMath({
    consultancyFee: consultancy_fee,
    adminCharge: admin_charge,
    discountAmount: discount_amount,
    taxRate: SRB_TAX_RATE,
  });

  const amounts = splitIntoInstallments(math.total, installmentCount);
  const installments = amounts.map((amount, i) => ({
    installment_no: i + 1,
    amount,
    due_date: firstDueDate ? addMonthsClampedUTC(firstDueDate, i) : null,
  }));

  // Single security-definer RPC — the invoice and its installments commit or
  // fail together (see migration 0090), rather than as two separate writes
  // that could leave a zero-installment invoice behind if the second failed.
  const { error } = await supabase.rpc("generate_invoice", {
    p_student_id: studentId,
    p_agreement_id: agreement_id,
    p_admin_charge: admin_charge,
    p_consultancy_fee: consultancy_fee,
    p_currency: currency,
    p_intake: intake,
    p_terms: terms,
    p_invoice_number: invoice_number,
    p_installment_plan: installment_plan,
    p_installments: installments,
    p_discount_amount: math.discountAmount,
    p_discount_reason: discount_reason,
    p_tax_rate: math.taxRate,
    p_tax_amount: math.taxAmount,
  });
  if (error) return { error: error.message };

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/finance/invoice-generator");
  revalidatePath("/finance/consultancy-fee");
  return { success: true };
}

export async function updateInvoice(invoiceId: string, studentId: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const denied = await requirePermission("finance.invoices.manage", "Only Finance/Super Admin can edit invoices.");
  if (denied) return { error: denied.error };

  const admin_charge = Number(formData.get("admin_charge") ?? 0);
  const consultancy_fee = Number(formData.get("consultancy_fee") ?? 0);
  const currency = String(formData.get("currency") ?? "EUR");
  const intake = String(formData.get("intake") ?? "").trim() || null;
  const terms = String(formData.get("terms") ?? "").trim() || DEFAULT_TERMS;
  const invoice_number = String(formData.get("invoice_number") ?? "").trim() || null;
  const installment_plan = String(formData.get("installment_plan") ?? "").trim() || null;

  const { error } = await supabase
    .from("invoices")
    .update({ admin_charge, consultancy_fee, currency, intake, terms, invoice_number, installment_plan })
    .eq("id", invoiceId);
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function deleteInvoice(invoiceId: string, studentId: string, revalidateTo: string) {
  const supabase = await createClient();
  const denied = await requirePermission("finance.invoices.delete", "Only Super Admin can delete invoices.");
  if (denied) return { error: denied.error };

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
  const denied = await requirePermission("finance.invoices.manage", "Only Finance/Super Admin can edit installments.");
  if (denied) return { error: denied.error };

  const amount = Number(formData.get("amount") ?? 0);
  const due_date = String(formData.get("due_date") ?? "") || null;
  const status = String(formData.get("status") ?? "unpaid");
  const payment_method = String(formData.get("payment_method") ?? "").trim() || null;
  const paid_date = String(formData.get("paid_date") ?? "") || null;
  const amount_paid = status === "paid" ? amount : status === "partial" ? Number(formData.get("amount_paid") ?? 0) : 0;

  // Same reasoning as generateInvoice: a null due_date makes this
  // installment invisible to computeInvoiceStatus's overdue check and the
  // daily reminder cron, permanently, with no error shown anywhere.
  if (!due_date) return { error: "Due date is required." };

  const { error } = await supabase
    .from("invoice_installments")
    .update({
      amount,
      due_date,
      status,
      payment_method,
      amount_paid,
      paid_date: status === "paid" ? paid_date ?? new Date().toISOString().slice(0, 10) : paid_date,
    })
    .eq("id", installmentId);
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function markInstallmentPaid(installmentId: string, studentId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const paid_date = String(formData.get("paid_date") ?? new Date().toISOString().slice(0, 10));
  const payment_method = String(formData.get("payment_method") ?? "").trim() || null;

  const { data: installment } = await supabase.from("invoice_installments").select("amount").eq("id", installmentId).maybeSingle();

  const { error } = await supabase
    .from("invoice_installments")
    .update({ status: "paid", paid_date, payment_method, amount_paid: installment?.amount ?? 0 })
    .eq("id", installmentId);

  if (error) return { error: error.message };

  revalidatePath(`/students/${studentId}`);
  return { success: true };
}

/**
 * Emails the invoice to the student, with a tokenised link to the receipt
 * rather than a PDF attachment.
 *
 * This used to only flip sent_status to 'sent' and stamp sent_at — no mail was
 * ever sent, so the CRM reported invoices as delivered that nobody received.
 * The status is now written only after the send actually succeeds.
 */
// Explicit return type: without it the inferred union of the early-return
// error shapes and the success shape can't be property-accessed by callers.
export async function sendInvoiceToStudent(
  invoiceId: string,
  studentId: string
): Promise<{ error?: string; success?: boolean; sentTo?: string }> {
  const denied = await requirePermission("finance.invoices.manage", "You can't send invoices.");
  if (denied) return denied;
  const supabase = await createClient();
  return buildAndSendInvoiceEmail(supabase, invoiceId, studentId, "invoice");
}

/**
 * The single implementation behind every invoice email — the Invoice
 * Generator, the button on the student page, and the daily overdue cron.
 * These previously had three separate bodies, two of which attached the PDF
 * instead of linking to it, so what a student received depended on where
 * staff happened to click.
 *
 * Takes its client so the cron can pass a service-role one: it has no staff
 * session, and RLS on invoices gates on has_role().
 */
export async function buildAndSendInvoiceEmail(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invoiceId: string,
  studentId: string,
  variant: "invoice" | "overdue" | "receipt" = "invoice"
): Promise<{ error?: string; success?: boolean; sentTo?: string }> {

  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      `id, invoice_number, intake, currency, admin_charge, consultancy_fee,
       discount_amount, discount_reason, tax_rate, created_at, pdf_path`
    )
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice) return { error: "Invoice not found." };

  const { data: student } = await supabase.from("leads").select("full_name, email, country_of_interest").eq("id", studentId).maybeSingle();
  if (!student?.email) return { error: "This student has no email address on record." };

  const { data: installments } = await supabase
    .from("invoice_installments")
    .select("installment_no, amount, amount_paid, status, due_date")
    .eq("invoice_id", invoiceId)
    .order("installment_no", { ascending: true });

  const math = computeInvoiceMath({
    consultancyFee: Number(invoice.consultancy_fee ?? 0),
    adminCharge: Number(invoice.admin_charge ?? 0),
    discountAmount: Number(invoice.discount_amount ?? 0),
    taxRate: Number(invoice.tax_rate ?? 0),
  });
  const amountPaid = (installments ?? []).reduce((s, i) => s + Number(i.amount_paid ?? 0), 0);
  const balanceDue = Math.round((math.total - amountPaid) * 100) / 100;

  const invoiceNumber =
    invoice.invoice_number ?? `INV-${new Date(invoice.created_at).getFullYear()}-${invoiceId.slice(0, 6).toUpperCase()}`;

  // Make sure the PDF exists before the student is told to open it. The route
  // can build it on demand too, but doing it here keeps the first click fast.
  if (!invoice.pdf_path) {
    const built = await buildAndStoreInvoicePdf(supabase, invoiceId, studentId);
    if (built?.error) return { error: `Couldn't prepare the receipt PDF: ${built.error}` };
  }

  // Minted server-side; this also invalidates any link sent previously.
  // The RPC checks has_role, which a cron run cannot satisfy — it holds a
  // service-role client and no auth.uid(). Fall back to writing the token
  // directly, which RLS still permits only for that service-role client.
  let token: string | null = null;
  const { data: rpcToken, error: tokenError } = await supabase.rpc("issue_receipt_token", {
    p_invoice_id: invoiceId,
    p_days: 90,
  });
  if (!tokenError && rpcToken) {
    token = rpcToken as string;
  } else {
    const fresh = crypto.randomUUID();
    const { error: writeError } = await supabase
      .from("invoices")
      .update({
        receipt_token: fresh,
        receipt_token_expires_at: new Date(Date.now() + 90 * 86400_000).toISOString(),
      })
      .eq("id", invoiceId);
    if (writeError) return { error: tokenError?.message ?? writeError.message };
    token = fresh;
  }
  if (!token) return { error: "Couldn't create the receipt link." };

  const { data: bankRow } = await supabase
    .from("invoice_settings")
    .select("bank_name, account_title, account_number, iban, branch, swift_code, payment_note, account_currency")
    .eq("id", true)
    .maybeSingle();

  const email = buildInvoiceEmail({
    studentName: student.full_name,
    invoiceNumber,
    currency: invoice.currency,
    intake: invoice.intake,
    destination: student.country_of_interest,
    discountReason: invoice.discount_reason,
    math,
    installments: (installments ?? []).map((i) => ({
      no: i.installment_no,
      amount: Number(i.amount ?? 0),
      dueDate: i.due_date,
      paid: i.status === "paid",
    })),
    amountPaid,
    balanceDue,
    receiptUrl: `${getSiteUrl()}/receipt/${token}`,
    variant,
    conversionNote: conversionNote(invoice.currency, bankRow?.account_currency),
    bank: bankRow
      ? {
          bankName: bankRow.bank_name,
          accountTitle: bankRow.account_title,
          accountNumber: bankRow.account_number,
          iban: bankRow.iban,
          branch: bankRow.branch,
          swiftCode: bankRow.swift_code,
          paymentNote: bankRow.payment_note,
        }
      : null,
  });

  const sent = await sendEmail({
    to: student.email,
    subject: email.subject,
    text: email.text,
    html: email.html,
    from: accountsFrom(),
  });
  if (sent.error) return { error: sent.error };

  const { data: existingReceipt } = await supabase.from("receipts").select("id").eq("invoice_id", invoiceId).maybeSingle();
  const nowIso = new Date().toISOString();
  if (existingReceipt) {
    await supabase.from("receipts").update({ sent_status: "sent", sent_at: nowIso }).eq("id", existingReceipt.id);
  } else {
    await supabase.from("receipts").insert({ invoice_id: invoiceId, sent_status: "sent", sent_at: nowIso });
  }
  await supabase.from("invoices").update({ sent_status: "sent", sent_at: nowIso }).eq("id", invoiceId);

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/finance/invoice-generator");
  return { success: true, sentTo: student.email };
}

/**
 * Acknowledges a payment to the student — the same document, framed as a
 * receipt rather than a bill.
 *
 * This used to stamp sent_status = 'sent' and write a receipts row without
 * sending anything, so staff saw "sent" on a receipt the student never got.
 * It now goes through the one email implementation, which writes those rows
 * only after the send succeeds.
 */
export async function sendReceipt(
  invoiceId: string,
  studentId: string
): Promise<{ error?: string; success?: boolean; sentTo?: string }> {
  const denied = await requirePermission("finance.invoices.manage", "You can't send receipts.");
  if (denied) return denied;
  const supabase = await createClient();
  return buildAndSendInvoiceEmail(supabase, invoiceId, studentId, "receipt");
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
      `id, invoice_number, intake, terms, admin_charge, consultancy_fee, currency, installment_plan, created_at,
       discount_amount, discount_reason, tax_rate, tax_amount,
       agreement:agreements(generated_by, template:agreement_templates(signatory_name, destination:destinations(display_name)))`
    )
    .eq("id", invoiceId)
    .single();

  if (invoiceError || !invoice) return { error: invoiceError?.message ?? "Invoice not found." };

  const { data: student } = await supabase.from("leads").select("full_name, contact_number, email").eq("id", studentId).maybeSingle();

  const { data: installments } = await supabase
    .from("invoice_installments")
    .select("installment_no, amount, amount_paid, status, due_date, paid_date, payment_method")
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

  // Recomputed from the figures stored ON THIS INVOICE, using its own stored
  // tax_rate — never the current SRB rate — so reprinting an old invoice
  // reproduces the numbers the student was originally billed.
  const math = computeInvoiceMath({
    consultancyFee: Number(invoice.consultancy_fee ?? 0),
    adminCharge: Number(invoice.admin_charge ?? 0),
    discountAmount: Number(invoice.discount_amount ?? 0),
    taxRate: Number(invoice.tax_rate ?? 0),
  });
  const subtotal = math.total;
  const amountPaid = (installments ?? []).reduce((sum, i) => sum + i.amount_paid, 0);
  const balanceDue = Math.round((subtotal - amountPaid) * 100) / 100;
  const status: "paid" | "partially_paid" | "unpaid" = balanceDue <= 0 ? "paid" : amountPaid > 0 ? "partially_paid" : "unpaid";

  const invoiceNumber = invoice.invoice_number ?? `INV-${new Date(invoice.created_at).getFullYear()}-${invoiceId.slice(0, 6).toUpperCase()}`;
  const currencySymbol = CURRENCY_SYMBOLS[invoice.currency] ?? invoice.currency;

  const payments = (installments ?? []).map((i) => ({
    date:
      i.status === "paid" && i.paid_date
        ? formatDateOnly(i.paid_date)
        : i.due_date
          ? formatDateOnly(i.due_date)
          : "—",
    method: i.payment_method,
    amount: i.amount,
    status: (i.status === "paid" ? "paid" : "unpaid") as "paid" | "unpaid",
  }));

  const nextDue = (installments ?? []).find((i) => i.status !== "paid")?.due_date ?? null;

  // Read through the client we were handed, not the session-scoped helper:
  // the overdue-invoices cron calls this with a service-role client and has no
  // staff session, so a session-based read would come back empty and the PDF
  // would print "bank details not configured" on every cron-generated copy.
  const { data: bankRow } = await supabase
    .from("invoice_settings")
    .select("bank_name, account_title, account_number, iban, branch, swift_code, payment_note, account_currency")
    .eq("id", true)
    .maybeSingle();
  const bank = bankRow
    ? {
        bankName: bankRow.bank_name,
        accountTitle: bankRow.account_title,
        accountNumber: bankRow.account_number,
        iban: bankRow.iban,
        branch: bankRow.branch,
        swiftCode: bankRow.swift_code,
        paymentNote: bankRow.payment_note,
      }
    : null;

  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { InvoiceDocument } = await import("@/lib/pdf/InvoiceDocument");

  // InvoiceDocument's root element is a <Document>, but react-pdf's
  // renderToBuffer type can't see through the wrapper component to verify
  // that structurally — safe to assert since we control the component.
  const element = createElement(InvoiceDocument, {
    data: {
      invoiceNumber,
      status,
      // Spelled-out month, matching the invoices HMARK already sends — "3/17/2026"
      // is read differently either side of the Atlantic, "March 17, 2026" is not.
      issuedDate: new Date(invoice.created_at).toLocaleDateString("en-US", LONG_DATE),
      dueDate: nextDue ? formatDateOnly(nextDue, LONG_DATE) : null,
      currencySymbol,
      currencyCode: invoice.currency,
      studentName: student?.full_name ?? "—",
      studentPhone: student?.contact_number ?? null,
      studentEmail: student?.email ?? null,
      destination: destination?.display_name ?? null,
      intake: invoice.intake,
      counselor: counselorName,
      installmentPlan: invoice.installment_plan,
      adminCharge: math.adminCharge,
      consultancyFee: math.consultancyFee,
      discountAmount: math.discountAmount,
      discountReason: invoice.discount_reason ?? null,
      netConsultancyFee: math.netConsultancyFee,
      taxRate: math.taxRate,
      taxAmount: math.taxAmount,
      terms: invoice.terms,
      payments,
      subtotal,
      amountPaid,
      balanceDue,
      bank,
      conversionNote: conversionNote(invoice.currency, bankRow?.account_currency),
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
