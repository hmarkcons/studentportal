import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/ui/StatCard";
import { computeInvoiceStatus } from "@/lib/invoiceStatus";
import { computeInvoiceMath, computePaymentProgress } from "@/lib/invoiceMath";
import { FeeProductCatalog } from "./FeeProductCatalog";
import { ConsultancyFeeList } from "./ConsultancyFeeList";
import { ConsultancyFeeOverview, type FeeRow, type FeeStatus } from "./ConsultancyFeeOverview";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function ConsultancyFeePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
  const role = staffRow?.role ?? null;
  const isSuperAdmin = role === "super_admin";
  // Super Admin manages, Finance views. Processing previously had manage
  // rights here; payment records are now Super Admin's alone.
  const canView = isSuperAdmin || role === "finance";
  const canManage = isSuperAdmin;

  if (!canView) {
    return (
      <div className="w-full">
        <h2 className="mb-2 text-lg font-semibold text-ink">Consultancy Fee</h2>
        <p className="text-sm text-muted">
          This section is restricted to Super Admin and the accounts team.
        </p>
      </div>
    );
  }

  const { data: invoices } = await supabase
    .from("invoices")
    .select(
      `id, student_id, admin_charge, consultancy_fee, currency, sent_status, pdf_path, invoice_number, intake, terms,
       discount_amount, discount_reason, tax_rate, tax_amount,
       admin_fee_status, admin_fee_paid_date, admin_fee_payment_method,
       student:leads(full_name, registered_at)`
    )
    .order("created_at", { ascending: false });

  const invoiceIds = (invoices ?? []).map((i) => i.id);

  const { data: installments } = invoiceIds.length
    ? await supabase.from("invoice_installments").select("*").in("invoice_id", invoiceIds)
    : { data: [] };

  const { data: lineItems } = invoiceIds.length
    ? await supabase.from("invoice_line_items").select("id, invoice_id, name, amount").in("invoice_id", invoiceIds)
    : { data: [] };

  const { data: feeProducts } = await supabase.from("fee_products").select("id, name, default_amount, default_currency").order("name");

  const pdfUrls = new Map<string, string>();
  await Promise.all(
    (invoices ?? [])
      .filter((i) => i.pdf_path)
      .map(async (i) => {
        const { data } = await supabase.storage.from("documents").createSignedUrl(i.pdf_path!, 3600);
        if (data?.signedUrl) pdfUrls.set(i.id, data.signedUrl);
      })
  );

  const rows = (invoices ?? []).map((inv) => {
    const student = one(inv.student as never) as { full_name?: string; registered_at?: string } | null;
    return {
      invoice: inv,
      installments: (installments ?? []).filter((i) => i.invoice_id === inv.id),
      lineItems: (lineItems ?? []).filter((li) => li.invoice_id === inv.id),
      studentId: inv.student_id,
      studentName: student?.full_name ?? "Unknown",
      registeredAt: student?.registered_at ?? null,
      pdfUrl: pdfUrls.get(inv.id),
    };
  });

  // Per-student payment position for the filterable overview. Driven from the
  // registered-student list rather than from invoices, so a student who has
  // never been invoiced still shows up as owing everything instead of being
  // silently absent from the finance view.
  const { data: regStudents } = await supabase
    .from("students")
    .select("id, full_name, country_of_interest, intake, level_applying_for, registration_status, assigned_counselor_id")
    .order("registered_at", { ascending: false });

  const { data: counselors } = await supabase.from("staff").select("id, full_name");
  const counselorName = new Map((counselors ?? []).map((c) => [c.id, c.full_name]));

  const invoiceByStudent = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!invoiceByStudent.has(r.studentId)) invoiceByStudent.set(r.studentId, r);

  const today = new Date().toISOString().slice(0, 10);

  const feeRows: FeeRow[] = (regStudents ?? []).map((s) => {
    const r = invoiceByStudent.get(s.id);
    const inv = r?.invoice;
    const insts = r?.installments ?? [];
    const adminCharge = Number(inv?.admin_charge ?? 0);
    const adminFeePaid = inv?.admin_fee_status === "paid";

    const math = inv
      ? computeInvoiceMath({
          consultancyFee: Number(inv.consultancy_fee ?? 0),
          adminCharge,
          discountAmount: Number(inv.discount_amount ?? 0),
          taxRate: Number(inv.tax_rate ?? 0),
        })
      : null;

    // The admin charge is already inside the installment amounts, so it is not
    // added again here — it is tracked separately only for its paid flag.
    const progress = computePaymentProgress(insts, { adminCharge: 0, adminFeePaid: false });
    const overdue = insts.some((i) => i.status !== "paid" && i.due_date && i.due_date < today);

    const status: FeeStatus =
      s.registration_status === "withdrawn" ? "withdrawn" : inv ? progress.status : "payment_pending";

    return {
      studentId: s.id,
      studentName: s.full_name,
      country: s.country_of_interest,
      intake: s.intake ?? inv?.intake ?? null,
      level: s.level_applying_for,
      counselor: s.assigned_counselor_id ? counselorName.get(s.assigned_counselor_id) ?? null : null,
      currency: inv?.currency ?? "PKR",
      total: math?.total ?? 0,
      paid: progress.paid,
      outstanding: inv ? progress.outstanding : 0,
      installmentsPaid: progress.installmentsPaid,
      installmentsTotal: progress.installmentsTotal,
      adminCharge,
      adminFeePaid,
      nextDueDate: progress.nextDueDate,
      overdue,
      status,
      hasInvoice: Boolean(inv),
    };
  });

  const counts = { paid: 0, pending: 0, overdue: 0 };
  for (const r of rows) {
    const status = computeInvoiceStatus(r.invoice.admin_fee_status ?? "unpaid", r.installments);
    counts[status]++;
  }

  return (
    <div className="w-full">
      <h2 className="text-lg font-semibold text-ink">Consultancy Fee</h2>
      <p className="mb-4 text-sm text-muted">
        Consultancy fee and administrative fee payments across every registered student — installments, payment mode, status, and invoicing.
      </p>

      <ConsultancyFeeOverview rows={feeRows} canManage={canManage} />

      {/* Per-invoice management kept behind a disclosure: the overview above is
          what this page is for, and the invoice-by-invoice controls are only
          needed when actually correcting a record. */}
      <details className="mb-6">
        <summary className="cursor-pointer text-sm font-medium text-ink">
          Per-invoice detail and payment records ({rows.length} invoice{rows.length === 1 ? "" : "s"})
        </summary>
        <div className="mt-3">
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Invoices paid" value={counts.paid} tone="success" icon="✅" />
            <StatCard label="Invoices pending" value={counts.pending} tone="warning" icon="⏳" />
            <StatCard label="Invoices overdue" value={counts.overdue} tone="danger" icon="⚠️" />
          </div>
          <FeeProductCatalog products={feeProducts ?? []} canManage={canManage} />
          <ConsultancyFeeList rows={rows} feeProducts={feeProducts ?? []} canManage={canManage} isSuperAdmin={isSuperAdmin} />
        </div>
      </details>
    </div>
  );
}
