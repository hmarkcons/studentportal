"use client";

import { useActionState } from "react";
import { createAdCampaign } from "@/lib/actions/marketing";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

export function NewAdCampaignForm({ universities }: { universities: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(createAdCampaign, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <Select name="platform" required>
        <option value="Meta">Meta</option>
        <option value="Google">Google Ads</option>
        <option value="TikTok">TikTok</option>
        <option value="LinkedIn">LinkedIn</option>
      </Select>
      <Input name="country" placeholder="Target country" />
      <Select name="university_id">
        <option value="">Target university (optional)</option>
        {universities.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </Select>
      <Select name="budget_period">
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
      </Select>
      <Input name="planned_spend" type="number" step="0.01" placeholder="Planned spend" className="w-32" />
      <Input name="start_date" type="date" />
      <Input name="end_date" type="date" />
      <Button type="submit" variant="primary" pending={pending}>
        Add campaign
      </Button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
