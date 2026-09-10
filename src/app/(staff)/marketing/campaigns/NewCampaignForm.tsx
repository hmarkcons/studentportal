"use client";

import { useActionState } from "react";
import { createCampaign } from "@/lib/actions/marketing";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

export function NewCampaignForm() {
  const [state, formAction, pending] = useActionState(createCampaign, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <Select name="type">
        <option value="event">Event / fair</option>
        <option value="digital">Digital</option>
      </Select>
      <Input name="name" placeholder="Campaign name" required className="min-w-[200px] flex-1" />
      <Input name="city" placeholder="City" />
      {/* An event has a start and an end. event_date_end has been in the
          schema since 0015 with no way to enter it, so a three-day fair was
          recorded as a single date. */}
      <label className="flex flex-col gap-1 text-xs text-muted">
        Starts
        <Input name="event_date_start" type="date" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Ends
        <Input name="event_date_end" type="date" />
      </label>
      <Input name="budget" type="number" step="0.01" min="0" placeholder="Budget" className="w-28" />
      <Button type="submit" variant="primary" pending={pending}>
        Add campaign
      </Button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
