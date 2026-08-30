"use client";

import { useState } from "react";
import { updateInventoryRequestStatus } from "@/lib/actions/inventory";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

type Request = {
  id: string;
  quantity: number;
  status: string;
  notes: string | null;
  itemName: string;
  requesterName: string;
};

const TONE: Record<string, "success" | "warning" | "danger"> = { pending: "warning", fulfilled: "success", rejected: "danger" };

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
        <span className="text-ink">
          {request.itemName} × {request.quantity} <span className="text-muted">· {request.requesterName}</span>
          {request.notes && <span className="text-muted"> · {request.notes}</span>}
        </span>
        <div className="flex items-center gap-2">
          <Badge tone={TONE[request.status] ?? "neutral"}>{request.status}</Badge>
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

  return (
    <div className="flex flex-col divide-y divide-border">
      {requests.map((r) => (
        <RequestRow key={r.id} request={r} canManage={canManage} />
      ))}
    </div>
  );
}
