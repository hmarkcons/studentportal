"use client";

import { useState } from "react";
import { deletePartnerCommission } from "@/lib/actions/finance";
import { Button } from "@/components/ui/Button";

export function DeletePartnerCommissionButton({ id }: { id: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this partner commission record?")) return;
    setPending(true);
    setError(null);
    const result = await deletePartnerCommission(id, "/finance/partner-commissions");
    if (result?.error) setError(result.error);
    setPending(false);
  }

  return (
    <div>
      <Button size="sm" onClick={handleDelete} pending={pending}>
        🗑️
      </Button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
