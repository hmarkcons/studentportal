"use client";

import { approvePartnerAccount } from "@/lib/actions/admin";
import { Button } from "@/components/ui/Button";

export function PartnerApprovalButton({ id }: { id: string }) {
  return (
    <div className="flex gap-1">
      <Button variant="success" size="sm" onClick={() => approvePartnerAccount(id, "active")}>
        Approve
      </Button>
      <Button variant="danger" size="sm" onClick={() => approvePartnerAccount(id, "suspended")}>
        Reject
      </Button>
    </div>
  );
}
