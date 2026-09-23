"use client";

import { approvePartnerAccount } from "@/lib/actions/admin";
import { Button } from "@/components/ui/Button";
import { useButtonAction } from "@/components/useButtonAction";

export function PartnerApprovalButton({ id }: { id: string }) {
  const approve = useButtonAction();
  const reject = useButtonAction();
  const busy = approve.pending || reject.pending;

  // Deciding takes the account off the pending list, and these buttons with
  // it, so success is a toast; a refusal is said beside the button pressed.
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button
        variant="success"
        size="sm"
        onClick={() => approve.run(() => approvePartnerAccount(id, "active"), { toast: "Partner approved." })}
        pending={approve.pending}
        disabled={busy}
        status={{ state: approve.state, label: "Approved.", showError: true }}
      >
        Approve
      </Button>
      <Button
        variant="danger"
        size="sm"
        onClick={() => reject.run(() => approvePartnerAccount(id, "suspended"), { toast: "Partner rejected." })}
        pending={reject.pending}
        disabled={busy}
        status={{ state: reject.state, label: "Rejected.", showError: true }}
      >
        Reject
      </Button>
    </div>
  );
}
