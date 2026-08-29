"use client";

import { useState } from "react";
import { updateReferralIncentiveStatus } from "@/lib/actions/marketing";
import { Button } from "@/components/ui/Button";

export function IncentiveStatusButton({ id, status }: { id: string; status: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (status === "paid") return null;

  async function handleClick() {
    setPending(true);
    setError(null);
    const result = await updateReferralIncentiveStatus(id, "paid");
    if (result?.error) setError(result.error);
    setPending(false);
  }

  return (
    <div>
      <Button onClick={handleClick} variant="success" size="sm" pending={pending}>
        Mark paid
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
