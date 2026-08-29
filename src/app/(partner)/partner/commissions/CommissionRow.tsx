"use client";

import { useActionState, useState } from "react";
import { partnerUploadCommissionProof, partnerDisputeCommission } from "@/lib/actions/partner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export function CommissionRow({
  commission,
}: {
  commission: { id: string; expected_amount: number | null; currency: string; status: string; student: { full_name: string } | { full_name: string }[] | null };
}) {
  const action = partnerUploadCommissionProof.bind(null, commission.id);
  const [state, formAction, pending] = useActionState(action, undefined);
  const student = Array.isArray(commission.student) ? commission.student[0] : commission.student;

  const [disputeError, setDisputeError] = useState<string | null>(null);
  const [disputePending, setDisputePending] = useState(false);

  async function handleDispute() {
    setDisputePending(true);
    setDisputeError(null);
    const result = await partnerDisputeCommission(commission.id);
    if (result?.error) setDisputeError(result.error);
    setDisputePending(false);
  }

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
          <Button type="submit" pending={pending} size="sm">
            Upload proof
          </Button>
        </form>
        <Button onClick={handleDispute} variant="danger" size="sm" pending={disputePending}>
          Dispute
        </Button>
      </div>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      {disputeError && <p className="text-xs text-danger">{disputeError}</p>}
    </div>
  );
}
