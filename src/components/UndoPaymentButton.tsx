"use client";

import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useButtonAction } from "@/components/useButtonAction";
import { undoInstallmentPayment } from "@/lib/actions/invoices";

/**
 * Undoes a payment recorded on an instalment by mistake (0311). The
 * instalment goes back to unpaid; a part payment is merged back with its
 * balance. Offered wherever a payment can be recorded, to the same people.
 */
export function UndoPaymentButton({ installmentId, studentId, label }: { installmentId: string; studentId: string; label: string }) {
  const undo = useButtonAction();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      pending={undo.pending}
      status={{ state: undo.state, label: "Undone.", showError: true }}
      onClick={async () => {
        if (
          !confirm(
            `Undo the payment recorded on ${label}? It goes back to unpaid, and a part payment is merged back with its balance. Its receipts stay on file.`
          )
        )
          return;
        await undo.run(() => undoInstallmentPayment(installmentId, studentId), { toast: "Payment undone." });
      }}
      title="Undo a payment recorded by mistake"
      data-undo-payment={installmentId}
    >
      <Undo2 aria-hidden className="h-3.5 w-3.5" />
      Undo payment
    </Button>
  );
}
