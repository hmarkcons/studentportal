"use client";

import { useActionState, useMemo, useState } from "react";
import { upsertStaffPayroll } from "@/lib/actions/finance";
import { toPKR } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

const rowClass = "flex items-center justify-between py-1.5 text-sm";

export function PayrollForm({
  staffId,
  payrollMonth,
  revalidateTo,
  currency,
  currencySymbol,
  initial,
  canManage,
  liveTotalCommission,
}: {
  staffId: string;
  payrollMonth: string;
  revalidateTo: string;
  currency: string;
  currencySymbol: string;
  canManage: boolean;
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
  // The live, freshly-computed commission ledger total (with bonus applied)
  // as of this render — independent of whatever total_commission was saved
  // last time. Once a payroll row exists, its total_commission is a frozen
  // snapshot that a later-added commission or a bonus target crossed after
  // saving won't update on its own, so this is surfaced as a one-click
  // refresh rather than silently overwritten.
  liveTotalCommission: number;
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

  // basic_salary/allowances/overtime/tax/deductions are in the staff's own
  // pay currency (per the (currencySymbol) labels below), but
  // total_commission is always PKR-normalized (see toPKR usage on the
  // server page) — summing them raw silently treated e.g. 2000 EUR as
  // equal to 2000 PKR. Gross/Net are computed here only, never stored, so
  // converting to PKR for this calculation doesn't touch what's saved.
  const grossTotal = useMemo(
    () => toPKR(basicSalary, currency) + toPKR(allowances, currency) + totalCommission + toPKR(overtime, currency),
    [basicSalary, allowances, totalCommission, overtime, currency]
  );
  const netPay = useMemo(
    () =>
      grossTotal -
      toPKR(deductionAbsent, currency) -
      toPKR(deductionLate, currency) -
      toPKR(deductionOther, currency) -
      toPKR(tax, currency),
    [grossTotal, deductionAbsent, deductionLate, deductionOther, tax, currency]
  );

  return (
    <form action={formAction} className="flex flex-col">
      <fieldset disabled={!canManage} className="contents">
      <div className={rowClass}>
        <label className="text-ink">Basic Salary ({currencySymbol})</label>
        <Input
          name="basic_salary"
          type="number"
          step="0.01"
          value={basicSalary}
          onChange={(e) => setBasicSalary(Number(e.target.value) || 0)}
          className="w-32 text-right"
        />
      </div>
      <div className={rowClass}>
        <label className="text-ink">Allowances ({currencySymbol})</label>
        <Input
          name="allowances"
          type="number"
          step="0.01"
          value={allowances}
          onChange={(e) => setAllowances(Number(e.target.value) || 0)}
          className="w-32 text-right"
        />
      </div>
      <div className={rowClass}>
        <label className="text-ink">Total Commission (PKR)</label>
        <Input
          name="total_commission"
          type="number"
          step="0.01"
          value={totalCommission}
          onChange={(e) => setTotalCommission(Number(e.target.value) || 0)}
          className="w-32 text-right"
        />
      </div>
      {Math.round(liveTotalCommission * 100) / 100 !== Math.round(totalCommission * 100) / 100 && (
        <p className="pb-1.5 text-right text-xs text-warning">
          Ledger total is now ₨ {liveTotalCommission.toLocaleString()} (with bonus) —{" "}
          <button type="button" onClick={() => setTotalCommission(liveTotalCommission)} className="text-primary hover:underline">
            refresh
          </button>
        </p>
      )}
      <div className={rowClass}>
        <label className="text-ink">Overtime ({currencySymbol})</label>
        <Input
          name="overtime"
          type="number"
          step="0.01"
          value={overtime}
          onChange={(e) => setOvertime(Number(e.target.value) || 0)}
          className="w-32 text-right"
        />
      </div>

      <hr className="my-3 border-border" />

      <div className={`${rowClass} font-semibold`}>
        <span className="text-ink">Gross Total (PKR)</span>
        <span className="text-ink">{grossTotal.toLocaleString()}</span>
      </div>

      <div className="py-1.5 text-sm">
        <p className="mb-1 text-ink">Deduction (Absent / Late / Other)</p>
        <div className="flex items-center gap-2">
          <Input
            name="deduction_absent"
            type="number"
            step="0.01"
            placeholder="Absent"
            value={deductionAbsent}
            onChange={(e) => setDeductionAbsent(Number(e.target.value) || 0)}
          />
          <Input
            name="deduction_late"
            type="number"
            step="0.01"
            placeholder="Late"
            value={deductionLate}
            onChange={(e) => setDeductionLate(Number(e.target.value) || 0)}
          />
          <Input
            name="deduction_other"
            type="number"
            step="0.01"
            placeholder="Other"
            value={deductionOther}
            onChange={(e) => setDeductionOther(Number(e.target.value) || 0)}
          />
        </div>
      </div>

      <div className={rowClass}>
        <label className="text-ink">Tax ({currencySymbol})</label>
        <Input
          name="tax"
          type="number"
          step="0.01"
          value={tax}
          onChange={(e) => setTax(Number(e.target.value) || 0)}
          className="w-32 text-right"
        />
      </div>

      <hr className="my-3 border-border" />

      <div className={`${rowClass} text-base font-semibold`}>
        <span className="text-ink">Net Pay (Total, PKR)</span>
        <span className="text-primary">{netPay.toLocaleString()}</span>
      </div>

      <div className={rowClass}>
        <label className="text-ink">Payment Status</label>
        <Select name="payment_status" defaultValue={initial.payment_status}>
          <option value="pending">Pending</option>
          <option value="processed">Processed</option>
          <option value="paid">Paid</option>
          <option value="failed">Failed</option>
        </Select>
      </div>
      </fieldset>

      {state?.error && <p className="mt-2 text-sm text-danger">{state.error}</p>}
      {state?.success && <p className="mt-2 text-sm text-success">Payroll updated.</p>}

      {canManage && (
        <Button type="submit" variant="primary" size="lg" disabled={pending} className="mt-4 self-start">
          {pending ? "Saving…" : "Update payroll"}
        </Button>
      )}
    </form>
  );
}
