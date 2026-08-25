"use client";

import { updateReferralIncentiveStatus } from "@/lib/actions/marketing";

export function IncentiveStatusButton({ id, status }: { id: string; status: string }) {
  if (status === "paid") return null;
  return (
    <button onClick={() => updateReferralIncentiveStatus(id, "paid")} className="rounded-md border border-success px-2 py-0.5 text-xs text-success">
      Mark paid
    </button>
  );
}
