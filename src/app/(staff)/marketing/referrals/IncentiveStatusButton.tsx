"use client";

import { updateReferralIncentiveStatus } from "@/lib/actions/marketing";
import { Button } from "@/components/ui/Button";

export function IncentiveStatusButton({ id, status }: { id: string; status: string }) {
  if (status === "paid") return null;
  return (
    <Button onClick={() => updateReferralIncentiveStatus(id, "paid")} variant="success" size="sm">
      Mark paid
    </Button>
  );
}
