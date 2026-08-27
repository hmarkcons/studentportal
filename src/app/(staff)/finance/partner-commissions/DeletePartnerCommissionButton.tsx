"use client";

import { deletePartnerCommission } from "@/lib/actions/finance";
import { Button } from "@/components/ui/Button";

export function DeletePartnerCommissionButton({ id }: { id: string }) {
  return (
    <Button
      size="sm"
      onClick={() => {
        if (confirm("Delete this partner commission record?")) deletePartnerCommission(id, "/finance/partner-commissions");
      }}
    >
      🗑️
    </Button>
  );
}
