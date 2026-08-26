"use client";

import { deletePartnerCommission } from "@/lib/actions/finance";

export function DeletePartnerCommissionButton({ id }: { id: string }) {
  return (
    <button
      onClick={() => {
        if (confirm("Delete this partner commission record?")) deletePartnerCommission(id, "/finance/partner-commissions");
      }}
      className="rounded-md border border-border px-2 py-0.5 text-xs text-muted hover:text-danger"
    >
      🗑️
    </button>
  );
}
