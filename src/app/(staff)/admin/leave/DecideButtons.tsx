"use client";

import { useState } from "react";
import { decideLeave } from "@/lib/actions/leave";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useButtonAction } from "@/components/useButtonAction";
import { toast } from "@/lib/toast";

/** Approve, or reject with a note they will see. Both leave the pending list, so both confirm with a toast. */
export function DecideButtons({ id, staffName }: { id: string; staffName: string }) {
  const approve = useButtonAction();
  const reject = useButtonAction();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const busy = approve.pending || reject.pending;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="success"
          pending={approve.pending}
          disabled={busy}
          status={{ state: approve.state, label: "Approved.", showError: true }}
          onClick={async () => {
            const result = await approve.run(() => decideLeave(id, "approve", ""));
            if (result && "success" in result && result.success) toast(`${staffName}: ${result.message ?? "approved."}`);
          }}
        >
          Approve
        </Button>
        <Button size="sm" type="button" disabled={busy} onClick={() => setRejecting((v) => !v)}>
          {rejecting ? "Cancel" : "Reject"}
        </Button>
      </div>
      {rejecting && (
        <div className="flex flex-wrap items-end gap-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why? They will see this." className="min-w-[220px] flex-1" />
          <Button
            size="sm"
            variant="danger"
            disabled={!note.trim() || busy}
            pending={reject.pending}
            status={{ state: reject.state, label: "Rejected.", showError: true }}
            onClick={() => void reject.run(() => decideLeave(id, "reject", note), { toast: `${staffName}: request rejected.` })}
          >
            Reject request
          </Button>
        </div>
      )}
    </div>
  );
}
