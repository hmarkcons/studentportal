"use client";

import { useState } from "react";
import { updateRefundStatus, deleteRefundRequest } from "@/lib/actions/finance";
import { Button } from "@/components/ui/Button";
import { ActionStatus } from "@/components/ActionStatus";
import { useButtonAction } from "@/components/useButtonAction";

const DONE_LABELS: Record<string, string> = {
  approved: "Approved.",
  processed: "Marked processed.",
  rejected: "Rejected.",
};

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
  const [pending, setPending] = useState<string | null>(null);
  // Which status the last change set, for the confirmation's wording.
  const [lastValue, setLastValue] = useState<string | null>(null);
  const change = useButtonAction();
  const del = useButtonAction();

  const next: Record<string, { label: string; value: string }> = {
    requested: { label: "Approve", value: "approved" },
    approved: { label: "Mark processed", value: "processed" },
  };
  const action = next[status];

  if (!canManage) return null;

  async function handleStatusChange(value: string) {
    setPending(value);
    setLastValue(value);
    await change.run(() => updateRefundStatus(id, "/finance/refunds", value));
    setPending(null);
  }

  async function handleDelete() {
    if (!confirm("Delete this refund record?")) return;
    // The record's row goes with it, so success is a toast.
    await del.run(() => deleteRefundRequest(id), { toast: "Refund deleted." });
  }

  const error = change.state?.error ?? del.state?.error ?? null;

  return (
    <div>
      {/* The button pressed is replaced by the next step (or by nothing, once
          rejected), so the confirmation sits at the end of the row rather
          than beside a button that is no longer there. */}
      <div className="flex flex-wrap items-center gap-1">
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
          <Button variant="outline" size="sm" onClick={handleDelete} pending={del.pending} aria-label="Delete refund">
            🗑️
          </Button>
        )}
        <ActionStatus state={change.state} pending={change.pending} label={DONE_LABELS[lastValue ?? ""] ?? "Saved."} />
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
