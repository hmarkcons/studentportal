"use client";

import { useActionState } from "react";
import { partnerUploadCommissionProof, partnerDisputeCommission } from "@/lib/actions/partner";
import { Badge } from "@/components/ui/Badge";

export function CommissionRow({
  commission,
}: {
  commission: { id: string; expected_amount: number | null; currency: string; status: string; student: { full_name: string } | { full_name: string }[] | null };
}) {
  const action = partnerUploadCommissionProof.bind(null, commission.id);
  const [state, formAction, pending] = useActionState(action, undefined);
  const student = Array.isArray(commission.student) ? commission.student[0] : commission.student;

  return (
    <div className="flex items-center justify-between gap-3 py-3 text-sm">
      <div>
        <p className="text-ink">{student?.full_name}</p>
        <p className="text-xs text-muted">
          {commission.currency} {commission.expected_amount ?? "—"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={commission.status === "received" ? "success" : commission.status === "disputed" ? "danger" : "warning"}>
          {commission.status.replace(/_/g, " ")}
        </Badge>
        <form action={formAction} className="flex items-center gap-1">
          <input type="file" name="file" className="w-24 text-xs" />
          <button type="submit" disabled={pending} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-bg">
            Upload proof
          </button>
        </form>
        <button onClick={() => partnerDisputeCommission(commission.id)} className="rounded-md border border-danger px-2 py-1 text-xs text-danger">
          Dispute
        </button>
      </div>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </div>
  );
}
