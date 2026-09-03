import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CURRENCY_SYMBOLS, toPKR } from "@/lib/constants";
import { PayrollSelectors } from "./PayrollSelectors";
import { PayrollForm } from "./PayrollForm";
import { CommissionLedgerTable, type CommissionRecord } from "./CommissionLedgerTable";
import type { CommissionStaffOption } from "@/app/(staff)/finance/staff-commission/StaffCommissionTable";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export default async function StaffPayrollPage(props: { searchParams: Promise<{ staff?: string; month?: string }> }) {
  const { staff: staffId = "", month: monthParam } = await props.searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: viewerRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
  const canManage = viewerRow?.role === "finance" || viewerRow?.role === "super_admin";

  const now = new Date();
  const month = monthParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthStart = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const nextMonthStart = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);

  const { data: staffList } = await supabase
    .from("staff")
    .select("id, full_name, role, currency, commission_rate_general, commission_rate_public_universities, commission_type_general, commission_type_public_universities")
    .order("full_name");

  let panel: React.ReactNode = null;

  if (staffId) {
    const { data: staff } = await supabase
      .from("staff")
      .select(
        "id, full_name, role, designation, monthly_salary, currency, allowance, commission_rate_general, commission_rate_public_universities, commission_type_general, commission_type_public_universities, monthly_target, bonus_eligible, bonus_rate_percent"
      )
      .eq("id", staffId)
      .maybeSingle();

    if (staff) {
      const { data: registeredStudents } = await supabase
        .from("leads")
        .select("id")
        .eq("assigned_counselor_id", staffId)
        .gte("registered_at", monthStart)
        .lt("registered_at", nextMonthStart);

      const studentIds = (registeredStudents ?? []).map((s) => s.id);

      const { data: invoices } = studentIds.length
        ? await supabase
            .from("invoices")
            .select(
              "id, consultancy_fee, currency, agreement:agreements(template:agreement_templates(destination:destinations(track)))"
            )
            .in("student_id", studentIds)
        : { data: [] };

      let totalConsultancyFeePKR = 0;
      for (const inv of invoices ?? []) {
        totalConsultancyFeePKR += toPKR(inv.consultancy_fee ?? 0, inv.currency ?? "PKR");
      }

      const { data: existingPayroll } = await supabase
        .from("staff_payroll")
        .select("*")
        .eq("staff_id", staffId)
        .eq("payroll_month", monthStart)
        .maybeSingle();

      // Folded-in commission ledger (per-student amount, tracked/paid manually
      // by Finance) — this, not the invoice-derived figure, is the source of
      // truth for Total Commission.
      const { data: rawCommissions } = await supabase
        .from("staff_commissions")
        .select(
          "id, amount, currency, status, registration_date, payment_proof_path, student:leads(full_name), shared_with:staff!staff_commissions_shared_with_staff_id_fkey(full_name)"
        )
        .eq("staff_id", staffId)
        .gte("registration_date", monthStart)
        .lt("registration_date", nextMonthStart)
        .order("registration_date", { ascending: false });

      const proofUrls: Record<string, string> = {};
      await Promise.all(
        (rawCommissions ?? [])
          .filter((c) => c.payment_proof_path)
          .map(async (c) => {
            const { data } = await supabase.storage.from("documents").createSignedUrl(c.payment_proof_path!, 3600);
            if (data?.signedUrl) proofUrls[c.id] = data.signedUrl;
          })
      );

      const commissionRecords: CommissionRecord[] = (rawCommissions ?? []).map((c) => ({
        id: c.id,
        amount: c.amount,
        currency: c.currency,
        status: c.status,
        registration_date: c.registration_date,
        payment_proof_path: c.payment_proof_path,
        student_name: (one(c.student as never) as { full_name?: string } | null)?.full_name ?? "Unknown",
        shared_with_name: (one(c.shared_with as never) as { full_name?: string } | null)?.full_name ?? null,
      }));

      const totalCommissionFromLedger = commissionRecords.reduce((sum, c) => sum + toPKR(c.amount, c.currency), 0);

      // Monthly bonus: a bonus-eligible staff member who reaches their
      // monthly_target (registrations this month) gets their WHOLE month's
      // earned commission boosted by their chosen increment — not applied
      // per commission record, since "reaching the monthly target" is only
      // knowable once the whole month's registrations are counted.
      const targetReached = staff.monthly_target != null && studentIds.length >= staff.monthly_target;
      const bonusApplies = staff.bonus_eligible && staff.bonus_rate_percent != null && targetReached;
      const bonusMultiplier = bonusApplies ? 1 + (staff.bonus_rate_percent as number) / 100 : 1;
      const totalCommissionWithBonus = Math.round(totalCommissionFromLedger * bonusMultiplier * 100) / 100;

      const { data: allStudents } = await supabase.from("students").select("id, full_name").order("full_name");

      // Same discount-adjusted commission-suggestion basis as the Staff
      // Commission page's own "Add commission" form — each student's SIGNED
      // agreement, resolved to consultancy fee net of discount plus the
      // destination's track, so this staff member's matching commission rate
      // (public-university vs general) can be suggested here too.
      const allStudentIds = (allStudents ?? []).map((s) => s.id);
      const { data: signedAgreements } = allStudentIds.length
        ? await supabase
            .from("agreements")
            .select(
              "student_id, discount_amount, consultancy_fee_override, template:agreement_templates(destination:destinations(track, consultancy_fee, consultancy_fee_currency))"
            )
            .eq("status", "signed")
            .in("student_id", allStudentIds)
        : { data: [] };

      const commissionBasisByStudent: Record<string, { track: string | null; consultancyFee: number | null; currency: string | null }> = {};
      for (const a of signedAgreements ?? []) {
        const template = one(a.template as never) as { destination?: unknown } | null;
        const destination = template?.destination
          ? (one(template.destination as never) as { track?: string; consultancy_fee?: number; consultancy_fee_currency?: string } | null)
          : null;
        if (!destination) continue;
        const consultancyFee = (a.consultancy_fee_override ?? destination.consultancy_fee ?? 0) - (a.discount_amount ?? 0);
        commissionBasisByStudent[a.student_id] = {
          track: destination.track ?? null,
          consultancyFee,
          currency: destination.consultancy_fee_currency ?? null,
        };
      }

      const currencySymbol = CURRENCY_SYMBOLS[staff.currency] ?? staff.currency;
      const revalidateTo = `/finance/payroll?staff=${staffId}&month=${month}`;

      const currentStaffOption: CommissionStaffOption = {
        id: staff.id,
        full_name: staff.full_name,
        role: staff.role,
        currency: staff.currency,
        commission_rate_general: staff.commission_rate_general,
        commission_rate_public_universities: staff.commission_rate_public_universities,
        commission_type_general: staff.commission_type_general,
        commission_type_public_universities: staff.commission_type_public_universities,
      };
      const shareableStaffOptions: CommissionStaffOption[] = (staffList ?? []).filter((s) => s.id !== staffId && s.role !== "super_admin");

      panel = (
        <>
          <Card className="mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-ink">
                  {initials(staff.full_name)}
                </div>
                <div>
                  <p className="font-semibold text-ink">{staff.full_name}</p>
                  <p className="text-sm text-muted">{staff.designation ?? "—"}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted">Monthly Target: <span className="font-medium text-ink">{staff.monthly_target ?? "—"}</span></p>
                <p className="text-sm text-muted">
                  Registrations this month: <span className="font-medium text-ink">{studentIds.length}</span>
                </p>
              </div>
            </div>
          </Card>

          <Card className="mb-6">
            <h3 className="text-sm font-semibold text-ink">Student Commission Breakdown</h3>
            <p className="mb-2 text-sm text-muted">
              {invoices?.length ?? 0} fee record{(invoices?.length ?? 0) === 1 ? "" : "s"} registered in selected month under {staff.full_name}
            </p>
            <p className="mb-4 text-lg font-semibold text-ink">
              Generated business amount: ₨ {totalConsultancyFeePKR.toLocaleString()}
            </p>
            <CommissionLedgerTable
              currentStaff={currentStaffOption}
              shareableStaff={shareableStaffOptions}
              records={commissionRecords}
              students={allStudents ?? []}
              proofUrls={proofUrls}
              defaultDate={monthStart}
              revalidateTo={revalidateTo}
              canManage={canManage}
              studentCommissionBasis={commissionBasisByStudent}
            />
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink">Payroll Summary</h3>
                {staff.bonus_eligible && (
                  <Badge tone={bonusApplies ? "success" : "neutral"}>
                    {bonusApplies
                      ? `🎉 +${staff.bonus_rate_percent}% bonus applied`
                      : `Bonus eligible (+${staff.bonus_rate_percent ?? "—"}% at ${staff.monthly_target ?? "—"} registrations)`}
                  </Badge>
                )}
              </div>
              <PayrollForm
                staffId={staffId}
                payrollMonth={monthStart}
                revalidateTo={revalidateTo}
                currency={staff.currency}
                currencySymbol={currencySymbol}
                canManage={canManage}
                initial={{
                  basic_salary: existingPayroll?.basic_salary ?? staff.monthly_salary ?? 0,
                  allowances: existingPayroll?.allowances ?? staff.allowance ?? 0,
                  total_commission: existingPayroll?.total_commission ?? totalCommissionWithBonus,
                  overtime: existingPayroll?.overtime ?? 0,
                  deduction_absent: existingPayroll?.deduction_absent ?? 0,
                  deduction_late: existingPayroll?.deduction_late ?? 0,
                  deduction_other: existingPayroll?.deduction_other ?? 0,
                  tax: existingPayroll?.tax ?? 0,
                  payment_status: existingPayroll?.payment_status ?? "pending",
                }}
              />
            </Card>

            <Card>
              <h3 className="mb-3 text-sm font-semibold text-ink">Commission Rate Reference</h3>
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Private Universities</span>
                  <span className="text-ink">
                    {staff.commission_rate_general != null
                      ? staff.commission_type_general === "flat"
                        ? `${currencySymbol} ${staff.commission_rate_general} flat`
                        : `${staff.commission_rate_general}%`
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Public Universities</span>
                  <span className="text-ink">
                    {staff.commission_rate_public_universities != null
                      ? staff.commission_type_public_universities === "flat"
                        ? `${currencySymbol} ${staff.commission_rate_public_universities} flat`
                        : `${staff.commission_rate_public_universities}%`
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Students registered</span>
                  <span className={targetReached ? "font-medium text-success" : "text-ink"}>
                    {studentIds.length}/{staff.monthly_target ?? "—"}
                    {targetReached && " ✓ target reached"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Total Consultancy Fees (PKR)</span>
                  <span className="text-ink">₨ {totalConsultancyFeePKR.toLocaleString()}</span>
                </div>
              </div>
            </Card>
          </div>
        </>
      );
    }
  }

  return (
    <div className="w-full">
      <h2 className="text-lg font-semibold text-ink">Payroll - Staff</h2>
      <p className="mb-4 text-sm text-muted">Per-staff payroll breakdown including student commissions, salary, and deductions.</p>

      <PayrollSelectors staffList={staffList ?? []} selectedStaffId={staffId} month={month} />

      {staffId ? panel : <p className="text-sm text-muted">Choose a staff member to view their payroll.</p>}
    </div>
  );
}
