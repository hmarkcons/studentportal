"use client";

import { approvePartnerAccount } from "@/lib/actions/admin";

export function PartnerApprovalButton({ id }: { id: string }) {
  return (
    <div className="flex gap-1">
      <button onClick={() => approvePartnerAccount(id, "active")} className="rounded-md border border-success px-2 py-0.5 text-xs text-success">
        Approve
      </button>
      <button onClick={() => approvePartnerAccount(id, "suspended")} className="rounded-md border border-danger px-2 py-0.5 text-xs text-danger">
        Reject
      </button>
    </div>
  );
}
