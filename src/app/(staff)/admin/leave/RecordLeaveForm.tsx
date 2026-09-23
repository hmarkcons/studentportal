"use client";

import { useActionState } from "react";
import { recordLeaveFor } from "@/lib/actions/leave";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { FileField } from "@/components/FileField";
import { ACCEPTED_DOCUMENT_ACCEPT } from "@/lib/documentUpload";

/** Leave entered for someone — they phoned in sick — approved as it is recorded. */
export function RecordLeaveForm({ staff }: { staff: { id: string; full_name: string }[] }) {
  const [state, formAction, pending] = useActionState(recordLeaveFor, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <Select name="staff_id" required defaultValue="">
          <option value="">Staff member…</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </Select>
        <Select name="kind" defaultValue="sick">
          <option value="planned">Planned leave</option>
          <option value="sick">Sick leave</option>
          <option value="emergency">Emergency leave</option>
        </Select>
        <label className="flex flex-col gap-1 text-xs text-muted">
          First day
          <Input name="start_date" type="date" required />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Last day
          <Input name="end_date" type="date" />
        </label>
      </div>
      <Input name="reason" placeholder="Reason (optional)" />
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted">Medical certificate — without one, sick and emergency leave is recorded as unpaid.</span>
        <FileField name="certificate" accept={ACCEPTED_DOCUMENT_ACCEPT} noun="certificate" inputClassName="text-sm" />
      </div>
      <div>
        <Button
          type="submit"
          variant="primary"
          pending={pending}
          status={{ state, label: state?.success ? (state.message ?? "Recorded.") : "Recorded.", showError: true }}
        >
          Record leave
        </Button>
      </div>
    </form>
  );
}
