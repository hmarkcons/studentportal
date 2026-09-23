"use client";

import { useActionState, useState } from "react";
import { partnerUploadCommissionProof, partnerDisputeCommission } from "@/lib/actions/partner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FileField } from "@/components/FileField";
import { uploadedLine } from "@/lib/activityStamp";
import { useButtonAction } from "@/components/useButtonAction";

export function CommissionRow({
  commission,
}: {
  commission: {
    id: string;
    expected_amount: number | null;
    currency: string;
    status: string;
    payment_proof_uploaded_at: string | null;
    student: { full_name: string } | { full_name: string }[] | null;
  };
}) {
  const action = partnerUploadCommissionProof.bind(null, commission.id);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [blocked, setBlocked] = useState(false);
  const student = Array.isArray(commission.student) ? commission.student[0] : commission.student;
  const proofUploaded = uploadedLine({
    at: commission.payment_proof_uploaded_at,
    byRole: "partner",
    audience: "partner",
  })?.replace("Uploaded", "Proof uploaded");

  const dispute = useButtonAction();

  return (
    <div className="flex items-center justify-between gap-3 py-3 text-sm">
      <div>
        <p className="text-ink">{student?.full_name}</p>
        <p className="text-xs text-muted">
          {commission.currency} {commission.expected_amount ?? "—"}
        </p>
        {/* Nothing on this row used to change after an upload, so a university
            had no way to tell whether the proof had gone through — and
            uploading it again was the only way to be sure. */}
        {proofUploaded && <p className="text-xs text-muted">{proofUploaded}</p>}
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={commission.status === "received" ? "success" : commission.status === "disputed" ? "danger" : "warning"}>
          {commission.status.replace(/_/g, " ")}
        </Badge>
        <form action={formAction} className="flex items-start gap-1">
          <FileField hint="PDF or image" className="w-40" onChange={(s) => setBlocked(Boolean(s.error) || s.busy)} />
          <Button type="submit" pending={pending} size="sm" disabled={blocked} status={{ state, label: "Proof uploaded." }}>
            {commission.payment_proof_uploaded_at ? "Replace proof" : "Upload proof"}
          </Button>
        </form>
        <Button
          onClick={() => dispute.run(() => partnerDisputeCommission(commission.id))}
          variant="danger"
          size="sm"
          pending={dispute.pending}
          status={{ state: dispute.state, label: "Disputed.", showError: true }}
        >
          Dispute
        </Button>
      </div>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </div>
  );
}
