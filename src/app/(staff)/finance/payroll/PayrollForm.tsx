"use client";

import { useActionState, useMemo, useState } from "react";
import { upsertStaffPayroll } from "@/lib/actions/finance";

const inputClass = "w-32 rounded-md border border-border bg-card px-2 py-1 text-right text-sm";
const rowClass = "flex items-center justify-between py-1.5 text-sm";

export function PayrollForm({
  staffId,
  payrollMonth,
  revalidateTo,
  currencySymbol,
  initial,
}: {
  staffId: string;
  payrollMonth: string;
  revalidateTo: string;
  currencySymbol: string;
  initial: {
    basic_salary: number;
    allowances: number;
    total_commission: number;
    overtime: number;
    deduction_absent: number;
    deduction_late: number;
    deduction_other: number;
    tax: number;
    payment_status: string;
  };
}) {
  const action = upsertStaffPayroll.bind(null, staffId, payrollMonth, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);

  const [basicSalary, setBasicSalary] = useState(initial.basic_salary);
  const [allowances, setAllowances] = useState(initial.allowances);
  const [totalCommission, setTotalCommission] = useState(initial.total_commission);
  const [overtime, setOvertime] = useState(initial.overtime);
  const [deductionAbsent, setDeductionAbsent] = useState(initial.deduction_absent);
  const [deductionLate, setDeductionLate] = useState(initial.deduction_late);
  const [deductionOther, setDeductionOther] = useState(initial.deduction_other);
  const [tax, setTax] = useState(initial.tax);

  const grossTotal = useMemo(
    () => basicSalary + allowances + totalCommission + overtime,
    [basicSalary, allowances, totalCommission, overtime]
  );
  const netPay = useMemo(
    () => grossTotal - deductionAbsent - deductionLate - deductionOther - tax,
    [grossTotal, deductionAbsent, deductionLate, deductionOther, tax]
  );

  return (
    <form action={formAction} className="flex flex-col">
      <div className={rowClass}>
        <label className="text-ink">Basic Salary ({currencySymbol})</label>
        <input
          name="basic_salary"
          type="number"
          step="0.01"
          value={basicSalary}
          onChange={(e) => setBasicSalary(Number(e.target.value) || 0)}
          className={inputClass}
        />
      </div>
      <div className={rowClass}>
        <label className="text-ink">Allowances ({currencySymbol})</label>
        <input
          name="allowances"
          type="number"
          step="0.01"
          value={allowances}
          onChange={(e) => setAllowances(Number(e.target.value) || 0)}
          className={inputClass}
        />
      </div>
      <div className={rowClass}>
        <label className="text-ink">Total Commission (PKR)</label>
        <input
          name="total_commission"
          type="number"
          step="0.01"
          value={totalCommission}
          onChange={(e) => setTotalCommission(Number(e.target.value) || 0)}
          className={inputClass}
        />
      </div>
      <div className={rowClass}>
        <label className="text-ink">Overtime ({currencySymbol})</label>
        <input name="overtime" type="number" step="0.01" value={overtime} onChange={(e) => setOvertime(Number(e.target.value) || 0)} className={inputClass} />
      </div>

      <hr className="my-3 border-border" />

      <div className={`${rowClass} font-semibold`}>
        <span className="text-ink">Gross Total</span>
        <span className="text-ink">{grossTotal.toLocaleString()}</span>
      </div>

      <div className="py-1.5 text-sm">
        <p className="mb-1 text-ink">Deduction (Absent / Late / Other)</p>
        <div className="flex items-center gap-2">
          <input
            name="deduction_absent"
            type="number"
            step="0.01"
            placeholder="Absent"
            value={deductionAbsent}
            onChange={(e) => setDeductionAbsent(Number(e.target.value) || 0)}
            className="w-full rounded-md border border-border bg-card px-2 py-1 text-sm"
          />
          <input
            name="deduction_late"
            type="number"
            step="0.01"
            placeholder="Late"
            value={deductionLate}
            onChange={(e) => setDeductionLate(Number(e.target.value) || 0)}
            className="w-full rounded-md border border-border bg-card px-2 py-1 text-sm"
          />
          <input
            name="deduction_other"
            type="number"
            step="0.01"
            placeholder="Other"
            value={deductionOther}
            onChange={(e) => setDeductionOther(Number(e.target.value) || 0)}
            className="w-full rounded-md border border-border bg-card px-2 py-1 text-sm"
          />
        </div>
      </div>

      <div className={rowClass}>
        <label className="text-ink">Tax ({currencySymbol})</label>
        <input name="tax" type="number" step="0.01" value={tax} onChange={(e) => setTax(Number(e.target.value) || 0)} className={inputClass} />
      </div>

      <hr className="my-3 border-border" />

      <div className={`${rowClass} text-base font-semibold`}>
        <span className="text-ink">Net Pay (Total)</span>
        <span className="text-primary">{netPay.toLocaleString()}</span>
      </div>

      <div className={rowClass}>
        <label className="text-ink">Payment Status</label>
        <select name="payment_status" defaultValue={initial.payment_status} className="rounded-md border border-border bg-card px-2 py-1.5 text-sm">
          <option value="pending">Pending</option>
          <option value="processed">Processed</option>
          <option value="paid">Paid</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {state?.error && <p className="mt-2 text-sm text-danger">{state.error}</p>}
      {state?.success && <p className="mt-2 text-sm text-success">Payroll updated.</p>}

      <button type="submit" disabled={pending} className="mt-4 self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-ink disabled:opacity-50">
        {pending ? "Saving…" : "Update payroll"}
      </button>
    </form>
  );
}
