"use client";

import { useActionState, useMemo, useState } from "react";
import { createPartnerCommission } from "@/lib/actions/finance";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

export type PartnerApplicationOption = {
  id: string;
  student_id: string;
  universityName: string;
  tuitionFee: number | null;
  ratePercent: number | null;
  fixedAmount: number | null;
  rateCurrency: string | null;
};

// Mirrors suggestCommission() for staff commissions: a program's negotiated
// rate (program_commission_rates) applied to its tuition_fee, or the flat
// amount if one was configured instead — suggested, never forced, since
// Finance may still be waiting on a signed contract to confirm the exact
// figure.
export function suggestPartnerCommission(app: PartnerApplicationOption | null) {
  if (!app) return { amount: null as number | null, currency: null as string | null, ratePercent: null as number | null, fixedAmount: null as number | null };
  if (app.fixedAmount != null) {
    return { amount: app.fixedAmount, currency: app.rateCurrency, ratePercent: null as number | null, fixedAmount: app.fixedAmount };
  }
  if (app.ratePercent != null && app.tuitionFee != null) {
    return {
      amount: Math.round(app.tuitionFee * (app.ratePercent / 100) * 100) / 100,
      currency: app.rateCurrency,
      ratePercent: app.ratePercent,
      fixedAmount: null as number | null,
    };
  }
  return { amount: null as number | null, currency: null as string | null, ratePercent: app.ratePercent, fixedAmount: null as number | null };
}

export function AddPartnerCommissionForm({
  students,
  applications,
}: {
  students: { id: string; full_name: string }[];
  applications: PartnerApplicationOption[];
}) {
  const action = createPartnerCommission.bind(null, "/finance/partner-commissions");
  const [state, formAction, pending] = useActionState(action, undefined);
  const [studentId, setStudentId] = useState("");
  const [applicationId, setApplicationId] = useState("");
  const [expectedAmount, setExpectedAmount] = useState("");
  const [ratePercent, setRatePercent] = useState("");
  const [fixedAmount, setFixedAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [amountEdited, setAmountEdited] = useState(false);
  const [suggestionKey, setSuggestionKey] = useState<string | null>(null);

  const studentApplications = useMemo(
    () => applications.filter((a) => a.student_id === studentId),
    [applications, studentId]
  );

  const selectedApplication = applications.find((a) => a.id === applicationId) ?? null;
  const suggestion = suggestPartnerCommission(selectedApplication);

  // Auto-fill on each new application pick, same "adjust state during
  // render" pattern used for staff commissions — never re-applied after a
  // real edit, so a manual correction sticks.
  if (applicationId !== suggestionKey) {
    setSuggestionKey(applicationId);
    setAmountEdited(false);
    setExpectedAmount(suggestion.amount != null ? String(suggestion.amount) : "");
    setRatePercent(suggestion.ratePercent != null ? String(suggestion.ratePercent) : "");
    setFixedAmount(suggestion.fixedAmount != null ? String(suggestion.fixedAmount) : "");
    if (suggestion.currency) setCurrency(suggestion.currency);
  }

  return (
    <form action={formAction} className="mb-4 flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Student
          <Select
            name="student_id"
            value={studentId}
            onChange={(e) => {
              setStudentId(e.target.value);
              setApplicationId("");
            }}
            required
            className="w-56"
          >
            <option value="">Student…</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          University (application)
          <Select
            name="application_id"
            value={applicationId}
            onChange={(e) => setApplicationId(e.target.value)}
            disabled={!studentId}
            required
            className="w-56"
          >
            <option value="">
              {studentId ? (studentApplications.length ? "Choose application…" : "No applications for this student") : "Choose a student first"}
            </option>
            {studentApplications.map((a) => (
              <option key={a.id} value={a.id}>
                {a.universityName}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Expected amount
          <Input
            name="expected_amount"
            type="number"
            step="0.01"
            placeholder="Amount"
            className="w-32"
            value={expectedAmount}
            onChange={(e) => {
              setExpectedAmount(e.target.value);
              setAmountEdited(true);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Currency
          <Select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-24">
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
            <option value="PKR">PKR</option>
            <option value="GBP">GBP</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Rate %
          <Input
            name="rate_percent"
            type="number"
            step="0.01"
            placeholder="e.g. 15"
            className="w-20"
            value={ratePercent}
            onChange={(e) => setRatePercent(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Fixed amount
          <Input
            name="fixed_amount"
            type="number"
            step="0.01"
            placeholder="Optional"
            className="w-28"
            value={fixedAmount}
            onChange={(e) => setFixedAmount(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Channel
          <Select name="channel" defaultValue="" className="w-28">
            <option value="">—</option>
            <option value="wallet">wallet</option>
            <option value="direct">direct</option>
          </Select>
        </label>
        <Button type="submit" variant="primary" size="sm" pending={pending}>
          + Add commission record
        </Button>
      </div>
      {suggestion.amount != null && !amountEdited && (
        <p className="text-xs text-muted">
          Suggested: {suggestion.fixedAmount != null ? `flat ${suggestion.currency} ${suggestion.fixedAmount}` : `${suggestion.ratePercent}% of ${suggestion.currency} ${selectedApplication?.tuitionFee?.toFixed(2)} tuition`} — adjust if needed.
        </p>
      )}
      {applicationId && suggestion.amount == null && (
        <p className="text-xs text-muted">No suggestion available — set a commission rate for this program under Setup → Universities, or enter the amount manually.</p>
      )}
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}
