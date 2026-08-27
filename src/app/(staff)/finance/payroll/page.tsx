import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { CURRENCY_SYMBOLS } from "@/lib/constants";
import { PayrollSelectors } from "./PayrollSelectors";
import { PayrollForm } from "./PayrollForm";

const PKR_RATE: Record<string, number> = { PKR: 1, USD: 280, EUR: 335 };

function toPKR(amount: number, currency: string) {
  return amount * (PKR_RATE[currency] ?? 1);
}

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

  const now = new Date();
  const month = monthParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthStart = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const nextMonthStart = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);

  const { data: staffList } = await supabase.from("staff").select("id, full_name").order("full_name");

  let panel: React.ReactNode = null;

  if (staffId) {
    const { data: staff } = await supabase
      .from("staff")
      .select(
        "id, full_name, designation, monthly_salary, currency, allowance, commission_rate_general, commission_rate_public_universities, monthly_target"
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

      const generalRate = staff.commission_rate_general ?? 0;
      const publicRate = staff.commission_rate_public_universities ?? 0;

      let totalConsultancyFeePKR = 0;
      let computedCommission = 0;
      for (const inv of invoices ?? []) {
        const feePKR = toPKR(inv.consultancy_fee ?? 0, inv.currency ?? "PKR");
        totalConsultancyFeePKR += feePKR;
        const agreement = one(inv.agreement as never) as { template?: unknown } | null;
        const template = agreement?.template ? (one(agreement.template as never) as { destination?: unknown } | null) : null;
        const destination = template?.destination ? (one(template.destination as never) as { track?: string } | null) : null;
        const rate = destination?.track === "public" ? publicRate : generalRate;
        computedCommission += feePKR * (rate / 100);
      }

      const { data: existingPayroll } = await supabase
        .from("staff_payroll")
        .select("*")
        .eq("staff_id", staffId)
        .eq("payroll_month", monthStart)
        .maybeSingle();

      const currencySymbol = CURRENCY_SYMBOLS[staff.currency] ?? staff.currency;
      const revalidateTo = `/finance/payroll?staff=${staffId}&month=${month}`;

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
            <p className="text-lg font-semibold text-ink">
              Generated business amount: ₨ {totalConsultancyFeePKR.toLocaleString()}
            </p>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <h3 className="mb-3 text-sm font-semibold text-ink">Payroll Summary</h3>
              <PayrollForm
                staffId={staffId}
                payrollMonth={monthStart}
                revalidateTo={revalidateTo}
                currencySymbol={currencySymbol}
                initial={{
                  basic_salary: existingPayroll?.basic_salary ?? staff.monthly_salary ?? 0,
                  allowances: existingPayroll?.allowances ?? staff.allowance ?? 0,
                  total_commission: existingPayroll?.total_commission ?? Math.round(computedCommission * 100) / 100,
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
                  <span className="text-muted">General Commission Rate</span>
                  <span className="text-ink">{staff.commission_rate_general != null ? `${staff.commission_rate_general}%` : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Public University Commission Rate</span>
                  <span className="text-ink">
                    {staff.commission_rate_public_universities != null ? `${staff.commission_rate_public_universities}%` : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Students registered</span>
                  <span className="text-ink">
                    {studentIds.length}/{staff.monthly_target ?? "—"}
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
