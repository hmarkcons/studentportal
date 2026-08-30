"use client";

import { useState } from "react";
import { approvePartnerAccount } from "@/lib/actions/admin";
import { Button } from "@/components/ui/Button";

export function PartnerApprovalButton({ id }: { id: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"active" | "suspended" | null>(null);

  async function handleDecide(status: "active" | "suspended") {
    setPending(status);
    setError(null);
    const result = await approvePartnerAccount(id, status);
    if (result?.error) setError(result.error);
    setPending(null);
  }

  return (
    <div>
      <div className="flex gap-1">
        <Button variant="success" size="sm" onClick={() => handleDecide("active")} pending={pending === "active"}>
          Approve
        </Button>
        <Button variant="danger" size="sm" onClick={() => handleDecide("suspended")} pending={pending === "suspended"}>
          Reject
        </Button>
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
