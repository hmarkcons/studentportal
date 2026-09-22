"use server";

import { createElement } from "react";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { formatDateOnly } from "@/lib/formatDate";
import { requirePermission } from "@/lib/auth/permissions";
import { installmentDuePlan, missingDueDates } from "@/lib/installmentDueConditions";
import {
  computeInvoiceMath,
  buildInstallmentPlan,
  installmentNote,
  sumLineItems,
  SRB_TAX_RATE,
  conversionNote,
  type AdminChargeLine,
} from "@/lib/invoiceMath";
import { planScheduleChange } from "@/lib/invoiceSchedule";
import { balanceDueDate, checkPartialSplit } from "@/lib/partialPayment";
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

/**
 * An agreement's destination track, which decides two things: the currency
 * (public is billed in EUR) and which kind of university the last installment
 * waits on. Null when there is no agreement to read a track from — an
 * unlinked invoice keeps whatever currency staff chose, since there is
 * nothing to contradict them with.
 */
async function agreementTrack(
  supabase: Awaited<ReturnType<typeof createClient>>,
  agreementId: string | null
): Promise<"public" | "private" | null> {
  if (!agreementId) return null;
  const { data } = await supabase
    .from("agreements")
    .select("template:agreement_templates(destination:destinations(track))")
    .eq("id", agreementId)
    .maybeSingle();
  const template = one(data?.template as never) as { destination?: unknown } | null;
  const destination = template?.destination ? (one(template.destination as never) as { track?: string } | null) : null;
  return destination?.track === "public" ? "public" : destination?.track === "private" ? "private" : null;
}

const DEFAULT_TERMS =
  "Only upon refusal from the university, 100% of the paid consultancy charges only will be refundable. There is no refund on withdrawal or rejection from the embassy or on failing the admission test, or under any other condition. Refunds are processed within 90 working days of the refusal notice.";

export type StudentDestination = { destinationId: string; label: string; isBackup: boolean };

/**
 * The countries this student is registered for — one primary and up to three
 * backups (lead_destinations.is_backup, migration 0108) — each of which
 * carries its own administrative fee.
 *
 * Primary first, then backups by name, so the order on the invoice is the
 * order staff chose them in rather than whatever Postgres returned.
 */
export async function studentDestinations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studentId: string
): Promise<StudentDestination[]> {
  const { data } = await supabase
    .from("lead_destinations")
    .select("destination_id, is_backup, destination:destinations(display_name, country)")
    .eq("lead_id", studentId);

  return (data ?? [])
    .map((row) => {
      const d = one(row.destination as never) as { display_name?: string | null; country?: string | null } | null;
      return {
        destinationId: row.destination_id as string,
        label: (d?.display_name || d?.country || "").trim(),
        isBackup: Boolean(row.is_backup),
      };
    })
    .filter((d) => d.destinationId)
    .sort((a, b) => Number(a.isBackup) - Number(b.isBackup) || a.label.localeCompare(b.label));
}

/**
 * The per-country administrative charges a submitted form is asking for.
 *
 * The amounts come from the form, but which countries exist and what they are
 * called come from the student's own registration — never from the post. A
 * form can always be resubmitted with extra fields, and an invoice naming a
 * country the student is not registered for is the invoice equivalent of the
 * bug templateCountryError exists to stop in agreements.
 *
 * Returns null when the student has no destinations on file, which is the
 * signal to fall back to the single admin_charge field.
 */
function adminChargesFromForm(
  formData: FormData,
  destinations: StudentDestination[]
): { destination_id: string; country_label: string; amount: number; is_backup: boolean; sort_order: number }[] | null {
  if (destinations.length === 0) return null;
  return destinations.map((d, i) => {
    const raw = formData.get(`admin_charge__${d.destinationId}`);
    const amount = Number(raw ?? 0);
    return {
      destination_id: d.destinationId,
      country_label: d.label || "Administrative fee",
      amount: Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 0,
      is_backup: d.isBackup,
      sort_order: i,
    };
  });
}

export async function generateInvoice(studentId: string, agreementId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  // Raising an invoice is the act that tells a student what to pay, so it
  // takes the same permission as editing or sending one. It had none: every
  // other write in this file checks, and three did not, which meant a role
  // override that revoked finance.invoices.manage still left the person able
  // to create invoices, mark them paid and render their PDFs.
  const denied = await requirePermission("finance.invoices.manage", "Only Finance/Super Admin can raise an invoice.");
  if (denied) return { error: denied.error };

  // A student may have no agreement yet — the invoice is still valid, just
  // unlinked. An empty string here reaches Postgres as an invalid uuid and the
  // whole generation fails, so normalise it to null.
  const agreement_id = agreementId?.trim() ? agreementId.trim() : null;

  // One administrative fee per country the student registered for. The single
  // admin_charge field is still honoured for a student with no destinations on
  // file, which is how invoices were raised before backup countries existed.
  const destinations = await studentDestinations(supabase, studentId);
  const adminCharges = adminChargesFromForm(formData, destinations);
  const admin_charge = adminCharges
    ? Math.round(adminCharges.reduce((s, c) => s + c.amount, 0) * 100) / 100
    : Number(formData.get("admin_charge") ?? 0);

  const consultancy_fee = Number(formData.get("consultancy_fee") ?? 0);
  const installmentCount = Number(formData.get("installment_count") ?? 1);
  const intake = String(formData.get("intake") ?? "").trim() || null;
  const terms = String(formData.get("terms") ?? "").trim() || DEFAULT_TERMS;
  const typedInvoiceNumber = String(formData.get("invoice_number") ?? "").trim() || null;

  // Public-university destinations are billed in EUR — both the consultancy
  // fee and the administrative charge — so the currency is taken from the
  // destination's track rather than from the form. Enforced here and not only
  // in the form's default: a stale or hand-posted form must not be able to
  // raise a public-track invoice in rupees.
  const requestedCurrency = String(formData.get("currency") ?? "EUR");
  const track = await agreementTrack(supabase, agreement_id);
  const currency = track === "public" ? "EUR" : requestedCurrency;
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

  // The administrative charge rides on installment 1, because that is how it
  // is collected — the student pays it together with their first installment.
  const amounts = buildInstallmentPlan(math, installmentCount);

  // Dates cascade monthly from the first, as before — but the last
  // installment of a two- or three-payment plan falls due on the admission
  // coming through, not on a date. installmentDuePlan decides which is which
  // and drops the derived date for the ones that wait on an event.
  const duePlan = installmentDuePlan(
    installmentCount,
    track,
    amounts.map((_, i) => (firstDueDate ? addMonthsClampedUTC(firstDueDate, i) : null))
  );
  const stillNeeded = missingDueDates(duePlan);
  if (stillNeeded.length > 0) {
    return {
      error: `Installment ${stillNeeded.join(" and ")} needs a due date before this can be issued.`,
    };
  }

  const installments = amounts.map((amount, i) => ({
    installment_no: i + 1,
    amount,
    due_date: duePlan[i]?.date ?? null,
    due_condition: duePlan[i]?.condition ?? null,
  }));

  // Staff may type their own reference; otherwise take the next HMC number for
  // this intake. Claimed before the invoice is written so a failed generation
  // burns a number rather than risking two invoices sharing one.
  let invoice_number = typedInvoiceNumber;
  if (!invoice_number) {
    const { data: minted, error: numberError } = await supabase.rpc("next_invoice_number", { p_intake: intake });
    if (numberError) return { error: `Couldn't allocate a receipt number: ${numberError.message}` };
    invoice_number = minted as string;
  }

  // Single security-definer RPC — the invoice, its installments and the
  // per-country administrative charges commit or fail together (migrations
  // 0090 and 0257), rather than as separate writes that could leave a
  // zero-installment invoice, or one whose breakdown is missing, behind.
  const { data: newInvoiceId, error } = await supabase.rpc("generate_invoice", {
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
    // Only when there is something to say: a student with one country and a
    // single charge needs no breakdown to explain it.
    p_admin_charges: (adminCharges ?? []).filter((c) => c.amount > 0),
  });
  if (error) return { error: error.message };

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/finance/invoice-generator");
  revalidatePath("/finance/consultancy-fee");

  // The document is the invoice, so raising one produces it. It used to wait
  // for somebody to press Generate PDF, which meant "View invoice" was absent
  // on a brand new invoice and the first student to open a receipt link paid
  // for the render. A failure here is reported without losing the invoice,
  // which exists and is correct either way.
  if (newInvoiceId) {
    const built = await buildAndStoreInvoicePdf(supabase, newInvoiceId as string, studentId);
    if ("error" in built && built.error) {
      return {
        success: true,
        warning: `The invoice was created, but its PDF could not be built (${built.error}). Press Generate PDF to try again.`,
      };
    }
    revalidatePath(`/students/${studentId}`);
  }

  return { success: true };
}

export async function updateInvoice(invoiceId: string, studentId: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const denied = await requirePermission("finance.invoices.manage", "Only Finance/Super Admin can edit invoices.");
  if (denied) return { error: denied.error };

  const consultancy_fee = Number(formData.get("consultancy_fee") ?? 0);
  const currency = String(formData.get("currency") ?? "EUR");
  const intake = String(formData.get("intake") ?? "").trim() || null;
  const terms = String(formData.get("terms") ?? "").trim() || DEFAULT_TERMS;
  const invoice_number = String(formData.get("invoice_number") ?? "").trim() || null;
  const installment_plan = String(formData.get("installment_plan") ?? "").trim() || null;

  // Changing a fee used to leave the instalment rows untouched, so the invoice
  // and its own payment schedule stopped agreeing about the total — and the
  // student's Payments page then had to show them a warning instead of a bill.
  // The schedule is rebuilt to match, or the edit is refused; it is never left
  // inconsistent.
  const [{ data: current }, { data: lineItems }, { data: adminRows }] = await Promise.all([
    supabase.from("invoices").select("discount_amount, tax_rate").eq("id", invoiceId).maybeSingle(),
    // Items already on the invoice stay in the total when a fee is edited;
    // without them the rebuilt schedule would silently drop them — and their
    // placement decides which instalments carry them afterwards.
    supabase
      .from("invoice_line_items")
      .select("id, amount, placement_installment_id, placement_spread")
      .eq("invoice_id", invoiceId),
    supabase
      .from("invoice_admin_charges")
      .select("id, destination_id, amount")
      .eq("invoice_id", invoiceId)
      .order("sort_order", { ascending: true }),
  ]);

  // An invoice with a per-country breakdown is edited per country; the single
  // field is what an invoice without one still uses. Either way admin_charge
  // holds the sum, which is what every figure is computed from.
  const editedAdminCharges = (adminRows ?? []).map((r) => {
    const raw = formData.get(`admin_charge__${r.destination_id}`);
    const parsed = Number(raw ?? r.amount ?? 0);
    return { id: r.id as string, amount: Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : 0 };
  });
  const admin_charge = editedAdminCharges.length
    ? Math.round(editedAdminCharges.reduce((s, c) => s + c.amount, 0) * 100) / 100
    : Number(formData.get("admin_charge") ?? 0);

  const discountAmount = Number(current?.discount_amount ?? 0);
  const taxRate = Number(current?.tax_rate ?? 0);

  // computeInvoiceMath would silently clamp this, quietly changing the discount
  // the student was promised. Refuse instead and let staff decide.
  if (discountAmount > consultancy_fee) {
    return {
      error: `This invoice carries a ${discountAmount.toFixed(2)} discount, which is more than the new consultancy fee. Lower the discount before reducing the fee.`,
    };
  }

  const math = computeInvoiceMath({
    consultancyFee: consultancy_fee,
    adminCharge: admin_charge,
    discountAmount,
    taxRate,
    extras: sumLineItems(lineItems),
  });

  const { data: existing } = await supabase
    .from("invoice_installments")
    .select("id, installment_no, amount, amount_paid, status, extras_amount")
    .eq("invoice_id", invoiceId)
    .order("installment_no", { ascending: true });

  const schedule = existing ?? [];
  const scheduleTotal = Math.round(schedule.reduce((s, i) => s + Number(i.amount ?? 0), 0) * 100) / 100;
  const needsRebuild = schedule.length > 0 && Math.abs(scheduleTotal - math.total) > 0.01;

  // A settled or part-settled instalment is a record of money that actually
  // changed hands. Rewriting its amount would falsify the ledger, so the edit
  // stops here rather than deciding for staff which record to sacrifice.
  if (needsRebuild) {
    const settled = schedule.filter((i) => i.status === "paid" || Number(i.amount_paid ?? 0) > 0);
    if (settled.length > 0) {
      return {
        error: `This would change the total from ${scheduleTotal.toFixed(2)} to ${math.total.toFixed(2)}, but ${
          settled.length === 1 ? "instalment" : "instalments"
        } ${settled.map((i) => i.installment_no).join(", ")} ${
          settled.length === 1 ? "already has a payment" : "already have payments"
        } recorded. Adjust the unpaid instalments individually, or delete this invoice and generate a new one.`,
      };
    }
  }

  const { error } = await supabase
    .from("invoices")
    // tax_amount is stored as well as recomputed, so anything reading the
    // column rather than the rate does not go stale after an edit.
    .update({
      admin_charge,
      consultancy_fee,
      currency,
      intake,
      terms,
      invoice_number,
      installment_plan,
      tax_amount: math.taxAmount,
    })
    .eq("id", invoiceId);
  if (error) return { error: error.message };

  // The per-country amounts, written after the sum they have to agree with.
  for (const c of editedAdminCharges) {
    const { error: chargeError } = await supabase
      .from("invoice_admin_charges")
      .update({ amount: c.amount })
      .eq("id", c.id);
    if (chargeError) {
      return {
        error: `The invoice was saved but one of its per-country administrative charges could not be updated (${chargeError.message}). Re-save to finish.`,
      };
    }
  }

  if (needsRebuild) {
    // Same number of instalments and the same due dates — only the amounts
    // move, with the administrative charge still on the first and each added
    // item wherever staff placed it (planScheduleChange, which the Add item
    // path uses too, so a fee edit cannot quietly relocate an item).
    const plan = planScheduleChange(schedule, lineItems ?? [], math);
    if (!plan.ok) return { error: plan.error };
    for (const write of plan.writes) {
      const { error: rowError } = await supabase
        .from("invoice_installments")
        .update({ amount: write.amount, extras_amount: write.extras_amount })
        .eq("id", write.id);
      if (rowError) {
        const no = schedule.find((s) => s.id === write.id)?.installment_no ?? "?";
        return {
          error: `The invoice was saved but instalment ${no} could not be updated (${rowError.message}). Re-save to finish rebuilding the schedule.`,
        };
      }
    }
  }

  revalidatePath(revalidateTo);
  revalidatePath("/finance/consultancy-fee");
  revalidatePath("/finance/invoice-generator");
  revalidatePath("/portal/payments");

  // The stored PDF is what the receipt link serves, and it has just been
  // contradicted by this edit.
  const rebuilt = await buildAndStoreInvoicePdf(supabase, invoiceId, studentId);
  if ("error" in rebuilt && rebuilt.error) {
    return {
      error: `The invoice was saved, but its PDF could not be rebuilt (${rebuilt.error}). Press Regenerate PDF before sending it.`,
    };
  }

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

  // A part payment splits the installment rather than sitting on it.
  //
  // Left as 'partial', the balance had no due date of its own — so nothing
  // chased it, the overdue cron could not see it, and the student was never
  // told when the rest was expected. Now what was paid is closed off at that
  // amount and the remainder becomes an installment in its own right, due a
  // week later or on a date staff choose.
  if (status === "partial") {
    const effectivePaidDate = paid_date || new Date().toISOString().slice(0, 10);
    const balance_due_date = String(formData.get("balance_due_date") ?? "") || balanceDueDate(effectivePaidDate);
    const check = checkPartialSplit(amount, amount_paid, balance_due_date);
    if (!check.ok) return { error: check.error };

    // The amount and due date staff may also have edited on the same row are
    // saved first, so the split works from what they meant to split.
    const { error: preError } = await supabase
      .from("invoice_installments")
      .update({ amount, due_date })
      .eq("id", installmentId);
    if (preError) return { error: preError.message };

    const { error: splitError } = await supabase.rpc("split_partial_installment", {
      p_installment_id: installmentId,
      p_amount_paid: amount_paid,
      p_paid_date: effectivePaidDate,
      p_balance_due_date: balance_due_date,
      p_payment_method: payment_method,
    });
    if (splitError) return { error: splitError.message };

    revalidatePath(revalidateTo);
    revalidatePath(`/students/${studentId}`);
    revalidatePath("/portal/payments");
    return { success: true };
  }

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

  // Recording money as received is a finance act, and the same one
  // updateInstallment already guards — which this bypassed entirely, since it
  // writes the identical fields by another route.
  const denied = await requirePermission("finance.invoices.manage", "Only Finance/Super Admin can record a payment.");
  if (denied) return { error: denied.error };
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

  const [{ data: installments }, { data: lineItems }, { data: adminRows }] = await Promise.all([
    supabase
      .from("invoice_installments")
      .select("installment_no, amount, amount_paid, status, due_date, due_condition, extras_amount")
      .eq("invoice_id", invoiceId)
      .order("installment_no", { ascending: true }),
    supabase.from("invoice_line_items").select("name, amount").eq("invoice_id", invoiceId).order("created_at", { ascending: true }),
    supabase
      .from("invoice_admin_charges")
      .select("country_label, amount, is_backup")
      .eq("invoice_id", invoiceId)
      .order("sort_order", { ascending: true }),
  ]);

  const math = computeInvoiceMath({
    consultancyFee: Number(invoice.consultancy_fee ?? 0),
    adminCharge: Number(invoice.admin_charge ?? 0),
    discountAmount: Number(invoice.discount_amount ?? 0),
    taxRate: Number(invoice.tax_rate ?? 0),
    extras: sumLineItems(lineItems),
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
    adminCharges: (adminRows ?? []).map((r) => ({
      label: r.country_label,
      amount: Number(r.amount ?? 0),
      isBackup: Boolean(r.is_backup),
    })),
    lineItems: (lineItems ?? []).map((li) => ({ name: li.name, amount: Number(li.amount ?? 0) })),
    installments: (installments ?? []).map((i) => ({
      no: i.installment_no,
      amount: Number(i.amount ?? 0),
      dueDate: i.due_date,
      dueCondition: i.due_condition,
      paid: i.status === "paid",
      extrasAmount: Number(i.extras_amount ?? 0),
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
       discount_amount, discount_reason, tax_rate, tax_amount, pkr_per_eur,
       agreement:agreements(generated_by, template:agreement_templates(signatory_name, destination:destinations(display_name)))`
    )
    .eq("id", invoiceId)
    .single();

  if (invoiceError || !invoice) return { error: invoiceError?.message ?? "Invoice not found." };

  const { data: student } = await supabase.from("leads").select("full_name, contact_number, email").eq("id", studentId).maybeSingle();

  const [{ data: installments }, { data: lineItems }, { data: adminRows }] = await Promise.all([
    supabase
      .from("invoice_installments")
      .select("installment_no, amount, amount_paid, status, due_date, due_condition, paid_date, payment_method, extras_amount")
      .eq("invoice_id", invoiceId)
      .order("installment_no", { ascending: true }),
    // Added items — a product from the catalog or a custom charge. They print
    // as their own rows in the Service table and count towards the total.
    supabase.from("invoice_line_items").select("name, amount").eq("invoice_id", invoiceId).order("created_at", { ascending: true }),
    // Which country each slice of the administrative charge is for. Empty on
    // an invoice raised before 0257, which prints one unlabelled row as before.
    supabase
      .from("invoice_admin_charges")
      .select("country_label, amount, is_backup")
      .eq("invoice_id", invoiceId)
      .order("sort_order", { ascending: true }),
  ]);

  const agreement = one(invoice.agreement as never) as { generated_by?: string | null; template?: unknown } | null;
  const template = agreement?.template ? (one(agreement.template as never) as { signatory_name?: string | null; destination?: unknown } | null) : null;
  const destination = template?.destination ? (one(template.destination as never) as { display_name?: string | null } | null) : null;

  // The counselor's name used to be looked up here and printed on the receipt.
  // It is off the document now, so the query goes with it rather than costing
  // a round trip per PDF for a value nothing reads.

  // Recomputed from the figures stored ON THIS INVOICE, using its own stored
  // tax_rate — never the current SRB rate — so reprinting an old invoice
  // reproduces the numbers the student was originally billed.
  const math = computeInvoiceMath({
    consultancyFee: Number(invoice.consultancy_fee ?? 0),
    adminCharge: Number(invoice.admin_charge ?? 0),
    discountAmount: Number(invoice.discount_amount ?? 0),
    taxRate: Number(invoice.tax_rate ?? 0),
    extras: sumLineItems(lineItems),
  });
  const subtotal = math.total;
  const amountPaid = (installments ?? []).reduce((sum, i) => sum + Number(i.amount_paid ?? 0), 0);
  const balanceDue = Math.round((subtotal - amountPaid) * 100) / 100;
  const status: "paid" | "partially_paid" | "unpaid" = balanceDue <= 0 ? "paid" : amountPaid > 0 ? "partially_paid" : "unpaid";

  const invoiceNumber = invoice.invoice_number ?? `INV-${new Date(invoice.created_at).getFullYear()}-${invoiceId.slice(0, 6).toUpperCase()}`;
  const currencySymbol = CURRENCY_SYMBOLS[invoice.currency] ?? invoice.currency;
  const pdfMoney = (n: number) => `${currencySymbol}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const adminBreakdown: AdminChargeLine[] = (adminRows ?? []).map((r) => ({
    label: r.country_label,
    amount: Number(r.amount ?? 0),
    isBackup: Boolean(r.is_backup),
  }));
  // The consultancy fee belongs to the primary country. The agreement names
  // it; failing that, the one charge on the breakdown that is not a backup.
  const consultancyCountry =
    destination?.display_name ?? adminBreakdown.find((c) => !c.isBackup)?.label ?? null;

  const payments = (installments ?? []).map((i) => ({
    date:
      i.status === "paid" && i.paid_date
        ? formatDateOnly(i.paid_date)
        : i.due_date
          ? formatDateOnly(i.due_date)
          // Falls due on an event, not a date: print what the event is.
          : i.due_condition ?? "—",
    method: i.payment_method,
    amount: Number(i.amount ?? 0),
    status: (i.status === "paid" ? "paid" : "unpaid") as "paid" | "unpaid",
    // The first installment carries the whole administrative charge, and an
    // added item lands on whichever instalment was next to be paid, so either
    // can be larger than the others by design. Same sentence as the card, the
    // Payments page and the email.
    note: installmentNote(i, math, pdfMoney),
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
      destination: consultancyCountry,
      intake: invoice.intake,
      installmentPlan: invoice.installment_plan,
      adminCharge: math.adminCharge,
      adminCharges: adminBreakdown,
      consultancyFee: math.consultancyFee,
      discountAmount: math.discountAmount,
      discountReason: invoice.discount_reason ?? null,
      netConsultancyFee: math.netConsultancyFee,
      lineItems: (lineItems ?? []).map((li) => ({ name: li.name, amount: Number(li.amount ?? 0) })),
      extrasAmount: math.extrasAmount,
      taxableAmount: math.taxableAmount,
      taxRate: math.taxRate,
      taxAmount: math.taxAmount,
      terms: invoice.terms,
      payments,
      subtotal,
      amountPaid,
      balanceDue,
      bank,
      conversionNote: conversionNote(invoice.currency, bankRow?.account_currency),
      // The rate stamped on this invoice, never today's: a receipt already
      // in a student's hands must not restate itself.
      pkrPerEur: invoice.pkr_per_eur == null ? null : Number(invoice.pkr_per_eur),
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
  // As generateAgreementPdf does. The PDF is the document the student is sent,
  // and rendering it writes pdf_path.
  const denied = await requirePermission("finance.invoices.manage", "Only Finance/Super Admin can generate an invoice PDF.");
  if (denied) return { error: denied.error };

  const supabase = await createClient();
  const result = await buildAndStoreInvoicePdf(supabase, invoiceId, studentId);
  if ("error" in result) return { error: result.error };

  revalidatePath(revalidateTo);
  return { success: true };
}
