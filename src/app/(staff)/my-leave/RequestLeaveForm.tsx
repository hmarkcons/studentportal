"use client";

import { useActionState, useState } from "react";
import { requestMyLeave } from "@/lib/actions/leave";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { FileField } from "@/components/FileField";
import { ACCEPTED_DOCUMENT_ACCEPT } from "@/lib/documentUpload";

export function RequestLeaveForm() {
  const [state, formAction, pending] = useActionState(requestMyLeave, undefined);
  const [kind, setKind] = useState("planned");
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Kind
          <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="planned">Planned leave</option>
            <option value="sick">Sick leave</option>
            <option value="emergency">Emergency leave</option>
          </Select>
        </label>
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
      {kind === "planned" ? (
        <p className="text-xs text-muted">Planned leave needs at least a month&apos;s notice.</p>
      ) : (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted">
            Medical certificate — sick and emergency leave is paid only with one; without it the days are unpaid.
          </span>
          <FileField name="certificate" accept={ACCEPTED_DOCUMENT_ACCEPT} noun="certificate" inputClassName="text-sm" />
        </div>
      )}
      <div>
        <Button
          type="submit"
          variant="primary"
          pending={pending}
          status={{ state, label: state?.success ? (state.message ?? "Requested.") : "Requested.", showError: true }}
        >
          Request leave
        </Button>
      </div>
    </form>
  );
}
