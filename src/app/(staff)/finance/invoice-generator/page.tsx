import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { getInvoiceBankSettings } from "@/lib/actions/invoiceSettings";
import { resolveInvoiceDefaults } from "@/lib/invoiceDefaults";
import { computeInvoiceMath, computePaymentProgress } from "@/lib/invoiceMath";
import { InvoiceGenerator, type StudentOption } from "./InvoiceGenerator";
import { GeneratedInvoiceList, type GeneratedInvoice } from "./GeneratedInvoiceList";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function InvoiceGeneratorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
  const role = staffRow?.role ?? null;
  const canManage = role === "super_admin" || role === "finance";

  if (!canManage) {
    return (
      <div className="mx-auto max-w-3xl">
        <h2 className="mb-2 text-lg font-semibold text-ink">Invoice Generator</h2>
        <Card>
          <p className="text-sm text-muted">Only Super Admin and Finance can issue invoices.</p>
        </Card>
      </div>
    );
  }

  const bank = await getInvoiceBankSettings();
  const bankConfigured = Boolean(bank?.account_title || bank?.bank_name || bank?.iban || bank?.account_number);

  // Registered students, the country they registered for, and their agreement
  // — everything the picker needs to pre-fill an invoice.
  const [{ data: students }, { data: destinations }, { data: agreements }] = await Promise.all([
    supabase
      .from("students")
      .select("id, full_name, email, contact_number, country_of_interest, intake, discount_amount, discount_reason, level_applying_for")
      .order("registered_at", { ascending: false }),
    supabase.from("destinations").select("id, country, display_name, admin_charge, consultancy_fee, consultancy_fee_currency"),
    supabase.from("agreements").select("id, student_id, status, admin_charge_override, consultancy_fee_override, discount_amount, installment_count"),
  ]);

  const destByLabel = new Map<string, NonNullable<typeof destinations>[number]>();
  for (const d of destinations ?? []) {
    if (d.display_name) destByLabel.set(d.display_name, d);
    if (d.country) destByLabel.set(d.country, d);
  }
  // Prefer a signed agreement when a student somehow has more than one.
  const agreementByStudent = new Map<string, NonNullable<typeof agreements>[number]>();
  for (const a of agreements ?? []) {
    const existing = agreementByStudent.get(a.student_id);
    if (!existing || (a.status === "signed" && existing.status !== "signed")) agreementByStudent.set(a.student_id, a);
  }

  const options: StudentOption[] = (students ?? []).map((s) => {
    const dest = destByLabel.get(s.country_of_interest ?? "") ?? null;
    const defaults = resolveInvoiceDefaults(s, dest, agreementByStudent.get(s.id) ?? null);
    return {
      id: s.id,
      name: s.full_name,
      email: s.email,
      country: s.country_of_interest,
      level: s.level_applying_for,
      agreementId: defaults.agreementId,
      currency: defaults.currency,
      intake: defaults.intake,
      installmentCount: defaults.installmentCount,
      consultancyFee: defaults.math.consultancyFee,
      adminCharge: defaults.math.adminCharge,
      discountAmount: defaults.math.discountAmount,
      discountReason: defaults.discountReason,
      source: defaults.source,
    };
  });

  // Already-issued invoices, for the view / modify / delete / record-payment list.
  const { data: invoices } = await supabase
    .from("invoices")
    .select(
      `id, student_id, invoice_number, intake, currency, admin_charge, consultancy_fee,
       discount_amount, discount_reason, tax_rate, tax_amount,
       admin_fee_status, sent_status, sent_at, pdf_path, created_at,
       student:leads(full_name, email)`
    )
    .order("created_at", { ascending: false })
    .limit(100);

  const invoiceIds = (invoices ?? []).map((i) => i.id);
  const { data: installments } = invoiceIds.length
    ? await supabase
        .from("invoice_installments")
        .select("id, invoice_id, installment_no, amount, amount_paid, status, due_date, paid_date, payment_method")
        .in("invoice_id", invoiceIds)
        .order("installment_no", { ascending: true })
    : { data: [] };

  type InstallmentRow = {
    id: string; invoice_id: string; installment_no: number; amount: number | string;
    amount_paid: number | string | null; status: string; due_date: string | null;
    paid_date: string | null; payment_method: string | null;
  };
  const byInvoice = new Map<string, InstallmentRow[]>();
  for (const i of (installments ?? []) as InstallmentRow[]) {
    const list = byInvoice.get(i.invoice_id) ?? [];
    list.push(i);
    byInvoice.set(i.invoice_id, list);
  }

  const rows: GeneratedInvoice[] = (invoices ?? []).map((inv) => {
    const mine = byInvoice.get(inv.id) ?? [];
    const math = computeInvoiceMath({
      consultancyFee: Number(inv.consultancy_fee ?? 0),
      adminCharge: Number(inv.admin_charge ?? 0),
      discountAmount: Number(inv.discount_amount ?? 0),
      taxRate: Number(inv.tax_rate ?? 0),
    });
    const progress = computePaymentProgress(mine, {
      adminCharge: 0, // the admin charge is already inside the installment amounts
      adminFeePaid: false,
    });
    const student = one(inv.student as never) as { full_name?: string; email?: string | null } | null;
    return {
      id: inv.id,
      studentId: inv.student_id,
      studentName: student?.full_name ?? "—",
      studentEmail: student?.email ?? null,
      invoiceNumber: inv.invoice_number,
      currency: inv.currency,
      intake: inv.intake,
      createdAt: inv.created_at,
      sentStatus: inv.sent_status,
      sentAt: inv.sent_at,
      hasPdf: Boolean(inv.pdf_path),
      math,
      discountReason: inv.discount_reason,
      paid: progress.paid,
      outstanding: progress.outstanding,
      nextDueDate: progress.nextDueDate,
      status: progress.status,
      installments: mine.map((i) => ({
        id: i.id,
        no: i.installment_no,
        amount: Number(i.amount ?? 0),
        amountPaid: Number(i.amount_paid ?? 0),
        status: i.status,
        dueDate: i.due_date,
        paidDate: i.paid_date,
        paymentMethod: i.payment_method,
      })),
    };
  });

  return (
    <div className="mx-auto max-w-5xl">
      <h2 className="mb-1 text-lg font-semibold text-ink">Invoice Generator</h2>
      <p className="mb-4 text-sm text-muted">
        Pick a registered student — the consultancy fee, administrative charge and any discount are pulled from their
        registered country and signed agreement, and SRB tax is applied automatically.
      </p>

      {!bankConfigured && (
        <Card className="mb-4 bg-warning-bg">
          <p className="text-sm text-warning">
            No bank details are configured, so invoices will print without payment instructions.{" "}
            <Link href="/setup/invoice-settings" className="underline">
              Set them in Setup › Invoice Settings
            </Link>{" "}
            before sending anything to a student.
          </p>
        </Card>
      )}

      <Card className="mb-6">
        {options.length === 0 ? (
          <EmptyState>No registered students yet.</EmptyState>
        ) : (
          <InvoiceGenerator students={options} bank={bank} />
        )}
      </Card>

      <h3 className="mb-3 text-sm font-medium text-ink">Issued invoices</h3>
      <GeneratedInvoiceList invoices={rows} canDelete={role === "super_admin"} />
    </div>
  );
}
