import { CircleCheck, Hourglass, TriangleAlert } from "lucide-react";
import { documentUrls } from "@/lib/storageUrls";
import { readAllIn } from "@/lib/catalogueReads";
import type { CellReceipt } from "@/components/PaymentReceipts";
import { StatCard } from "@/components/ui/StatCard";
import { computeInvoiceStatus } from "@/lib/invoiceStatus";
import { computeInvoiceMath, computePaymentProgress, sumLineItems } from "@/lib/invoiceMath";
import { getEffectivePermissions } from "@/lib/auth/permissions";
import { hasRole } from "@/lib/auth/roles";
import { getStaffSession } from "@/lib/auth/session";
import { FeeProductCatalog } from "./FeeProductCatalog";
import { ConsultancyFeeList } from "./ConsultancyFeeList";
import { ConsultancyFeeOverview, type FeeRow, type FeeStatus } from "./ConsultancyFeeOverview";
import { loadLatestPkrRate } from "@/lib/pkrRates";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function ConsultancyFeePage() {
  // The staff row the layout has already asked for, and the permissions, at once.
  const [{ supabase, staff: staffRow }, perms] = await Promise.all([getStaffSession(), getEffectivePermissions()]);
  // Every role this person holds, not only the primary one: somebody who is a
  // counsellor first and on the accounts team as well was turned away here.
  const isSuperAdmin = hasRole(staffRow, "super_admin");
  const canView = hasRole(staffRow, "super_admin", "finance");
  // Read from the permission system rather than hardcoding the role. These
  // records are the accounts team's to manage as well as Super Admin's, which
  // is exactly what finance.invoices.manage already grants by default
  // (migration 0094) — and it stays adjustable in Admin > Role Permissions
  // instead of being fixed here.
  const canManage = perms["finance.invoices.manage"] === true;

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

  // Two waves where there were nine: everything that needs nothing, then
  // everything that needs the invoices.
  const [{ data: invoices }, { data: feeProducts }, { data: regStudents }, { data: counselors }] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        `id, student_id, admin_charge, consultancy_fee, currency, sent_status, pdf_path, invoice_number, intake, terms,
         discount_amount, discount_reason, tax_rate, tax_amount, tax_base, issued_on,
         admin_fee_status, admin_fee_paid_date, admin_fee_payment_method, service_type, pkr_per_eur,
         student:leads(full_name, registered_at)`
      )
      .order("created_at", { ascending: false }),
    supabase.from("fee_products").select("id, name, default_amount, default_currency").order("name"),
    // Per-student payment position for the filterable overview. Driven from
    // the registered-student list rather than from invoices, so a student who
    // has never been invoiced still shows up as owing everything instead of
    // being silently absent from the finance view.
    supabase
      .from("students")
      .select("id, full_name, country_of_interest, intake, level_applying_for, registration_status, assigned_counselor_id")
      .order("registered_at", { ascending: false }),
    supabase.from("staff").select("id, full_name"),
  ]);

  const invoiceIds = (invoices ?? []).map((i) => i.id);
  const [{ data: installments }, { data: lineItems }, { data: adminCharges }, pdfByPath] = await Promise.all([
    invoiceIds.length ? supabase.from("invoice_installments").select("*, receipts:payment_receipts(count)").eq("receipts.is_current", true).in("invoice_id", invoiceIds) : Promise.resolve({ data: [] }),
    invoiceIds.length
      ? supabase.from("invoice_line_items").select("id, invoice_id, name, description, amount").in("invoice_id", invoiceIds)
      : Promise.resolve({ data: [] }),
    invoiceIds.length
      ? supabase
          .from("invoice_admin_charges")
          .select("id, invoice_id, destination_id, country_label, amount, is_backup")
          .in("invoice_id", invoiceIds)
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [] }),
    // Every invoice PDF in one request. This page lists every invoice on file,
    // so it was one round trip per invoice before the page could render.
    documentUrls(supabase, (invoices ?? []).map((i) => i.pdf_path)),
  ]);
  const pdfUrls = new Map<string, string>();
  for (const i of invoices ?? []) {
    const url = i.pdf_path ? pdfByPath.get(i.pdf_path) : undefined;
    if (url) pdfUrls.set(i.id, url);
  }

  const rows = (invoices ?? []).map((inv) => {
    const student = one(inv.student as never) as { full_name?: string; registered_at?: string } | null;
    return {
      invoice: inv,
      installments: (installments ?? []).filter((i) => i.invoice_id === inv.id),
      lineItems: (lineItems ?? []).filter((li) => li.invoice_id === inv.id),
      adminCharges: (adminCharges ?? []).filter((c) => c.invoice_id === inv.id),
      studentId: inv.student_id,
      studentName: student?.full_name ?? "Unknown",
      registeredAt: student?.registered_at ?? null,
      pdfUrl: pdfUrls.get(inv.id),
    };
  });

  const counselorName = new Map((counselors ?? []).map((c) => [c.id, c.full_name]));

  // Each instalment's current receipts, for its column in the overview — read
  // only for someone who may handle them, whom RLS would refuse anyway, and
  // signed in one request.
  type ReceiptRow = { id: string; installment_id: string; file_name: string; path: string };
  const instalmentIds = (installments ?? []).map((i) => i.id as string);
  const currentReceipts =
    canManage && instalmentIds.length > 0
      ? await readAllIn(instalmentIds, (chunk, from, to) =>
          supabase
            .from("payment_receipts")
            .select("id, installment_id, file_name, path")
            .eq("is_current", true)
            .in("installment_id", chunk)
            .order("uploaded_at")
            .order("id")
            .range(from, to)
            .returns<ReceiptRow[]>()
        )
      : [];
  const receiptUrls = await documentUrls(supabase, currentReceipts.map((r) => r.path));
  const receiptsByInstalment = new Map<string, CellReceipt[]>();
  for (const r of currentReceipts) {
    const list = receiptsByInstalment.get(r.installment_id) ?? [];
    list.push({ id: r.id, fileName: r.file_name, url: receiptUrls.get(r.path) ?? null });
    receiptsByInstalment.set(r.installment_id, list);
  }

  const invoiceByStudent = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!invoiceByStudent.has(r.studentId)) invoiceByStudent.set(r.studentId, r);

  const today = new Date().toISOString().slice(0, 10);

  const feeRows: FeeRow[] = (regStudents ?? []).map((s) => {
    const r = invoiceByStudent.get(s.id);
    const inv = r?.invoice;
    const insts = r?.installments ?? [];
    const adminCharge = Number(inv?.admin_charge ?? 0);
    // The admin charge is collected with installment 1, so its settlement is
    // that installment being paid rather than a flag of its own.
    const adminFeePaid = insts.find((i) => i.installment_no === 1)?.status === "paid";

    const math = inv
      ? computeInvoiceMath({
          consultancyFee: Number(inv.consultancy_fee ?? 0),
          adminCharge,
          discountAmount: Number(inv.discount_amount ?? 0),
          taxRate: Number(inv.tax_rate ?? 0),
          taxBase: (inv.tax_base as "services" | "total" | null) ?? "services",
          // Added items count towards what the student owes here as
          // everywhere else; the overview used to leave them out.
          extras: sumLineItems(r?.lineItems),
        })
      : null;

    const progress = computePaymentProgress(insts);
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
      instalments: [...insts]
        .sort((a, b) => a.installment_no - b.installment_no)
        .map((i) => ({
          id: i.id as string,
          no: i.installment_no as number,
          amount: Number(i.amount ?? 0),
          amountPaid: Number(i.amount_paid ?? 0),
          status: i.status as string,
          dueDate: (i.due_date as string | null) ?? null,
          paidDate: (i.paid_date as string | null) ?? null,
          receipts: receiptsByInstalment.get(i.id as string) ?? [],
        })),
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
    const status = computeInvoiceStatus(r.installments);
    counts[status]++;
  }

  return (
    <div className="w-full">
      <h2 className="text-lg font-semibold text-ink">Consultancy Fee</h2>
      <p className="mb-4 text-sm text-muted">
        Consultancy fee and administrative fee payments across every registered student — installments, payment mode, status, and invoicing.
      </p>

      <ConsultancyFeeOverview rows={feeRows} canManage={canManage} isSuperAdmin={isSuperAdmin} />

      {/* Per-invoice management kept behind a disclosure: the overview above is
          what this page is for, and the invoice-by-invoice controls are only
          needed when actually correcting a record. */}
      <details className="mb-6">
        <summary className="cursor-pointer text-sm font-medium text-ink">
          Per-invoice detail and payment records ({rows.length} invoice{rows.length === 1 ? "" : "s"})
        </summary>
        <div className="mt-3">
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Invoices paid" value={counts.paid} tone="success" icon={CircleCheck} />
            <StatCard label="Invoices pending" value={counts.pending} tone="warning" icon={Hourglass} />
            <StatCard label="Invoices overdue" value={counts.overdue} tone="danger" icon={TriangleAlert} />
          </div>
          <FeeProductCatalog products={feeProducts ?? []} canManage={canManage} />
          <ConsultancyFeeList
            rows={rows}
            feeProducts={feeProducts ?? []}
            canManage={canManage}
            isSuperAdmin={isSuperAdmin}
            latestPkrRate={canManage ? await loadLatestPkrRate(supabase) : null}
          />
        </div>
      </details>
    </div>
  );
}
