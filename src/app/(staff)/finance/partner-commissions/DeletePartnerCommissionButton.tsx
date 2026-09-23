"use client";

import { deletePartnerCommission } from "@/lib/actions/finance";
import { Button } from "@/components/ui/Button";
import { useButtonAction } from "@/components/useButtonAction";

export function DeletePartnerCommissionButton({ id }: { id: string }) {
  const del = useButtonAction();

  async function handleDelete() {
    if (!confirm("Delete this partner commission record?")) return;
    // The record's row goes with it, so success is a toast; a refusal is said
    // beside the button, which is still there.
    await del.run(() => deletePartnerCommission(id, "/finance/partner-commissions"), { toast: "Commission record deleted." });
  }

  return (
    <Button
      size="sm"
      onClick={handleDelete}
      pending={del.pending}
      aria-label="Delete commission record"
      status={{ state: del.state, label: "Deleted.", showError: true }}
    >
      🗑️
    </Button>
  );
}
