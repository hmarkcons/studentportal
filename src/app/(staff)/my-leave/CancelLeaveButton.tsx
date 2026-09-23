"use client";

import { cancelMyLeave } from "@/lib/actions/leave";
import { Button } from "@/components/ui/Button";
import { useButtonAction } from "@/components/useButtonAction";

export function CancelLeaveButton({ id }: { id: string }) {
  const cancel = useButtonAction();
  return (
    <Button
      size="sm"
      pending={cancel.pending}
      status={{ state: cancel.state, label: "Withdrawn.", showError: true }}
      onClick={() => {
        if (!confirm("Withdraw this leave request?")) return;
        void cancel.run(() => cancelMyLeave(id), { toast: "Request withdrawn." });
      }}
    >
      Withdraw
    </Button>
  );
}
