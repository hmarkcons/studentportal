import { createClient } from "@/lib/supabase/server";
import { computeInvoiceStatus } from "@/lib/invoiceStatus";
import { StaffCommissionTable, type CommissionRow } from "./StaffCommissionTable";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function StaffCommissionPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
  const allowed = staffRow?.role === "super_admin" || staffRow?.role === "finance";

  if (!allowed) {
    return (
      <div className="w-full">
        <h2 className="text-lg font-semibold text-ink">Staff Commission</h2>
        <p className="mt-2 text-sm text-muted">This page is only accessible to Super Admin and Accounts &amp; Finance.</p>
      </div>
    );
  }

  const { data: commissions } = await supabase
    .from("staff_commissions")
    .select("id, amount, currency, status, payment_method, registration_date, payment_proof_path, staff_id, student_id, staff:staff(full_name), student:leads(full_name)")
    .order("registration_date", { ascending: false });

  const proofUrls: Record<string, string> = {};
  await Promise.all(
    (commissions ?? [])
      .filter((c) => c.payment_proof_path)
      .map(async (c) => {
        const { data } = await supabase.storage.from("documents").createSignedUrl(c.payment_proof_path!, 3600);
        if (data?.signedUrl) proofUrls[c.id] = data.signedUrl;
      })
  );

  const studentIds = Array.from(new Set((commissions ?? []).map((c) => c.student_id)));
  const { data: invoices } = studentIds.length
    ? await supabase.from("invoices").select("id, student_id, admin_fee_status, created_at").in("student_id", studentIds)
    : { data: [] };

  const invoiceIds = (invoices ?? []).map((i) => i.id);
  const { data: installments } = invoiceIds.length
    ? await supabase.from("invoice_installments").select("invoice_id, status, due_date").in("invoice_id", invoiceIds)
    : { data: [] };

  // Most recent invoice per student, used for the fee-status columns.
  type InvoiceRow = { id: string; student_id: string; admin_fee_status: string; created_at: string };
  const latestInvoiceByStudent = new Map<string, InvoiceRow>();
  for (const inv of (invoices ?? []) as InvoiceRow[]) {
    const existing = latestInvoiceByStudent.get(inv.student_id);
    if (!existing || new Date(inv.created_at) > new Date(existing.created_at)) {
      latestInvoiceByStudent.set(inv.student_id, inv);
    }
  }

  const rows: CommissionRow[] = (commissions ?? []).map((c) => {
    const latestInvoice = latestInvoiceByStudent.get(c.student_id);
    const invInstallments = latestInvoice ? (installments ?? []).filter((i) => i.invoice_id === latestInvoice.id) : [];
    return {
      id: c.id,
      amount: c.amount,
      currency: c.currency,
      status: c.status,
      payment_method: c.payment_method,
      registration_date: c.registration_date,
      payment_proof_path: c.payment_proof_path,
      staffId: c.staff_id,
      staffName: one(c.staff)?.full_name ?? "Unknown",
      studentName: one(c.student)?.full_name ?? "Unknown",
      consultancyFeeStatus: latestInvoice ? computeInvoiceStatus(latestInvoice.admin_fee_status, invInstallments) : null,
      adminFeeStatus: (latestInvoice?.admin_fee_status as "paid" | "unpaid" | undefined) ?? null,
    };
  });

  const { data: staffList } = await supabase.from("staff").select("id, full_name").order("full_name");
  const { data: students } = await supabase.from("students").select("id, full_name").order("full_name");

  return (
    <div className="w-full">
      <h2 className="text-lg font-semibold text-ink">Staff Commission</h2>
      <p className="mb-4 text-sm text-muted">
        Commission owed to staff for each registered student, alongside that student&apos;s consultancy and administrative fee status.
      </p>
      <StaffCommissionTable rows={rows} staffList={staffList ?? []} students={students ?? []} proofUrls={proofUrls} />
    </div>
  );
}
