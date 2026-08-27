import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/ui/StatCard";
import { computeInvoiceStatus } from "@/lib/invoiceStatus";
import { FeeProductCatalog } from "./FeeProductCatalog";
import { ConsultancyFeeList } from "./ConsultancyFeeList";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function ConsultancyFeePage() {
  const supabase = await createClient();

  const { data: invoices } = await supabase
    .from("invoices")
    .select(
      `id, student_id, admin_charge, consultancy_fee, currency, sent_status, pdf_path, invoice_number, intake, terms,
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

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Paid" value={counts.paid} tone="success" icon="✅" />
        <StatCard label="Pending" value={counts.pending} tone="warning" icon="⏳" />
        <StatCard label="Overdue" value={counts.overdue} tone="danger" icon="⚠️" />
      </div>

      <FeeProductCatalog products={feeProducts ?? []} />

      <ConsultancyFeeList rows={rows} feeProducts={feeProducts ?? []} />
    </div>
  );
}
