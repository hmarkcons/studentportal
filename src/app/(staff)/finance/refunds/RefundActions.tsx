"use client";

import { updateRefundStatus, deleteRefundRequest } from "@/lib/actions/finance";
import { Button } from "@/components/ui/Button";

export function RefundActions({
  id,
  status,
  canManage,
  isSuperAdmin,
  ineligible,
}: {
  id: string;
  status: string;
  canManage: boolean;
  isSuperAdmin: boolean;
  ineligible: boolean;
}) {
  const next: Record<string, { label: string; value: string }> = {
    requested: { label: "Approve", value: "approved" },
    approved: { label: "Mark processed", value: "processed" },
  };
  const action = next[status];

  if (!canManage) return null;

  return (
    <div className="flex gap-1">
      {action && !ineligible && (
        <>
          <Button variant="success" size="sm" onClick={() => updateRefundStatus(id, "/finance/refunds", action.value)}>
            {action.label}
          </Button>
          <Button variant="danger" size="sm" onClick={() => updateRefundStatus(id, "/finance/refunds", "rejected")}>
            Reject
          </Button>
        </>
      )}
      {isSuperAdmin && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (confirm("Delete this refund record?")) deleteRefundRequest(id);
          }}
        >
          🗑️
        </Button>
      )}
    </div>
  );
}
