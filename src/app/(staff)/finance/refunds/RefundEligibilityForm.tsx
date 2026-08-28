"use client";

import { useActionState, useState } from "react";
import { updateRefundEligibility } from "@/lib/actions/finance";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

export function RefundEligibilityForm({
  id,
  eligibilityStatus,
  nextIntakeNote,
  nextIntakeCountryId,
  destinations,
}: {
  id: string;
  eligibilityStatus: string;
  nextIntakeNote: string | null;
  nextIntakeCountryId: string;
  destinations: { id: string; country: string; display_name: string }[];
}) {
  const boundAction = updateRefundEligibility.bind(null, "/finance/refunds");
  const [state, formAction, pending] = useActionState(boundAction, undefined);
  const [status, setStatus] = useState(eligibilityStatus);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2 rounded-md bg-bg px-3 py-2 text-xs">
      <input type="hidden" name="id" value={id} />
      <span className="text-muted">Eligibility:</span>
      <Select
        name="eligibility_status"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="h-7 py-0 text-xs"
      >
        <option value="eligible">Eligible</option>
        <option value="ineligible_reapplying">Ineligible — reapplying next intake</option>
      </Select>
      {status === "ineligible_reapplying" && (
        <>
          <Input
            name="next_intake_note"
            placeholder="Next possible intake (e.g. Fall 2027)"
            defaultValue={nextIntakeNote ?? ""}
            className="h-7 w-56 py-0 text-xs"
          />
          <Select name="next_intake_country_id" defaultValue={nextIntakeCountryId} className="h-7 py-0 text-xs">
            <option value="">Country…</option>
            {destinations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.display_name || d.country}
              </option>
            ))}
          </Select>
        </>
      )}
      <Button type="submit" variant="outline" size="sm" pending={pending}>
        Save
      </Button>
      {state?.error && <span className="text-danger">{state.error}</span>}
    </form>
  );
}
