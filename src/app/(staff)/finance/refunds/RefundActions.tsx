"use client";

import { updateRefundStatus } from "@/lib/actions/finance";

export function RefundActions({ id, status }: { id: string; status: string }) {
  const next: Record<string, { label: string; value: string }> = {
    requested: { label: "Approve", value: "approved" },
    approved: { label: "Mark processed", value: "processed" },
  };
  const action = next[status];
  if (!action) return null;

  return (
    <div className="flex gap-1">
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
    </div>
  );
}
