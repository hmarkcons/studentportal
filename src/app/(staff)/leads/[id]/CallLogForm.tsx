"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { updateLeadStatus } from "@/lib/actions/leads";
import { LEAD_STATUSES, LEAD_STATUS_LABELS } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { Select, Textarea } from "@/components/ui/Input";
import { markListsStale } from "@/components/RefreshIfStale";

export function CallLogForm({ leadId, currentStatus }: { leadId: string; currentStatus: string }) {
  const action = updateLeadStatus.bind(null, leadId);
  const [state, formAction, pending] = useActionState(action, undefined);
  const router = useRouter();

  // The answer says it is saved and nothing more (updateLeadStatus); the
  // badge and the call history are read again behind it, and the leads list
  // held for Back is told it is out of date.
  useEffect(() => {
    if (state && "status" in state) {
      markListsStale();
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="current_status" value={currentStatus} />
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">Update status</label>
        <Select name="status" defaultValue={currentStatus} className="px-3 py-2">
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {LEAD_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">
          Remark <span className="font-normal text-muted">(optional — kept in the call history)</span>
        </label>
        <Textarea name="remark" rows={2} className="px-3 py-2" />
      </div>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <Button type="submit" variant="primary" pending={pending} status={{ state, label: "Saved." }}>
        Update status
      </Button>
    </form>
  );
}
