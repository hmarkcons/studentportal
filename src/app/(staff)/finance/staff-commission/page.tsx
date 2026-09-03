import { createClient } from "@/lib/supabase/server";
import { computeInvoiceStatus } from "@/lib/invoiceStatus";
import { StaffCommissionTable, type CommissionRow } from "./StaffCommissionTable";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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
    .select(
      "id, amount, currency, status, payment_method, registration_date, payment_proof_path, staff_id, student_id, shared_with_staff_id, staff:staff(full_name), student:leads(full_name, email, registered_at, registration_status), shared_with:staff!staff_commissions_shared_with_staff_id_fkey(full_name)"
    )
    .order("registration_date", { ascending: false });

  // Which paid commissions have already been carried forward as a credit —
  // hides the "No admission - carry forward" button on those (the DB's
  // unique constraint on source_commission_id would reject a second one
  // anyway; this just keeps the UI from offering it twice).
  const commissionIds = (commissions ?? []).map((c) => c.id);
  const { data: existingCredits } = commissionIds.length
    ? await supabase.from("staff_commission_credits").select("source_commission_id").in("source_commission_id", commissionIds)
    : { data: [] };
  const creditedCommissionIds = new Set((existingCredits ?? []).map((c) => c.source_commission_id));

  // Credits currently available to apply against a NEW commission, per staff.
  const { data: availableCredits } = await supabase
    .from("staff_commission_credits")
    .select("id, staff_id, amount, currency")
    .eq("status", "available");

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

  // One representative application per student (finalized one wins, else the
  // earliest) — used for the University/Program/Intake columns. A student
  // can have several applications; this table shows one row per commission
  // record, not per application, so we pick the most meaningful single one
  // rather than duplicating rows.
  const { data: rawApplications } = studentIds.length
    ? await supabase
        .from("applications")
        .select("student_id, intake, is_finalized, created_at, university:universities(name), program:programs(name)")
        .in("student_id", studentIds)
        .order("created_at", { ascending: true })
    : { data: [] };

  type AppRow = {
    student_id: string;
    intake: string | null;
    is_finalized: boolean;
    universityName: string | null;
    programName: string | null;
  };
  const primaryAppByStudent = new Map<string, AppRow>();
  for (const a of rawApplications ?? []) {
    const mapped: AppRow = {
      student_id: a.student_id,
      intake: a.intake,
      is_finalized: a.is_finalized,
      universityName: (one(a.university as never) as { name?: string } | null)?.name ?? null,
      programName: (one(a.program as never) as { name?: string } | null)?.name ?? null,
    };
    const existing = primaryAppByStudent.get(a.student_id);
    if (!existing || (mapped.is_finalized && !existing.is_finalized)) {
      primaryAppByStudent.set(a.student_id, mapped);
    }
  }

  // Real refund-request counts per student (not fabricated) — feeds the
  // "Refunds" stat card, scoped to whichever rows are currently filtered.
  const { data: refundRows } = studentIds.length
    ? await supabase.from("refund_requests").select("student_id").in("student_id", studentIds)
    : { data: [] };
  const refundCountByStudent = new Map<string, number>();
  for (const r of refundRows ?? []) {
    refundCountByStudent.set(r.student_id, (refundCountByStudent.get(r.student_id) ?? 0) + 1);
  }

  const rows: CommissionRow[] = (commissions ?? []).map((c) => {
    const latestInvoice = latestInvoiceByStudent.get(c.student_id);
    const invInstallments = latestInvoice ? (installments ?? []).filter((i) => i.invoice_id === latestInvoice.id) : [];
    const student = one(c.student);
    const primaryApp = primaryAppByStudent.get(c.student_id);
    const registeredAt = student?.registered_at ? new Date(student.registered_at) : null;
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
      studentName: student?.full_name ?? "Unknown",
      studentEmail: student?.email ?? null,
      registeredMonth: registeredAt ? `${MONTH_NAMES[registeredAt.getMonth()]} ${registeredAt.getFullYear()}` : null,
      registrationStatus: student?.registration_status ?? null,
      universityName: primaryApp?.universityName ?? null,
      programName: primaryApp?.programName ?? null,
      intake: primaryApp?.intake ?? null,
      refundCount: refundCountByStudent.get(c.student_id) ?? 0,
      consultancyFeeStatus: latestInvoice ? computeInvoiceStatus(latestInvoice.admin_fee_status, invInstallments) : null,
      adminFeeStatus: (latestInvoice?.admin_fee_status as "paid" | "unpaid" | undefined) ?? null,
      hasCredit: creditedCommissionIds.has(c.id),
      sharedWithName: (one(c.shared_with as never) as { full_name?: string } | null)?.full_name ?? null,
    };
  });

  const { data: staffList } = await supabase
    .from("staff")
    .select("id, full_name, role, currency, commission_rate_general, commission_rate_public_universities, commission_type_general, commission_type_public_universities")
    .order("full_name");
  const { data: students } = await supabase.from("students").select("id, full_name, assigned_counselor_id").order("full_name");

  // Suggested-commission data: each student's SIGNED agreement (if any),
  // resolved to the same discount-adjusted consultancy fee the invoice form
  // already uses, plus the destination's track (public/private) so the "Add
  // commission" form can pick the matching staff commission rate.
  const allStudentIds = (students ?? []).map((s) => s.id);
  const { data: signedAgreements } = allStudentIds.length
    ? await supabase
        .from("agreements")
        .select(
          "student_id, discount_amount, consultancy_fee_override, created_at, template:agreement_templates(destination:destinations(track, consultancy_fee, consultancy_fee_currency))"
        )
        .eq("status", "signed")
        .in("student_id", allStudentIds)
    : { data: [] };

  type StudentCommissionBasis = { track: string | null; consultancyFee: number | null; currency: string | null };
  const commissionBasisByStudent = new Map<string, StudentCommissionBasis>();
  for (const a of signedAgreements ?? []) {
    const template = one(a.template as never) as { destination?: unknown } | null;
    const destination = template?.destination
      ? (one(template.destination as never) as { track?: string; consultancy_fee?: number; consultancy_fee_currency?: string } | null)
      : null;
    if (!destination) continue;
    const consultancyFee = (a.consultancy_fee_override ?? destination.consultancy_fee ?? 0) - (a.discount_amount ?? 0);
    // A student could have more than one signed agreement in theory — last one wins.
    commissionBasisByStudent.set(a.student_id, {
      track: destination.track ?? null,
      consultancyFee,
      currency: destination.consultancy_fee_currency ?? null,
    });
  }
  const studentCommissionBasis = Object.fromEntries(commissionBasisByStudent);

  return (
    <div className="w-full">
      <h2 className="text-lg font-semibold text-ink">Staff Commission</h2>
      <p className="mb-4 text-sm text-muted">
        Commission owed to staff for each registered student, alongside that student&apos;s consultancy and administrative fee status.
      </p>
      <StaffCommissionTable
        rows={rows}
        staffList={staffList ?? []}
        students={students ?? []}
        proofUrls={proofUrls}
        availableCredits={availableCredits ?? []}
        studentCommissionBasis={studentCommissionBasis}
      />
    </div>
  );
}
