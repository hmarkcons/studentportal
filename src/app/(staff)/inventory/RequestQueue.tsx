"use client";

import { useState } from "react";
import { updateInventoryRequestStatus } from "@/lib/actions/inventory";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  INVENTORY_REQUEST_STATUS_TONE,
  inventoryRequestStatusLabel,
  type InventoryRequestStatus,
} from "@/lib/inventory";

type Request = {
  id: string;
  quantity: number;
  status: string;
  notes: string | null;
  itemName: string;
  itemDeleted?: boolean;
  requesterName: string;
};

function RequestRow({ request, canManage }: { request: Request; canManage: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"fulfilled" | "rejected" | null>(null);

  async function handleDecide(status: "fulfilled" | "rejected") {
    setPending(status);
    setError(null);
    const result = await updateInventoryRequestStatus(request.id, status);
    if (result?.error) setError(result.error);
    setPending(null);
  }

  return (
    <div className="py-2 text-sm">
      <div className="flex items-center justify-between">
        <span className="min-w-0 text-ink">
          {request.itemName} × {request.quantity}
          {request.itemDeleted && <span className="ml-1 text-xs text-muted">(item since removed)</span>}
          <span className="text-muted"> · {request.requesterName}</span>
          {request.notes && <span className="text-muted"> · {request.notes}</span>}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {/* Was the raw value: a row read "pending" rather than "Awaiting
              decision". */}
          <Badge tone={INVENTORY_REQUEST_STATUS_TONE[request.status as InventoryRequestStatus] ?? "neutral"}>
            {inventoryRequestStatusLabel(request.status)}
          </Badge>
          {canManage && request.status === "pending" && (
            <>
              <button onClick={() => handleDecide("fulfilled")} disabled={!!pending} className="text-xs text-success hover:underline disabled:opacity-50">
                Fulfill
              </button>
              <button onClick={() => handleDecide("rejected")} disabled={!!pending} className="text-xs text-danger hover:underline disabled:opacity-50">
                Reject
              </button>
            </>
          )}
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

export function RequestQueue({ requests, canManage }: { requests: Request[]; canManage: boolean }) {
  if (requests.length === 0) return <EmptyState>No requests yet.</EmptyState>;

  const pending = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending");

  return (
    <div className="flex flex-col gap-4">
      {/* Open requests first and counted: they are the only ones anybody has
          to act on, and they used to be mixed into the settled history in
          date order. */}
      <div>
        <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
          Awaiting decision ({pending.length})
        </h4>
        {pending.length === 0 ? (
          <p className="py-2 text-sm text-muted">Nothing waiting.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {pending.map((r) => (
              <RequestRow key={r.id} request={r} canManage={canManage} />
            ))}
          </div>
        )}
      </div>

      {decided.length > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Decided</h4>
          <div className="flex flex-col divide-y divide-border">
            {decided.map((r) => (
              <RequestRow key={r.id} request={r} canManage={canManage} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
