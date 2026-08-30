"use client";

import { useState } from "react";
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
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const next: Record<string, { label: string; value: string }> = {
    requested: { label: "Approve", value: "approved" },
    approved: { label: "Mark processed", value: "processed" },
  };
  const action = next[status];

  if (!canManage) return null;

  async function handleStatusChange(value: string) {
    setPending(value);
    setError(null);
    const result = await updateRefundStatus(id, "/finance/refunds", value);
    if (result?.error) setError(result.error);
    setPending(null);
  }

  async function handleDelete() {
    if (!confirm("Delete this refund record?")) return;
    setError(null);
    const result = await deleteRefundRequest(id);
    if (result?.error) setError(result.error);
  }

  return (
    <div>
      <div className="flex gap-1">
        {action && !ineligible && (
          <>
            <Button variant="success" size="sm" onClick={() => handleStatusChange(action.value)} pending={pending === action.value}>
              {action.label}
            </Button>
            <Button variant="danger" size="sm" onClick={() => handleStatusChange("rejected")} pending={pending === "rejected"}>
              Reject
            </Button>
          </>
        )}
        {isSuperAdmin && (
          <Button variant="outline" size="sm" onClick={handleDelete}>
            🗑️
          </Button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
