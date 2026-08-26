"use client";

import { updateRefundStatus, deleteRefundRequest } from "@/lib/actions/finance";

export function RefundActions({ id, status, isSuperAdmin }: { id: string; status: string; isSuperAdmin: boolean }) {
  const next: Record<string, { label: string; value: string }> = {
    requested: { label: "Approve", value: "approved" },
    approved: { label: "Mark processed", value: "processed" },
  };
  const action = next[status];

  return (
    <div className="flex gap-1">
      {action && (
        <>
          <button
            onClick={() => updateRefundStatus(id, "/finance/refunds", action.value)}
            className="rounded-md border border-success px-2 py-0.5 text-xs text-success"
          >
            {action.label}
          </button>
          <button
            onClick={() => updateRefundStatus(id, "/finance/refunds", "rejected")}
            className="rounded-md border border-danger px-2 py-0.5 text-xs text-danger"
          >
            Reject
          </button>
        </>
      )}
      {isSuperAdmin && (
        <button
          onClick={() => {
            if (confirm("Delete this refund record?")) deleteRefundRequest(id);
          }}
          className="rounded-md border border-border px-2 py-0.5 text-xs text-muted hover:text-danger"
        >
          🗑️
        </button>
      )}
    </div>
  );
}
