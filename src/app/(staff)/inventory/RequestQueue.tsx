"use client";

import { useState } from "react";
import { updateInventoryRequestStatus, cancelInventoryRequest } from "@/lib/actions/inventory";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  INVENTORY_REQUEST_STATUS_TONE,
  inventoryRequestStatusLabel,
  REQUEST_NOTE_MAX,
  type InventoryRequestStatus,
} from "@/lib/inventory";
import { formatStamp } from "@/lib/activityStamp";

type Request = {
  id: string;
  quantity: number;
  status: string;
  notes: string | null;
  itemName: string;
  itemDeleted?: boolean;
  requesterName: string;
  createdAt: string;
  decidedAt: string | null;
  deciderName: string | null;
  decisionNote: string | null;
  /** Whether the person looking at this raised it, so only they can withdraw it. */
  isMine: boolean;
};

function RequestRow({ request, canManage }: { request: Request; canManage: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"fulfilled" | "rejected" | "cancel" | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");

  async function decide(status: "fulfilled" | "rejected", withNote?: string) {
    setPending(status);
    setError(null);
    const result = await updateInventoryRequestStatus(request.id, status, withNote);
    if (result?.error) setError(result.error);
    else setRejecting(false);
    setPending(null);
  }

  async function withdraw() {
    setPending("cancel");
    setError(null);
    const result = await cancelInventoryRequest(request.id);
    if (result?.error) setError(result.error);
    setPending(null);
  }

  return (
    <div className="py-2 text-sm">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="text-ink">
            {request.itemName} × {request.quantity}
            {request.itemDeleted && <span className="ml-1 text-xs text-muted">(item since removed)</span>}
          </span>
          {/* Who asked and when. createdAt was already being passed to this
              component and dropped on the floor, so a queue of open requests
              gave no way to tell one raised this morning from one raised six
              weeks ago. */}
          <span className="block text-xs text-muted">
            {request.requesterName} · requested {formatStamp(request.createdAt)}
          </span>
          {request.notes && <span className="block text-xs text-muted">“{request.notes}”</span>}
          {/* The decision, in the same shape: what happened, when, by whom,
              and — for a refusal — why. A red "Rejected" badge on its own left
              the requester with nothing to act on. */}
          {request.decidedAt && (
            <span className="block text-xs text-muted">
              {inventoryRequestStatusLabel(request.status)} {formatStamp(request.decidedAt)}
              {request.deciderName ? ` by ${request.deciderName}` : ""}
              {request.decisionNote ? ` — ${request.decisionNote}` : ""}
            </span>
          )}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {/* Was the raw value: a row read "pending" rather than "Awaiting
              decision". */}
          <Badge tone={INVENTORY_REQUEST_STATUS_TONE[request.status as InventoryRequestStatus] ?? "neutral"}>
            {inventoryRequestStatusLabel(request.status)}
          </Badge>
          {request.status === "pending" && (
            <>
              {canManage && (
                <>
                  <button
                    onClick={() => decide("fulfilled")}
                    disabled={Boolean(pending)}
                    className="text-xs text-success hover:underline disabled:opacity-50"
                  >
                    Fulfill
                  </button>
                  <button
                    onClick={() => setRejecting((v) => !v)}
                    disabled={Boolean(pending)}
                    className="text-xs text-danger hover:underline disabled:opacity-50"
                  >
                    Reject
                  </button>
                </>
              )}
              {request.isMine && (
                <button
                  onClick={withdraw}
                  disabled={Boolean(pending)}
                  className="text-xs text-muted hover:underline disabled:opacity-50"
                  title="Withdraw a request you raised by mistake"
                >
                  Withdraw
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {rejecting && (
        <div className="mt-2 flex flex-col gap-2 rounded-md border border-border bg-bg p-2">
          <label className="text-xs text-muted">
            Why is it being turned down? The person who asked sees this.
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={REQUEST_NOTE_MAX}
              placeholder="e.g. Out of stock until Monday — reorder is in."
              autoFocus
            />
          </label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="danger"
              size="sm"
              pending={pending === "rejected"}
              disabled={!note.trim()}
              onClick={() => decide("rejected", note)}
            >
              Reject request
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

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
