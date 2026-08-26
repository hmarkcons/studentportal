"use client";

import { updateInventoryRequestStatus } from "@/lib/actions/inventory";
import { Badge } from "@/components/ui/Badge";

type Request = {
  id: string;
  quantity: number;
  status: string;
  notes: string | null;
  itemName: string;
  requesterName: string;
};

const TONE: Record<string, "success" | "warning" | "danger"> = { pending: "warning", fulfilled: "success", rejected: "danger" };

export function RequestQueue({ requests, canManage }: { requests: Request[]; canManage: boolean }) {
  if (requests.length === 0) return <p className="text-sm text-muted">No requests yet.</p>;

  return (
    <div className="flex flex-col divide-y divide-border">
      {requests.map((r) => (
        <div key={r.id} className="flex items-center justify-between py-2 text-sm">
          <span className="text-ink">
            {r.itemName} × {r.quantity} <span className="text-muted">· {r.requesterName}</span>
            {r.notes && <span className="text-muted"> · {r.notes}</span>}
          </span>
          <div className="flex items-center gap-2">
            <Badge tone={TONE[r.status] ?? "neutral"}>{r.status}</Badge>
            {canManage && r.status === "pending" && (
              <>
                <button onClick={() => updateInventoryRequestStatus(r.id, "fulfilled")} className="text-xs text-success hover:underline">
                  Fulfill
                </button>
                <button onClick={() => updateInventoryRequestStatus(r.id, "rejected")} className="text-xs text-danger hover:underline">
                  Reject
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
