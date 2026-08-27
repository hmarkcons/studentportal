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
      <Input name="event_date_start" type="date" />
      <Input name="budget" type="number" step="0.01" placeholder="Budget" className="w-28" />
      <Button type="submit" variant="primary" pending={pending}>
        Add campaign
      </Button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
