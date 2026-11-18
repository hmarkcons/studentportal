import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeInvoiceMath, computePaymentProgress, sumLineItems } from "@/lib/invoiceMath";
import { overdueSince, type FeeStanding } from "./consultancyFeeReport";

/**
 * Every registered student's consultancy fee, worked out as the Consultancy
 * Fee page works it out (finance/consultancy-fee/page.tsx): the student's
 * latest invoice, its total by computeInvoiceMath with its added items, and
 * its instalments by computePaymentProgress. A student never invoiced is
 * still listed, owing their fee.
 */
export async function loadFeeStandings(supabase: SupabaseClient, today: string): Promise<FeeStanding[]> {
  const [{ data: students }, { data: invoices }, { data: staff }] = await Promise.all([
    supabase.from("students").select("id, full_name, student_code, country_of_interest, intake, registration_status, assigned_counselor_id").order("full_name"),
    supabase
      .from("invoices")
      .select("id, student_id, admin_charge, consultancy_fee, currency, intake, discount_amount, tax_rate, tax_base, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("staff").select("id, full_name"),
  ]);
  const ids = (invoices ?? []).map((i) => i.id as string);
  const [{ data: instalments }, { data: lineItems }] = await Promise.all([
    ids.length ? supabase.from("invoice_installments").select("invoice_id, installment_no, amount, amount_paid, status, due_date").in("invoice_id", ids) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("invoice_line_items").select("invoice_id, amount").in("invoice_id", ids) : Promise.resolve({ data: [] }),
  ]);

  // The latest invoice per student, as the page takes it.
  const invoiceOf = new Map<string, NonNullable<typeof invoices>[number]>();
  for (const inv of invoices ?? []) if (!invoiceOf.has(inv.student_id as string)) invoiceOf.set(inv.student_id as string, inv);
  const name = new Map((staff ?? []).map((s) => [s.id as string, (s.full_name as string | null) ?? null]));

  return (students ?? []).map((s) => {
    const inv = invoiceOf.get(s.id as string);
    const insts = inv ? (instalments ?? []).filter((i) => i.invoice_id === inv.id) : [];
    const math = inv
      ? computeInvoiceMath({
          consultancyFee: Number(inv.consultancy_fee ?? 0),
          adminCharge: Number(inv.admin_charge ?? 0),
          discountAmount: Number(inv.discount_amount ?? 0),
          taxRate: Number(inv.tax_rate ?? 0),
          taxBase: (inv.tax_base as "services" | "total" | null) ?? "services",
          extras: sumLineItems((lineItems ?? []).filter((li) => li.invoice_id === inv.id)),
        })
      : null;
    const progress = computePaymentProgress(insts);
    return {
      studentId: s.id as string,
      name: ((s.full_name as string | null) ?? "").trim() || "Unnamed student",
      code: (s.student_code as string | null) ?? null,
      country: (s.country_of_interest as string | null) ?? null,
      intake: (s.intake as string | null) ?? (inv?.intake as string | null) ?? null,
      counsellor: s.assigned_counselor_id ? (name.get(s.assigned_counselor_id as string) ?? null) : null,
      withdrawn: s.registration_status === "withdrawn",
      invoiced: Boolean(inv),
      currency: (inv?.currency as string | null) ?? "PKR",
      total: math?.total ?? 0,
      paid: progress.paid,
      outstanding: inv ? progress.outstanding : 0,
      instalmentsPaid: progress.installmentsPaid,
      instalmentsTotal: progress.installmentsTotal,
      nextDue: progress.nextDueDate,
      overdueSince: overdueSince(insts as { status: string | null; due_date: string | null }[], today),
    };
  });
}
